const { getPool, initDb } = require('./db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Payments not configured yet.' });
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    await initDb();
    const db = getPool();

    const result = await db.query(
      `SELECT bc.*, bs.client_name, bs.client_email
       FROM booking_confirmations bc
       JOIN booking_sessions bs ON bc.session_id = bs.id
       WHERE bc.token = $1`,
      [token]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Booking not found' });

    const booking = result.rows[0];
    if (booking.status === 'paid') return res.status(400).json({ error: 'Already paid' });

    const amountCents = Math.round(parseFloat(booking.deposit_aud) * 100);
    if (!amountCents || amountCents < 50) return res.status(400).json({ error: 'Invalid deposit amount' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'aud',
      metadata: { booking_token: token, client_name: booking.client_name || '' },
      receipt_email: booking.client_email || undefined
    });

    await db.query(
      'UPDATE booking_confirmations SET stripe_payment_intent_id = $1 WHERE token = $2',
      [paymentIntent.id, token]
    );

    res.json({ client_secret: paymentIntent.client_secret });
  } catch (err) {
    console.error('create-payment-intent error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
