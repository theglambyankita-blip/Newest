const { getPool, initDb } = require('./db');
const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const rawBody = await getRawBody(req);
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      event = JSON.parse(rawBody.toString());
    }
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const bookingToken = intent.metadata && intent.metadata.booking_token;

    try {
      await initDb();
      const db = getPool();

      if (bookingToken) {
        await db.query(
          "UPDATE booking_confirmations SET status = 'paid' WHERE token = $1",
          [bookingToken]
        );
      }

      const user = process.env.GMAIL_USER;
      const pass = process.env.GMAIL_APP_PASSWORD;

      if (user && pass) {
        const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

        const amountAud = (intent.amount / 100).toFixed(2);
        const clientName = intent.metadata && intent.metadata.client_name || 'Client';
        const clientEmail = intent.metadata && intent.metadata.client_email || intent.receipt_email || '';

        let bookingDetails = '';
        if (bookingToken) {
          const result = await db.query(
            'SELECT confirmed_data FROM booking_confirmations WHERE token = $1',
            [bookingToken]
          );
          if (result.rows[0] && result.rows[0].confirmed_data) {
            const data = result.rows[0].confirmed_data;
            bookingDetails = Object.entries(data)
              .filter(([, v]) => v)
              .map(([k, v]) => `<tr><td style="padding:8px 14px;font-size:0.82rem;font-weight:700;color:#9a7060;width:40%;background:#fdf0ee;border-bottom:1px solid #fdeee8;">${k}</td><td style="padding:8px 14px;font-size:0.9rem;color:#2c1810;border-bottom:1px solid #fdeee8;">${v}</td></tr>`)
              .join('');
          }
        }

        await transporter.sendMail({
          from: `"The Glam by Ankita" <${user}>`,
          to: user,
          subject: `💰 Payment received — ${clientName} paid AUD $${amountAud}`,
          html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5ede8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ede8;padding:32px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <tr>
          <td style="background:linear-gradient(135deg,#2e7d32 0%,#1b5e20 100%);padding:28px 32px;">
            <p style="margin:0 0 4px;font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.15em;">The Glam by Ankita</p>
            <h1 style="margin:0;font-size:1.5rem;font-weight:700;color:#fff;line-height:1.2;">💰 Payment Received!</h1>
            <p style="margin:8px 0 0;font-size:0.9rem;color:rgba(255,255,255,0.9);">${clientName} has completed their payment.</p>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fff0;border:1px solid #c8e6c9;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:20px 24px;text-align:center;">
                  <p style="margin:0 0 4px;font-size:0.78rem;font-weight:700;color:#2e7d32;text-transform:uppercase;letter-spacing:0.1em;">Amount Received</p>
                  <p style="margin:0;font-size:2.2rem;font-weight:700;color:#1b5e20;">AUD $${amountAud}</p>
                  ${clientEmail ? `<p style="margin:6px 0 0;font-size:0.85rem;color:#388e3c;">From: ${clientEmail}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${bookingDetails ? `
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 10px;font-size:0.75rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.12em;">Booking Details</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">
              ${bookingDetails}
            </table>
          </td>
        </tr>` : ''}

        <tr>
          <td style="padding:24px 32px;">
            <p style="margin:0;font-size:0.88rem;color:#4a2e22;line-height:1.7;">The payment has been confirmed and the booking is now locked in. You can view all payments in your <a href="https://dashboard.stripe.com/payments" style="color:#c9a96e;">Stripe dashboard</a>.</p>
          </td>
        </tr>

        <tr>
          <td style="background:#fdf0ee;padding:14px 32px;border-top:1px solid #f0ddd8;text-align:center;">
            <p style="margin:0;font-size:0.75rem;color:#b09080;">The Glam by Ankita — theglambyankita.com</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
        });
      }
    } catch (err) {
      console.error('Webhook DB/email error:', err);
    }
  }

  res.json({ received: true });
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
