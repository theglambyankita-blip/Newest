const nodemailer = require('nodemailer');

function decodeToken(token) {
  const payload = token.includes('.') ? token.substring(0, token.lastIndexOf('.')) : token;
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - b64.length % 4) % 4;
  return JSON.parse(Buffer.from(b64 + '='.repeat(pad), 'base64').toString('utf8'));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  let booking;
  try {
    booking = decodeToken(token);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  const confirmedData = booking.confirmedData || booking.confirmed_data || {};
  const clientName = booking.clientName || booking.client_name || confirmedData['First Name'] || 'Client';
  const totalAud = booking.totalAud != null ? booking.totalAud : (booking.total_aud != null ? booking.total_aud : null);
  const amount = totalAud ? `AUD $${parseFloat(totalAud).toFixed(2)}` : 'TBC';

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (user && pass) {
    try {
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

      const detailRows = Object.entries(confirmedData)
        .filter(([, v]) => v)
        .map(([k, v]) => `<tr><td style="padding:8px 14px;font-size:0.82rem;font-weight:700;color:#9a7060;width:38%;background:#fdf0ee;border-bottom:1px solid #fdeee8;">${k}</td><td style="padding:8px 14px;font-size:0.9rem;color:#2c1810;border-bottom:1px solid #fdeee8;">${v}</td></tr>`)
        .join('');

      await transporter.sendMail({
        from: `"The Glam by Ankita" <${user}>`,
        to: user,
        subject: `💵 Cash payment selected — ${clientName}`,
        html: `
          <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:22px 28px;">
              <h2 style="margin:0;color:#fff;font-size:1.2rem;">💵 Cash Payment Selected</h2>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">The Glam by Ankita — Booking Notification</p>
            </div>
            <div style="padding:24px 28px;">
              <p style="margin:0 0 16px;font-size:0.95rem;color:#2c1810;"><strong>${clientName}</strong> has chosen to pay by <strong>cash</strong>.</p>
              <p style="margin:0 0 16px;font-size:0.95rem;color:#2c1810;">Amount to collect: <strong style="color:#9e7c4a;">${amount}</strong></p>
              <table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:20px;border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">
                ${detailRows}
              </table>
            </div>
          </div>`
      });
    } catch (emailErr) {
      console.error('select-cash email error:', emailErr);
    }
  }

  res.json({ ok: true });
};
