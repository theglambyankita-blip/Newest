import { Router } from "express";
import Stripe from "stripe";
import nodemailer from "nodemailer";
import { buildIcs } from "../lib/ics.js";
import { db, bookings } from "@workspace/db";

const router = Router();

const SITE_URL = "https://www.theglambyankita.com";

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
  const payload = token.includes(".") ? token.substring(0, token.lastIndexOf(".")) : token;
  const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - b64.length % 4) % 4;
  return JSON.parse(Buffer.from(b64 + "=".repeat(pad), "base64").toString("utf8"));
}

router.get("/config", (req, res) => {
  const isTest = req.query["test"] === "1";
  const stripePublishableKey = isTest
    ? (process.env["STRIPE_TEST_PUBLISHABLE_KEY"] ?? null)
    : (process.env["STRIPE_PUBLISHABLE_KEY"] ?? null);
  res.json({ stripePublishableKey, testMode: isTest });
});

router.post("/create-payment-intent", async (req, res) => {
  const { testMode } = req.body as { testMode?: boolean };
  const secretKey = testMode
    ? process.env["STRIPE_TEST_SECRET_KEY"]
    : process.env["STRIPE_SECRET_KEY"];
  if (!secretKey) {
    res.status(503).json({ error: testMode ? "Test Stripe keys not configured. Add STRIPE_TEST_SECRET_KEY and STRIPE_TEST_PUBLISHABLE_KEY as Replit secrets." : "Stripe not configured." });
    return;
  }

  const { token } = req.body as { token?: string; testMode?: boolean };
  if (!token) {
    res.status(400).json({ error: "Missing token." });
    return;
  }

  let bookingData: Record<string, unknown>;
  try {
    bookingData = fromUrlSafeBase64(token);
  } catch {
    res.status(400).json({ error: "Invalid booking token." });
    return;
  }

  const totalAud = Number(bookingData.total_aud ?? bookingData.totalAud ?? 0);
  if (!totalAud || totalAud <= 0) {
    res.status(400).json({ error: "Invalid payment amount." });
    return;
  }

  const amountCents = Math.round(totalAud * 100);
  if (amountCents < 50) {
    res.status(400).json({
      error: `The minimum card payment is A$0.50. This booking has a deposit of A$${totalAud.toFixed(2)} — please contact Ankita to arrange payment directly.`,
    });
    return;
  }

  const clientEmail = (bookingData.client_email || bookingData.clientEmail || "") as string;
  const clientName  = (bookingData.client_name  || bookingData.clientName  || "") as string;
  const cd = (bookingData.confirmed_data || bookingData.confirmedData || {}) as Record<string, string>;

  const stripe = new Stripe(secretKey);
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAud * 100),
      currency: "aud",
      automatic_payment_methods: { enabled: true },
      receipt_email: clientEmail || undefined,
      metadata: {
        client_name:      clientName,
        client_email:     clientEmail,
        booking_date:     cd["Date"]             || "",
        booking_time:     cd["Time"]             || "",
        booking_service:  cd["Service"]          || "",
        booking_location: cd["Location"]         || "",
        booking_people:   cd["Number of People"] || "",
        booking_token:    token.length <= 450 ? token : "",
      },
    });
    res.json({ client_secret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Stripe PaymentIntent error:", err);
    res.status(500).json({ error: "Could not create payment." });
  }
});

router.post("/confirm-payment", async (req, res) => {
  const { token, payment_intent_id, testMode } = req.body as { token?: string; payment_intent_id?: string; testMode?: boolean };

  res.json({ ok: true, testMode: !!testMode });

  if (!token) return;

  let bookingData: Record<string, unknown>;
  try {
    bookingData = fromUrlSafeBase64(token);
  } catch { return; }

  const clientName  = String(bookingData.client_name  || bookingData.clientName  || "");
  const clientEmail = String(bookingData.client_email || bookingData.clientEmail || "");
  const totalAud    = Number(bookingData.total_aud    || bookingData.totalAud    || 0);
  const cd = (bookingData.confirmed_data || bookingData.confirmedData || {}) as Record<string, string>;

  // Skip DB save and emails in test mode — no real booking, no real charge
  if (testMode) {
    console.log(`[TEST MODE] Payment confirmed for ${clientName} (${clientEmail}) A$${totalAud} — no DB insert, no emails sent.`);
    return;
  }

  // Save to DB
  db.insert(bookings).values({
    clientName:    clientName  || null,
    clientEmail:   clientEmail || null,
    service:       cd["Service"]          || null,
    bookingDate:   cd["Date"]             || null,
    bookingTime:   cd["Time"]             || null,
    location:      cd["Location"]         || null,
    numPeople:     cd["Number of People"] || null,
    totalAud:      totalAud ? String(totalAud) : null,
    paymentMethod: "card",
    status:        "confirmed",
  }).catch((e) => console.error("DB insert card booking error:", e));

  // Retrieve Stripe receipt URL from the PaymentIntent's charge
  let receiptUrl: string | null = null;
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (secretKey && payment_intent_id) {
    try {
      const stripe = new Stripe(secretKey);
      const pi = await stripe.paymentIntents.retrieve(payment_intent_id, {
        expand: ["latest_charge"],
      });
      const charge = pi.latest_charge as Stripe.Charge | null;
      receiptUrl = charge?.receipt_url || null;
    } catch (e) {
      console.error("Stripe receipt lookup error:", e);
    }
  }

  const transporter = createTransporter();
  if (!transporter || !clientEmail) return;

  // Build booking detail rows for email
  const detailRows = Object.entries(cd)
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr>
      <td style="padding:7px 16px;font-weight:600;color:#6b3d2e;white-space:nowrap;background:#fdf0ee;border-bottom:1px solid #f5ede9;">${k}</td>
      <td style="padding:7px 16px;color:#2c1810;border-bottom:1px solid #f5ede9;">${v}</td>
    </tr>`).join("");

  // Build .ics calendar attachment
  const bkDate     = cd["Date"]     || "";
  const bkTime     = cd["Time"]     || "";
  const bkService  = cd["Service"]  || "";
  const bkLocation = cd["Location"] || "";
  const icsBuffer  = bkDate ? buildIcs({
    uid:           `card-${Date.now()}-${clientEmail}@theglambyankita.com`,
    summary:       `The Glam by Ankita — ${bkService || "Appointment"}`,
    date:          bkDate,
    time:          bkTime     || undefined,
    location:      bkLocation || undefined,
    description:   [
      "The Glam by Ankita — Your Appointment",
      bkService  ? `Service: ${bkService}`   : "",
      bkLocation ? `Location: ${bkLocation}` : "",
      `Deposit paid: A$${totalAud.toFixed(2)} by card`,
      "Contact: theglambyankita@gmail.com",
    ].filter(Boolean).join("\\n"),
    organizerEmail: process.env["GMAIL_USER"],
    attendeeEmail:  clientEmail,
    attendeeName:   clientName,
  }) : null;

  // View-only booking link
  const viewToken = toUrlSafeBase64({
    confirmed_data: cd,
    total_aud:      totalAud,
    client_name:    clientName,
    client_email:   clientEmail,
    status:         "confirmed",
  });
  const viewUrl = `${SITE_URL}/p?b=${viewToken}&view=1`;

  // ── Client confirmation email ──────────────────────────────────
  const clientHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:26px 32px;">
        <h2 style="margin:0;color:#fff;font-size:1.3rem;">🎉 Deposit Paid — You're Booked!</h2>
        <p style="margin:5px 0 0;color:rgba(255,255,255,0.88);font-size:0.85rem;">The Glam by Ankita</p>
      </div>
      <div style="padding:28px 32px 16px;">
        <p style="font-size:1rem;color:#2c1810;margin:0 0 14px;">Hi ${clientName || "there"},</p>
        <p style="font-size:0.95rem;color:#4a2e22;line-height:1.75;margin:0 0 8px;">
          Your deposit of <strong>A$${totalAud.toFixed(2)}</strong> has been received — your appointment is officially locked in! I can't wait to work with you. ✨
        </p>
      </div>

      ${detailRows ? `<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">${detailRows}</table>` : ""}

      <div style="padding:24px 32px;background:#f7e9d0;border-top:1px solid #e8c4bc;text-align:center;">
        ${icsBuffer ? `<p style="margin:0 0 14px;font-size:0.84rem;color:#4a2e22;">📅 Your calendar invite is attached — tap it to add the appointment to your calendar.</p>` : ""}

        ${receiptUrl ? `
        <a href="${receiptUrl}" style="display:inline-block;background:#2c6e3f;color:#fff;text-decoration:none;font-family:Georgia,serif;font-weight:700;font-size:0.92rem;padding:13px 28px;border-radius:6px;margin-bottom:12px;">🧾 View Stripe Receipt</a>
        <br>
        ` : ""}

        <a href="${viewUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;font-family:Georgia,serif;font-weight:700;font-size:0.92rem;padding:13px 28px;border-radius:6px;">✦ View Your Booking</a>
      </div>

      <div style="padding:24px 32px;">
        <p style="font-size:0.9rem;color:#6b3d2e;margin:0;">With love,<br><strong>Ankita</strong><br>The Glam by Ankita ✦</p>
      </div>
    </div>`;

  // ── Ankita notification email ──────────────────────────────────
  const ownerHtml = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:18px 24px;">
        <h2 style="margin:0;color:#fff;font-size:1rem;">💳 Card Payment Received — ${clientName}</h2>
      </div>
      <div style="padding:18px 24px 8px;">
        <p style="color:#2c1810;font-size:0.9rem;margin:0 0 6px;"><strong>${clientName}</strong> paid the deposit by card.</p>
        ${clientEmail ? `<p style="color:#6b3d2e;font-size:0.85rem;margin:0 0 4px;">Email: ${clientEmail}</p>` : ""}
        <p style="color:#4a2e22;font-size:0.85rem;margin:0 0 4px;">Amount: <strong>A$${totalAud.toFixed(2)}</strong></p>
        ${receiptUrl ? `<p style="margin:8px 0 0;"><a href="${receiptUrl}" style="color:#c9a96e;font-size:0.85rem;">View Stripe receipt →</a></p>` : ""}
      </div>
      ${detailRows ? `<table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-top:8px;">${detailRows}</table>` : ""}
      <div style="padding:14px 24px;background:#f0fff4;border-top:1px solid #e8c4bc;">
        <p style="margin:0;font-size:0.82rem;color:#2c6e3f;">✅ Deposit confirmed. Booking is locked in.</p>
      </div>
    </div>`;

  // Send both emails (non-blocking)
  transporter.sendMail({
    from:        `"The Glam by Ankita" <${process.env["GMAIL_USER"]}>`,
    to:          clientEmail,
    subject:     `🎉 You're booked! Deposit received — The Glam by Ankita`,
    html:        clientHtml,
    attachments: icsBuffer ? [{ filename: "appointment.ics", content: icsBuffer, contentType: "text/calendar; charset=utf-8; method=REQUEST" }] : [],
  }).catch((e) => console.error("Card confirm client email error:", e));

  transporter.sendMail({
    from:    `"The Glam by Ankita" <${process.env["GMAIL_USER"]}>`,
    to:      process.env["GMAIL_USER"]!,
    subject: `💳 ${clientName} paid A$${totalAud.toFixed(2)} deposit by card`,
    html:    ownerHtml,
  }).catch((e) => console.error("Card confirm owner email error:", e));
});

export default router;
