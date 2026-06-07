import { Router } from "express";
import nodemailer from "nodemailer";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5 } });

const SITE_URL = "https://www.theglambyankita.com";

function createTransporter() {
  const user = process.env["GMAIL_USER"];
  const pass = process.env["GMAIL_APP_PASSWORD"];
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function toUrlSafeBase64(obj: object): string {
  const json = JSON.stringify(obj);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

router.post("/send-email", upload.array("files", 5), async (req, res) => {
  const transporter = createTransporter();

  if (!transporter) {
    res.status(503).json({ error: "Email not configured — GMAIL_USER and GMAIL_APP_PASSWORD are required." });
    return;
  }

  const { type, owner_email, from_email, ...fields } = req.body as Record<string, string>;
  const files = req.files as Express.Multer.File[] | undefined;

  const isBooking = type === "booking";
  const clientEmail = fields.client_email || fields.collab_email || from_email;
  const clientName = fields.first_name ? `${fields.first_name} ${fields.last_name || ""}`.trim() : (fields.name || "there");

  const subject = isBooking
    ? `New Booking Request from ${clientName}`
    : `New Collab Enquiry from ${clientName}`;

  const rows = Object.entries(fields)
    .filter(([k]) => !["owner_email", "from_email"].includes(k))
    .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:600;color:#6b3d2e;white-space:nowrap;background:#fdf0ee;">${k.replace(/_/g, " ")}</td><td style="padding:6px 12px;color:#2c1810;">${v || "—"}</td></tr>`)
    .join("");

  let reviewSection = "";
  if (isBooking) {
    const tokenData = {
      ...fields,
      _client_email: clientEmail,
      _client_name: clientName,
    };
    const token = toUrlSafeBase64(tokenData);
    const reviewUrl = `${SITE_URL}/r?b=${token}`;
    reviewSection = `
      <div style="padding:20px 32px;background:#f7e9d0;border-top:1px solid #e8c4bc;">
        <p style="margin:0 0 10px;font-size:0.9rem;font-weight:700;color:#6b3d2e;">📋 Review & Send Confirmation</p>
        <p style="margin:0 0 12px;font-size:0.85rem;color:#4a2e22;line-height:1.6;">Click the button below to review the booking details, make any edits, set your deposit amount and send the client their confirmation.</p>
        <a href="${reviewUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;font-family:sans-serif;font-weight:700;font-size:0.88rem;padding:12px 24px;border-radius:4px;">✦ Review Booking Request</a>
      </div>`;
  }

  const ownerHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
        <h2 style="margin:0;color:#fff;font-size:1.3rem;">${subject}</h2>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">Via The Glam by Ankita website</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">${rows}</table>
      ${files && files.length > 0 ? `<p style="padding:12px 16px;color:#6b3d2e;font-size:0.85rem;">📎 ${files.length} attachment(s) included.</p>` : ""}
      ${reviewSection}
    </div>`;

  const confirmationHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
        <h2 style="margin:0;color:#fff;font-size:1.3rem;">✨ ${isBooking ? "Booking Request Received!" : "Enquiry Received!"}</h2>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">The Glam by Ankita</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="font-size:1rem;color:#2c1810;margin:0 0 16px;">Hi ${clientName},</p>
        ${isBooking
          ? `<p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 16px;">Thank you so much for your booking request! 💄 I've received all your details and will be in touch within <strong>24–48 hours</strong> to confirm everything.</p>`
          : `<p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 16px;">Thank you for reaching out! ✨ I've received your enquiry and will review it and get back to you within <strong>48 hours</strong>.</p>`
        }
        <p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 24px;">In the meantime, feel free to follow along on Instagram <a href="https://instagram.com/theglambyankita" style="color:#c9a96e;text-decoration:none;">@theglambyankita</a> for the latest looks.</p>
        <p style="font-size:0.9rem;color:#6b3d2e;margin:0;">With love,<br><strong>Ankita</strong><br>The Glam by Ankita ✦</p>
      </div>
    </div>`;

  const attachments = (files || []).map((f) => ({
    filename: f.originalname,
    content: f.buffer,
    contentType: f.mimetype,
  }));

  try {
    await transporter.sendMail({
      from: `"The Glam by Ankita" <${process.env["GMAIL_USER"]}>`,
      to: owner_email,
      replyTo: clientEmail,
      subject,
      html: ownerHtml,
      attachments,
    });

    if (clientEmail) {
      await transporter.sendMail({
        from: `"The Glam by Ankita" <${process.env["GMAIL_USER"]}>`,
        to: clientEmail,
        subject: isBooking ? "Your booking request has been received 💄" : "Your enquiry has been received ✨",
        html: confirmationHtml,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ error: "Failed to send email." });
  }
});

router.post("/send-confirmation", async (req, res) => {
  const transporter = createTransporter();

  if (!transporter) {
    res.status(503).json({ error: "Email not configured — GMAIL_USER and GMAIL_APP_PASSWORD are required." });
    return;
  }

  const { client_name, client_email, confirmed_data, notes, total_aud } = req.body as {
    client_name: string;
    client_email: string;
    confirmed_data: Record<string, string>;
    notes?: string;
    total_aud: number;
  };

  if (!client_email) {
    res.status(400).json({ error: "Missing client email." });
    return;
  }

  const detailRows = Object.entries(confirmed_data)
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:600;color:#6b3d2e;white-space:nowrap;background:#fdf0ee;">${k}</td><td style="padding:6px 12px;color:#2c1810;">${v}</td></tr>`)
    .join("");

  const confirmHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
        <h2 style="margin:0;color:#fff;font-size:1.3rem;">💄 Your Booking is Confirmed!</h2>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">The Glam by Ankita</p>
      </div>
      <div style="padding:28px 32px 16px;">
        <p style="font-size:1rem;color:#2c1810;margin:0 0 16px;">Hi ${client_name || "there"},</p>
        <p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 20px;">I'm so excited to work with you! Here are your confirmed booking details:</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">${detailRows}</table>
      <div style="padding:16px 32px;background:#f7e9d0;border-top:1px solid #e8c4bc;">
        <p style="margin:0;font-size:1rem;font-weight:700;color:#6b3d2e;">Deposit: A$${Number(total_aud).toFixed(2)}</p>
        ${notes ? `<p style="margin:8px 0 0;font-size:0.88rem;color:#4a2e22;line-height:1.6;">${notes}</p>` : ""}
      </div>
      <div style="padding:24px 32px;">
        <p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 16px;">If you have any questions, just reply to this email and I'll get back to you. Can't wait to create something beautiful together! ✨</p>
        <p style="font-size:0.9rem;color:#6b3d2e;margin:0;">With love,<br><strong>Ankita</strong><br>The Glam by Ankita ✦</p>
      </div>
    </div>`;

  try {
    await transporter.sendMail({
      from: `"The Glam by Ankita" <${process.env["GMAIL_USER"]}>`,
      to: client_email,
      subject: "Your booking is confirmed! 💄",
      html: confirmHtml,
    });

    await transporter.sendMail({
      from: `"The Glam by Ankita" <${process.env["GMAIL_USER"]}>`,
      to: process.env["GMAIL_USER"]!,
      subject: `Confirmation sent to ${client_name}`,
      html: `<p style="font-family:sans-serif;color:#2c1810;">Confirmation email successfully sent to <strong>${client_name}</strong> (${client_email}) for A$${Number(total_aud).toFixed(2)} deposit.</p>`,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Send confirmation error:", err);
    res.status(500).json({ error: "Failed to send confirmation email." });
  }
});

export default router;
