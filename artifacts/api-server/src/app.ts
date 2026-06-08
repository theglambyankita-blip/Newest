import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import nodemailer from "nodemailer";
import Stripe from "stripe";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── STRIPE WEBHOOK (must be before express.json()) ───────────────
app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
  const sig = req.headers["stripe-signature"];

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
    const clientName = pi.metadata?.client_name || "Client";
    const clientEmail = pi.metadata?.client_email || "";
    const amountAud = (pi.amount / 100).toFixed(2);

    const gmailUser = process.env["GMAIL_USER"];
    const gmailPass = process.env["GMAIL_APP_PASSWORD"];
    if (gmailUser && gmailPass) {
      const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
      await transporter.sendMail({
        from: `"The Glam by Ankita" <${gmailUser}>`,
        to: gmailUser,
        subject: `💳 Payment received from ${clientName}`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:18px 24px;">
            <h2 style="margin:0;color:#fff;font-size:1rem;">✅ Payment Received — A$${amountAud}</h2>
          </div>
          <div style="padding:18px 24px;">
            <p style="color:#2c1810;font-size:0.9rem;margin:0 0 6px;">Client: <strong>${clientName}</strong></p>
            ${clientEmail ? `<p style="color:#6b3d2e;font-size:0.85rem;margin:0;">Email: ${clientEmail}</p>` : ""}
            <p style="color:#4a2e22;font-size:0.85rem;margin:12px 0 0;">Payment of <strong>A$${amountAud}</strong> successfully received via Stripe.</p>
          </div>
        </div>`,
      }).catch((e) => console.error("Webhook email error:", e));
    }
  }

  res.json({ received: true });
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
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

// Redirect /p?b=TOKEN → serve via frontend (already handled there)
app.get("/p", (req, res) => {
  res.redirect(302, `/?page=booking&b=${req.query.b || ""}`);
});

app.use("/api", router);

export default app;
