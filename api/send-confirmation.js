const { getPool, initDb } = require('./db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { session_token, confirmed_data, notes, total_aud, deposit_aud } = req.body;

  if (!session_token) return res.status(400).json({ error: 'session_token required' });

  try {
    await initDb();
    const db = getPool();

    const sessionResult = await db.query('SELECT * FROM booking_sessions WHERE token = $1', [session_token]);
    if (!sessionResult.rows[0]) return res.status(404).json({ error: 'Session not found' });
    const session = sessionResult.rows[0];

    const clientToken = crypto.randomBytes(32).toString('hex');

    await db.query(
      `INSERT INTO booking_confirmations (token, session_id, confirmed_data, notes, total_aud, deposit_aud)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [clientToken, session.id, JSON.stringify(confirmed_data || {}), notes || '', total_aud || null, deposit_aud || null]
    );
    await db.query("UPDATE booking_sessions SET status = 'confirmed' WHERE id = $1", [session.id]);

    const siteUrl = 'https://www.theglambyankita.com';
    const clientLink = `${siteUrl}/p/${clientToken}`;

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (user && pass && session.client_email) {
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

      const data = confirmed_data || {};
      const rows = Object.entries(data)
        .filter(([, v]) => v)
        .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:600;color:#6b3d2e;white-space:nowrap;background:#fdf0ee;">${k.replace(/_/g, ' ')}</td><td style="padding:6px 12px;color:#2c1810;">${v}</td></tr>`)
        .join('');

      const depositDisplay = deposit_aud ? `AUD $${parseFloat(deposit_aud).toFixed(2)}` : '';
      const totalDisplay = total_aud ? `AUD $${parseFloat(total_aud).toFixed(2)}` : '';

      const clientHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
            <h2 style="margin:0;color:#fff;font-size:1.3rem;">✨ Your Booking is Confirmed!</h2>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">The Glam by Ankita</p>
          </div>
          <div style="padding:28px 32px;">
            <p style="font-size:1rem;color:#2c1810;margin:0 0 16px;">Hi ${session.client_name || 'there'},</p>
            <p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 20px;">I'm so excited to work with you! Here are your confirmed booking details. Please review and complete your deposit to lock in your date 💄</p>
            <table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:20px;">${rows}</table>
            ${notes ? `<div style="background:#fff8f0;border-left:3px solid #c9a96e;padding:12px 16px;margin-bottom:20px;font-size:0.9rem;color:#4a2e22;border-radius:0 4px 4px 0;">${notes}</div>` : ''}
            ${deposit_aud ? `<p style="font-size:1rem;color:#2c1810;margin:0 0 4px;"><strong>Deposit required: ${depositDisplay}</strong></p>` : ''}
            ${total_aud ? `<p style="font-size:0.9rem;color:#6b3d2e;margin:0 0 20px;">Total: ${totalDisplay}</p>` : ''}
            <div style="text-align:center;margin:28px 0;">
              <a href="${clientLink}" style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;padding:14px 32px;border-radius:4px;font-weight:700;font-size:0.95rem;display:inline-block;letter-spacing:0.05em;">Confirm & Pay Deposit ✦</a>
            </div>
            <p style="font-size:0.82rem;color:#9a7060;text-align:center;margin:0 0 24px;">If the button doesn't work, copy this link:<br><a href="${clientLink}" style="color:#c9a96e;">${clientLink}</a></p>
            <p style="font-size:0.9rem;color:#6b3d2e;margin:0;">With love,<br><strong>Ankita</strong><br>The Glam by Ankita ✦</p>
          </div>
        </div>`;

      await transporter.sendMail({
        from: `"The Glam by Ankita" <${user}>`,
        to: session.client_email,
        subject: '✨ Your booking is confirmed — complete your deposit',
        html: clientHtml
      });
    }

    res.json({ ok: true, client_token: clientToken });
  } catch (err) {
    console.error('send-confirmation error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
