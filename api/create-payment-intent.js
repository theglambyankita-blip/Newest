const { getPool, initDb } = require('./db');

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Payments not configured yet.' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Booking system not configured.' });
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    await withTimeout(initDb(), 8000);
    const db = getPool();

    const result = await withTimeout(
      db.query(
        `SELECT bc.*, bs.client_name, bs.client_email
         FROM booking_confirmations bc
         JOIN booking_sessions bs ON bc.session_id = bs.id
         WHERE bc.token = $1`,
        [token]
      ),
      8000
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Booking not found' });

    const booking = result.rows[0];
    if (booking.status === 'paid') return res.status(400).json({ error: 'Already paid' });

    const amount = parseFloat(booking.total_aud);
    if (!amount || amount < 0.5) return res.status(400).json({ error: 'Invalid payment amount' });

    const amountCents = Math.round(amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'aud',
      automatic_payment_methods: { enabled: true },
      metadata: {
        booking_token: token,
        client_name: booking.client_name || '',
        client_email: booking.client_email || ''
      },
      receipt_email: booking.client_email || undefined,
      description: `The Glam by Ankita — ${booking.client_name || 'Client'}`
    });

    await withTimeout(
      db.query(
        'UPDATE booking_confirmations SET stripe_payment_intent_id = $1 WHERE token = $2',
        [paymentIntent.id, token]
      ),
      8000
    );

    res.json({ client_secret: paymentIntent.client_secret });
  } catch (err) {
    console.error('create-payment-intent error:', err.message);
    if (err.message === 'timeout') {
      return res.status(503).json({ error: 'Database timeout — please refresh and try again.' });
    }
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
