const crypto = require('crypto');

function getPossibleSecrets() {
  const secrets = ['glam-by-ankita-2026'];
  if (process.env.GMAIL_APP_PASSWORD) secrets.unshift(process.env.GMAIL_APP_PASSWORD);
  if (process.env.STRIPE_SECRET_KEY) secrets.unshift(process.env.STRIPE_SECRET_KEY);
  return secrets;
}

function verifyBookingToken(token) {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) throw new Error('Invalid token format');
  const payload = token.substring(0, lastDot);
  const sig = token.substring(lastDot + 1);
  const secrets = getPossibleSecrets();
  const matched = secrets.some(secret => {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return sig === expected;
  });
  if (!matched) throw new Error('Invalid or tampered booking link.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

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
    const data = verifyBookingToken(token);

    const amount = parseFloat(data.totalAud);
    if (!amount || amount < 0.5) return res.status(400).json({ error: 'Invalid payment amount' });

    const amountCents = Math.round(amount * 100);
    const cd = data.confirmedData || {};

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'aud',
      automatic_payment_methods: { enabled: true },
      metadata: {
        client_name: (data.clientName || '').substring(0, 100),
        client_email: (data.clientEmail || '').substring(0, 200),
        service: (cd['Service'] || '').substring(0, 100),
        date: (cd['Date'] || '').substring(0, 20),
        time: (cd['Time'] || '').substring(0, 20),
        location: (cd['Location'] || '').substring(0, 200),
        num_people: String(cd['Number of People'] || '').substring(0, 20),
        notes: (data.notes || '').substring(0, 300)
      },
      receipt_email: data.clientEmail || undefined,
      description: `The Glam by Ankita — ${data.clientName || 'Client'}`
    });

    res.json({ client_secret: paymentIntent.client_secret });
  } catch (err) {
    console.error('create-payment-intent error:', err.message);
    if (err.message.includes('tampered') || err.message.includes('Invalid token')) {
      return res.status(400).json({ error: 'Invalid booking link. Please use the exact link from your email.' });
    }
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
