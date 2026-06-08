const crypto = require('crypto');

function getTokenSecret() {
  return process.env.STRIPE_SECRET_KEY || process.env.GMAIL_APP_PASSWORD || 'glam-by-ankita-2026';
}

function verifyBookingToken(token) {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) throw new Error('Invalid token format');
  const payload = token.substring(0, lastDot);
  const sig = token.substring(lastDot + 1);
  const expected = crypto.createHmac('sha256', getTokenSecret()).update(payload).digest('base64url');
  if (sig !== expected) throw new Error('This link is invalid or has been tampered with.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });

  // Old hex tokens (64 chars) — these were never saved to DB, they expired
  if (/^[a-f0-9]{64}$/.test(token)) {
    return res.status(404).json({ error: 'This link has expired. Please contact Ankita for a new one.' });
  }

  try {
    const data = verifyBookingToken(token);
    res.json({
      confirmed_data: data.confirmedData || {},
      client_name: data.clientName || '',
      client_email: data.clientEmail || '',
      notes: data.notes || '',
      total_aud: data.totalAud || null,
      status: 'pending'
    });
  } catch (err) {
    return res.status(404).json({ error: err.message || 'Invalid or expired link.' });
  }
};
