import { Router } from "express";
import Stripe from "stripe";

const router = Router();

function fromUrlSafeBase64(token: string): Record<string, unknown> {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - b64.length % 4) % 4;
  return JSON.parse(Buffer.from(b64 + "=".repeat(pad), "base64").toString("utf8"));
}

router.post("/create-payment-intent", async (req, res) => {
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (!secretKey) {
    res.status(503).json({ error: "Stripe not configured." });
    return;
  }

  const { token } = req.body as { token?: string };
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

  const totalAud = Number(bookingData.total_aud);
  if (!totalAud || totalAud <= 0) {
    res.status(400).json({ error: "Invalid payment amount." });
    return;
  }

  const stripe = new Stripe(secretKey);
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAud * 100),
      currency: "aud",
      receipt_email: (bookingData.client_email as string) || undefined,
      metadata: {
        client_name: (bookingData.client_name as string) || "",
        client_email: (bookingData.client_email as string) || "",
      },
    });
    res.json({ client_secret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Stripe PaymentIntent error:", err);
    res.status(500).json({ error: "Could not create payment." });
  }
});

export default router;
