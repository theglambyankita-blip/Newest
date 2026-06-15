const { getPool } = require('./_db');
const nodemailer = require('nodemailer');

const SITE_URL = 'https://www.theglambyankita.com';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function validateToken(db, token) {
  if (!token) return false;
  try {
    const { rows } = await db.query(
      'SELECT id FROM admin_tokens WHERE token = $1 AND expires_at > NOW() LIMIT 1',
      [token]
    );
    return rows.length > 0;
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const db = getPool();
  const token = req.query.token;
  const valid = await validateToken(db, token);
  if (!valid) return res.status(403).json({ error: 'Unauthorized' });

  const { to, subject, body } = req.body || {};
  if (!to || !subject || !body) return res.status(400).json({ error: 'Missing required fields.' });

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return res.status(503).json({ error: 'Email not configured.' });

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

  const paragraphs = body
    .split('\n')
    .map((line) =>
      line.trim()
        ? `<p style="font-size:0.95rem;color:#4a2e22;line-height:1.75;margin:0 0 12px;">${esc(line)}</p>`
        : `<div style="height:8px;"></div>`
    )
    .join('');

  const html = `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
      <img src="${SITE_URL}/logo-original.png" width="40" height="40"
        style="border-radius:50%;object-fit:cover;display:block;margin-bottom:12px;" alt="">
      <h2 style="margin:0;color:#fff;font-family:Georgia,serif;font-size:1.3rem;">The Glam by Ankita</h2>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">✦ Beauty & Makeup Artist</p>
    </div>
    <div style="padding:28px 32px 8px;">${paragraphs}</div>
    <div style="padding:20px 32px 28px;">
      <p style="font-size:0.9rem;color:#6b3d2e;margin:0;">With love,<br><strong>Ankita</strong><br>The Glam by Ankita ✦</p>
    </div>
    <div style="padding:14px 32px;background:#fdf0ee;border-top:1px solid #e8c4bc;text-align:center;">
      <p style="margin:0;font-size:0.78rem;color:#9e7c4a;">
        <a href="https://instagram.com/theglambyankita" style="color:#c9a96e;text-decoration:none;">@theglambyankita</a>
        &nbsp;·&nbsp; theglambyankita@gmail.com
      </p>
    </div>
  </div>`;

  try {
    await transporter.sendMail({ from: `"The Glam by Ankita" <${user}>`, to, subject, html });
    res.json({ ok: true });
  } catch (e) {
    console.error('Admin send-email error:', e);
    res.status(500).json({ error: 'Failed to send email.' });
  }
};
