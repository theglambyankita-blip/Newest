const { getPool, initDb, getDbUrl } = require('./db');

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });

  if (!getDbUrl()) {
    return res.status(503).json({ error: 'Booking system not configured' });
  }

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
    res.json(result.rows[0]);
  } catch (err) {
    console.error('get-booking error:', err.message);
    if (err.message === 'timeout') {
      return res.status(503).json({ error: 'Database is taking too long to respond — please try again in a moment.' });
    }
    res.status(500).json({ error: 'Server error' });
  }
};
