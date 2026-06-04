module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { d } = req.query;
  if (!d) return res.status(400).json({ error: 'Missing booking data' });

  try {
    const bookingData = JSON.parse(Buffer.from(d, 'base64url').toString('utf8'));
    res.json({ booking_data: bookingData });
  } catch (err) {
    console.error('get-review decode error:', err);
    res.status(400).json({ error: 'Invalid booking data' });
  }
};
