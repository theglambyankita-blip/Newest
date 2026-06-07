import { Router } from "express";
import nodemailer from "nodemailer";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5 } });

const SITE_URL = "https://www.theglambyankita.com";
const API_BASE = `${SITE_URL}/api`;

function createTransporter() {
  const user = process.env["GMAIL_USER"];
  const pass = process.env["GMAIL_APP_PASSWORD"];
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}

function toUrlSafeBase64(obj: object): string {
  const json = JSON.stringify(obj);
  return Buffer.from(json, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromUrlSafeBase64(token: string): Record<string, unknown> {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - b64.length % 4) % 4;
  return JSON.parse(Buffer.from(b64 + "=".repeat(pad), "base64").toString("utf8"));
}

// ── REVIEW PAGE (served directly by API) ────────────────────────
router.get("/review", (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).send("<h2>No booking token. Please use the link from your email.</h2>");
    return;
  }

  let d: Record<string, string> = {};
  try {
    d = fromUrlSafeBase64(token) as Record<string, string>;
  } catch {
    res.status(400).send("<h2>Invalid booking link. Please use the link from your email.</h2>");
    return;
  }

  const labelMap: Record<string, string> = {
    first_name: "First Name", last_name: "Last Name", client_email: "Email",
    phone: "Phone", contact_method: "Preferred Contact", preferred_date: "Requested Date",
    num_people: "Number of People", services: "Services Requested", location: "Location / Suburb",
    postcode: "Postcode", referral: "How They Found You", vision: "Look / Vision / Inspo",
  };
  const skip = new Set(["owner_email", "from_email", "_client_email", "_client_name", "type"]);

  const submissionRows = Object.entries(d)
    .filter(([k, v]) => !skip.has(k) && v)
    .map(([k, v]) => `<tr>
      <td style="padding:8px 14px;font-weight:700;color:#6b3d2e;white-space:nowrap;background:#fdf5f0;border-bottom:1px solid #f0ddd6;">${labelMap[k] || k.replace(/_/g, " ")}</td>
      <td style="padding:8px 14px;color:#2c1810;border-bottom:1px solid #f0ddd6;">${String(v)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review Booking · The Glam by Ankita</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fdf8f4;color:#2c1810;min-height:100vh}
  .logo{display:flex;align-items:center;gap:10px;padding:20px 24px;border-bottom:1px solid #e8c4bc;background:#fff;}
  .logo-text{font-family:Georgia,serif;font-size:1.1rem;color:#6b3d2e;font-style:italic;}
  .header{background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:28px 24px 22px;color:#fff;}
  .header h1{font-family:Georgia,serif;font-size:1.5rem;margin-bottom:4px;}
  .header p{font-size:0.85rem;opacity:0.88;}
  .body{max-width:620px;margin:0 auto;padding:20px 16px 60px;}
  .card{background:#fff;border:1px solid #e8c4bc;border-radius:10px;margin-bottom:18px;overflow:hidden;}
  .card-title{padding:14px 20px 12px;font-family:Georgia,serif;font-size:1rem;color:#6b3d2e;border-bottom:1px solid #f0ddd6;background:#fdf5f0;}
  .card-body{padding:18px 20px;}
  table{width:100%;border-collapse:collapse;font-size:0.88rem;}
  .field{margin-bottom:14px;}
  .field:last-child{margin-bottom:0;}
  label{display:block;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;}
  input,textarea,select{width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;outline:none;transition:border-color .2s;}
  input:focus,textarea:focus,select:focus{border-color:#c9a96e;}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  textarea{resize:vertical;min-height:90px;}
  .deposit-card{border:2px solid #c9a96e;background:linear-gradient(135deg,#fff9f0,#fdf5e8);}
  .deposit-card .card-title{background:linear-gradient(135deg,#f7e9cc,#f0ddb8);border-bottom-color:#e0c4a0;}
  .deposit-input{font-size:1.2rem!important;font-weight:700;color:#6b3d2e!important;}
  .btn{display:block;width:100%;padding:16px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:700;font-family:Georgia,serif;cursor:pointer;margin-top:8px;letter-spacing:0.03em;transition:opacity .2s;}
  .btn:hover{opacity:0.92;}
  .btn:disabled{opacity:0.55;cursor:not-allowed;}
  .error{background:#fff0f0;border:1px solid #f5c0c0;border-radius:6px;padding:12px 16px;color:#c0392b;font-size:0.88rem;margin-bottom:16px;display:none;}
  .success{background:#f0fff4;border:1px solid #a8e6b8;border-radius:10px;padding:32px 24px;text-align:center;display:none;}
  .success h2{font-family:Georgia,serif;color:#2c6e3f;margin-bottom:10px;}
  .success p{color:#3a6b47;font-size:0.92rem;line-height:1.7;}
  .raw-card .card-title{background:#fff9f0;border-color:#e8d5a0;}
  @media(max-width:480px){.row{grid-template-columns:1fr;}}
</style>
</head>
<body>
<div class="logo">
  <img src="${SITE_URL}/logo.png" width="36" height="36" style="border-radius:50%;object-fit:cover;" alt="">
  <span class="logo-text">The Glam by Ankita</span>
</div>
<div class="header">
  <h1>Review Booking Request</h1>
  <p>Check what the client submitted, confirm the details, set your deposit, then send their confirmation.</p>
</div>
<div class="body">

  <div class="card raw-card">
    <div class="card-title">📋 What the Client Submitted</div>
    <table>${submissionRows || "<tr><td style='padding:14px;color:#999;'>No data found.</td></tr>"}</table>
  </div>

  <div class="card">
    <div class="card-title">Confirm Client Details <span style="font-family:sans-serif;font-weight:400;font-size:0.72rem;color:#999;">(edit if needed)</span></div>
    <div class="card-body">
      <div class="row">
        <div class="field"><label>First Name</label><input type="text" id="f-first" value="${esc(d.first_name || "")}"></div>
        <div class="field"><label>Last Name</label><input type="text" id="f-last" value="${esc(d.last_name || "")}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Email</label><input type="email" id="f-email" value="${esc(d._client_email || d.client_email || "")}"></div>
        <div class="field"><label>Phone</label><input type="tel" id="f-phone" value="${esc(d.phone || "")}"></div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Confirm Booking Details <span style="font-family:sans-serif;font-weight:400;font-size:0.72rem;color:#999;">(edit if needed)</span></div>
    <div class="card-body">
      <div class="row">
        <div class="field"><label>Confirmed Date</label><input type="date" id="f-date" value="${esc(d.preferred_date || "")}"></div>
        <div class="field"><label>Time</label><input type="time" id="f-time" value="${esc(d.time || "")}"></div>
      </div>
      <div class="field"><label>Service</label><input type="text" id="f-service" value="${esc(d.services || d.service || "")}"></div>
      <div class="row">
        <div class="field"><label>Number of People</label><input type="number" id="f-people" value="${esc(d.num_people || "")}" min="1"></div>
        <div class="field"><label>Location / Address</label><input type="text" id="f-location" value="${esc(d.location || "")}"></div>
      </div>
    </div>
  </div>

  <div class="card deposit-card">
    <div class="card-title">💰 Set Deposit Amount</div>
    <div class="card-body">
      <div class="field">
        <label>Amount to Charge (AUD $)</label>
        <input type="number" id="f-total" min="0" step="0.01" placeholder="e.g. 150" class="deposit-input">
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Personal Note to Client <span style="font-family:sans-serif;font-weight:400;font-size:0.72rem;color:#999;">(optional)</span></div>
    <div class="card-body">
      <div class="field">
        <textarea id="f-notes" placeholder="e.g. So excited to work with you! Please arrive with a clean face and no eye makeup…"></textarea>
      </div>
    </div>
  </div>

  <div class="error" id="err"></div>
  <div class="success" id="success">
    <h2>✅ Confirmation Sent!</h2>
    <p>The client has been emailed their confirmed booking details and payment link.<br>You'll also receive a copy for your records.</p>
  </div>
  <button class="btn" id="send-btn" onclick="sendIt()">Send Confirmation to Client ✦</button>

</div>
<script>
async function sendIt() {
  const btn = document.getElementById('send-btn');
  const err = document.getElementById('err');
  err.style.display = 'none';

  const total = parseFloat(document.getElementById('f-total').value);
  if (!total || total <= 0) {
    err.textContent = 'Please enter a deposit amount before sending.';
    err.style.display = 'block';
    return;
  }
  const email = document.getElementById('f-email').value.trim();
  if (!email) {
    err.textContent = 'Client email is required.';
    err.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending…';

  const firstName = document.getElementById('f-first').value.trim();
  const lastName = document.getElementById('f-last').value.trim();
  const clientName = (firstName + ' ' + lastName).trim() || 'there';

  const confirmed = {
    'Service': document.getElementById('f-service').value,
    'Date': document.getElementById('f-date').value,
    'Time': document.getElementById('f-time').value,
    'People': document.getElementById('f-people').value,
    'Location': document.getElementById('f-location').value,
    'Client Name': clientName,
    'Phone': document.getElementById('f-phone').value,
  };

  try {
    const res = await fetch('${API_BASE}/send-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: clientName,
        client_email: email,
        confirmed_data: confirmed,
        notes: document.getElementById('f-notes').value.trim(),
        total_aud: total,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed');
    document.getElementById('success').style.display = 'block';
    btn.style.display = 'none';
  } catch (e) {
    err.textContent = 'Could not send — please try again or email the client directly.';
    err.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Send Confirmation to Client ✦';
  }
}
</script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── GET BOOKING (decode token for client payment page) ──────────
router.get("/get-booking", (req, res) => {
  const token = req.query.token as string;
  if (!token) { res.status(400).json({ error: "Missing token" }); return; }
  try {
    res.json(fromUrlSafeBase64(token));
  } catch {
    res.status(400).json({ error: "Invalid or expired booking link." });
  }
});

// ── CONFIG (Stripe publishable key) ────────────────────────────
router.get("/config", (_req, res) => {
  res.json({ stripePublishableKey: process.env["STRIPE_PUBLISHABLE_KEY"] || null });
});

// ── SELECT CASH ─────────────────────────────────────────────────
router.post("/select-cash", (_req, res) => {
  res.json({ ok: true });
});

// ── SEND BOOKING EMAIL (initial contact form) ───────────────────
router.post("/send-email", upload.array("files", 5), async (req, res) => {
  const transporter = createTransporter();
  if (!transporter) {
    res.status(503).json({ error: "Email not configured." });
    return;
  }

  const { type, owner_email, from_email, ...fields } = req.body as Record<string, string>;
  const files = req.files as Express.Multer.File[] | undefined;

  const isBooking = type === "booking";
  const clientEmail = fields.client_email || fields.collab_email || from_email;
  const clientName = fields.first_name
    ? `${fields.first_name} ${fields.last_name || ""}`.trim()
    : fields.name || "there";

  const subject = isBooking
    ? `New Booking Request from ${clientName}`
    : `New Collab Enquiry from ${clientName}`;

  const rows = Object.entries(fields)
    .filter(([k]) => !["owner_email", "from_email"].includes(k))
    .map(([k, v]) => `<tr>
      <td style="padding:6px 12px;font-weight:600;color:#6b3d2e;white-space:nowrap;background:#fdf0ee;">${k.replace(/_/g, " ")}</td>
      <td style="padding:6px 12px;color:#2c1810;">${v || "—"}</td>
    </tr>`).join("");

  let reviewSection = "";
  if (isBooking) {
    const tokenData = { ...fields, _client_email: clientEmail, _client_name: clientName };
    const token = toUrlSafeBase64(tokenData);
    const reviewUrl = `${API_BASE}/review?token=${token}`;
    reviewSection = `
      <div style="padding:22px 32px;background:#f7e9d0;border-top:1px solid #e8c4bc;text-align:center;">
        <p style="margin:0 0 8px;font-size:0.95rem;font-weight:700;color:#6b3d2e;">📋 Review this booking request</p>
        <p style="margin:0 0 16px;font-size:0.85rem;color:#4a2e22;line-height:1.6;">Set the deposit amount and send the client their confirmation + payment link.</p>
        <a href="${reviewUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;font-family:Georgia,serif;font-weight:700;font-size:1rem;padding:14px 32px;border-radius:6px;letter-spacing:0.02em;">✦ Review Booking Request</a>
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
          : `<p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 16px;">Thank you for reaching out! ✨ I'll review your enquiry and get back to you within <strong>48 hours</strong>.</p>`
        }
        <p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 24px;">In the meantime, follow along on Instagram <a href="https://instagram.com/theglambyankita" style="color:#c9a96e;text-decoration:none;">@theglambyankita</a> for the latest looks.</p>
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

// ── SEND CONFIRMATION + PAYMENT LINK TO CLIENT ──────────────────
router.post("/send-confirmation", async (req, res) => {
  const transporter = createTransporter();
  if (!transporter) {
    res.status(503).json({ error: "Email not configured." });
    return;
  }

  const { client_name, client_email, confirmed_data, notes, total_aud } = req.body as {
    client_name: string;
    client_email: string;
    confirmed_data: Record<string, string>;
    notes?: string;
    total_aud: number;
  };

  if (!client_email) { res.status(400).json({ error: "Missing client email." }); return; }

  const paymentToken = toUrlSafeBase64({
    confirmed_data,
    total_aud: Number(total_aud),
    notes: notes || "",
    client_name,
    client_email,
    status: "pending",
  });
  const paymentUrl = `${SITE_URL}/p?b=${paymentToken}`;

  const detailRows = Object.entries(confirmed_data)
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr>
      <td style="padding:6px 14px;font-weight:600;color:#6b3d2e;white-space:nowrap;background:#fdf0ee;">${k}</td>
      <td style="padding:6px 14px;color:#2c1810;">${v}</td>
    </tr>`).join("");

  const clientHtml = `
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
      ${notes ? `<div style="padding:14px 32px;background:#fff9f0;border-top:1px solid #e8c4bc;"><p style="margin:0;font-size:0.88rem;color:#4a2e22;line-height:1.6;font-style:italic;">💬 ${notes}</p></div>` : ""}
      <div style="padding:22px 32px;background:#f7e9d0;border-top:1px solid #e8c4bc;text-align:center;">
        <p style="margin:0 0 4px;font-size:1rem;font-weight:700;color:#6b3d2e;">Deposit: A$${Number(total_aud).toFixed(2)}</p>
        <p style="margin:0 0 16px;font-size:0.85rem;color:#4a2e22;">Please complete your deposit to secure your appointment.</p>
        <a href="${paymentUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;font-family:Georgia,serif;font-weight:700;font-size:0.95rem;padding:14px 32px;border-radius:6px;">✦ Review Details & Pay Deposit</a>
      </div>
      <div style="padding:24px 32px;">
        <p style="font-size:0.9rem;color:#6b3d2e;margin:0;">With love,<br><strong>Ankita</strong><br>The Glam by Ankita ✦</p>
      </div>
    </div>`;

  const ownerNotifyHtml = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:18px 24px;">
        <h2 style="margin:0;color:#fff;font-size:1rem;">✅ Confirmation sent to ${client_name}</h2>
      </div>
      <div style="padding:18px 24px;">
        <p style="color:#2c1810;font-size:0.9rem;margin:0 0 6px;">Deposit: <strong>A$${Number(total_aud).toFixed(2)}</strong></p>
        <p style="color:#6b3d2e;font-size:0.85rem;margin:0;">Client: ${client_email}</p>
      </div>
    </div>`;

  try {
    await transporter.sendMail({
      from: `"The Glam by Ankita" <${process.env["GMAIL_USER"]}>`,
      to: client_email,
      subject: "Your booking is confirmed! 💄",
      html: clientHtml,
    });
    await transporter.sendMail({
      from: `"The Glam by Ankita" <${process.env["GMAIL_USER"]}>`,
      to: process.env["GMAIL_USER"]!,
      subject: `Confirmation sent to ${client_name}`,
      html: ownerNotifyHtml,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Send confirmation error:", err);
    res.status(500).json({ error: "Failed to send confirmation email." });
  }
});

export default router;
