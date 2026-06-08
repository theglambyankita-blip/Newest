import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import nodemailer from "nodemailer";
import Stripe from "stripe";
import router from "./routes";
import { logger } from "./lib/logger";
import { buildIcs } from "./lib/ics";

const SITE_URL = "https://www.theglambyankita.com";

function toUrlSafeBase64(obj: object): string {
  return Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const app: Express = express();

// ── STRIPE WEBHOOK (must be before express.json()) ───────────────
app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const secretKey     = process.env["STRIPE_SECRET_KEY"];
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
  const sig           = req.headers["stripe-signature"];

  if (!secretKey || !webhookSecret || !sig) {
    res.status(400).json({ error: "Missing Stripe config or signature." });
    return;
  }

  const stripe = new Stripe(secretKey);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      Array.isArray(sig) ? sig[0] : sig,
      webhookSecret
    );
  } catch (err) {
    console.error("Stripe webhook signature failed:", err);
    res.status(400).json({ error: "Webhook signature verification failed." });
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const clientName      = pi.metadata?.client_name      || "Client";
    const clientEmail     = pi.metadata?.client_email     || "";
    const amountAud       = (pi.amount / 100).toFixed(2);
    const bookingDate     = pi.metadata?.booking_date     || "";
    const bookingTime     = pi.metadata?.booking_time     || "";
    const bookingService  = pi.metadata?.booking_service  || "";
    const bookingLocation = pi.metadata?.booking_location || "";
    const bookingPeople   = pi.metadata?.booking_people   || "";
    const bookingToken    = pi.metadata?.booking_token    || "";

    const gmailUser = process.env["GMAIL_USER"];
    const gmailPass = process.env["GMAIL_APP_PASSWORD"];
    if (gmailUser && gmailPass) {
      const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });

      // Build "View Booking" token — use stored token if available, else reconstruct
      const viewToken = bookingToken || toUrlSafeBase64({
        confirmed_data: {
          ...(bookingDate     ? { Date:               bookingDate     } : {}),
          ...(bookingTime     ? { Time:               bookingTime     } : {}),
          ...(bookingService  ? { Service:            bookingService  } : {}),
          ...(bookingLocation ? { Location:           bookingLocation } : {}),
          ...(bookingPeople   ? { "Number of People": bookingPeople   } : {}),
        },
        total_aud:    pi.amount / 100,
        client_name:  clientName,
        client_email: clientEmail,
        status:       "confirmed",
      });
      const viewUrl = `${SITE_URL}/p?b=${viewToken}&view=1`;

      // Build detail rows for client email
      const rowEntries: [string, string][] = [];
      if (bookingDate)     rowEntries.push(["Date",              bookingDate]);
      if (bookingTime)     rowEntries.push(["Time",              bookingTime]);
      if (bookingService)  rowEntries.push(["Service",           bookingService]);
      if (bookingPeople)   rowEntries.push(["Number of People",  bookingPeople]);
      if (bookingLocation) rowEntries.push(["Location",          bookingLocation]);
      const detailRows = rowEntries
        .map(([k, v]) => `<tr><td style="padding:6px 14px;font-weight:600;color:#6b3d2e;background:#fdf0ee;white-space:nowrap;">${k}</td><td style="padding:6px 14px;color:#2c1810;">${v}</td></tr>`)
        .join("");

      // Build .ics calendar attachment
      const icsAttachments: nodemailer.SendMailOptions["attachments"] = [];
      if (bookingDate) {
        const icsContent = buildIcs({
          uid:           `stripe-${pi.id}@theglambyankita.com`,
          summary:       `The Glam by Ankita — ${bookingService || "Appointment"}`,
          date:          bookingDate,
          time:          bookingTime  || undefined,
          location:      bookingLocation || undefined,
          description:   [
            "The Glam by Ankita — Your Appointment",
            bookingService  ? `Service: ${bookingService}`   : "",
            bookingLocation ? `Location: ${bookingLocation}` : "",
            `Amount Paid: A$${amountAud}`,
            "Contact: theglambyankita@gmail.com",
          ].filter(Boolean).join("\\n"),
          organizerEmail: gmailUser,
          attendeeEmail:  clientEmail,
          attendeeName:   clientName,
        });
        icsAttachments.push({
          filename:    "appointment.ics",
          content:     icsContent,
          contentType: "text/calendar; charset=utf-8; method=REQUEST",
        });
      }

      // ── Confirmation email to client ─────────────────────────
      if (clientEmail) {
        const clientHtml = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
              <h2 style="margin:0;color:#fff;font-size:1.3rem;">✅ Payment Confirmed — You're All Set!</h2>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">The Glam by Ankita</p>
            </div>
            <div style="padding:28px 32px 16px;">
              <p style="font-size:1rem;color:#2c1810;margin:0 0 12px;">Hi ${clientName},</p>
              <p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 4px;">Your payment of <strong>A$${amountAud}</strong> has been received — your appointment is now fully confirmed. I can't wait to work with you! ✨</p>
            </div>
            ${detailRows ? `<table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-top:8px;">${detailRows}</table>` : ""}
            <div style="padding:22px 32px;background:#f7e9d0;border-top:1px solid #e8c4bc;text-align:center;">
              ${icsAttachments.length ? `<p style="margin:0 0 14px;font-size:0.85rem;color:#4a2e22;">📅 A calendar invite is attached — open it to add your appointment to your calendar.</p>` : ""}
              <a href="${viewUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;font-family:Georgia,serif;font-weight:700;font-size:0.95rem;padding:14px 32px;border-radius:6px;">✦ View Your Booking</a>
            </div>
            <div style="padding:24px 32px;">
              <p style="font-size:0.9rem;color:#6b3d2e;margin:0;">With love,<br><strong>Ankita</strong><br>The Glam by Ankita ✦</p>
            </div>
          </div>`;
        await transporter.sendMail({
          from:        `"The Glam by Ankita" <${gmailUser}>`,
          to:          clientEmail,
          subject:     "Your payment is confirmed — you're booked! 💄",
          html:        clientHtml,
          attachments: icsAttachments,
        }).catch((e) => console.error("Webhook client email error:", e));
      }

      // ── Notification email to owner ──────────────────────────
      await transporter.sendMail({
        from:    `"The Glam by Ankita" <${gmailUser}>`,
        to:      gmailUser,
        subject: `💳 Payment received from ${clientName} — A$${amountAud}`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:18px 24px;">
            <h2 style="margin:0;color:#fff;font-size:1rem;">✅ Payment Received — A$${amountAud}</h2>
          </div>
          <div style="padding:18px 24px;">
            <p style="color:#2c1810;font-size:0.9rem;margin:0 0 6px;">Client: <strong>${clientName}</strong></p>
            ${clientEmail     ? `<p style="color:#6b3d2e;font-size:0.85rem;margin:0 0 4px;">Email: ${clientEmail}</p>`       : ""}
            ${bookingDate     ? `<p style="color:#4a2e22;font-size:0.85rem;margin:0 0 4px;">Date: ${bookingDate}${bookingTime ? ` at ${bookingTime}` : ""}</p>` : ""}
            ${bookingService  ? `<p style="color:#4a2e22;font-size:0.85rem;margin:0;">Service: ${bookingService}</p>`        : ""}
            <p style="color:#4a2e22;font-size:0.85rem;margin:12px 0 0;">Payment of <strong>A$${amountAud}</strong> received via Stripe.</p>
          </div>
        </div>`,
      }).catch((e) => console.error("Webhook owner email error:", e));
    }
  }

  res.json({ received: true });
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Redirect old /r?b=TOKEN links → /api/review?token=TOKEN
app.get("/r", (req, res) => {
  const b = req.query.b as string;
  if (b) {
    res.redirect(302, `/api/review?token=${encodeURIComponent(b)}`);
  } else {
    res.redirect(302, "/");
  }
});

app.use("/api", router);

export default app;
