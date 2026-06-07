const { getPool, initDb } = require('./db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { booking_data, client_name, client_email, confirmed_data, notes, total_aud } = req.body;
  if (!confirmed_data) return res.status(400).json({ error: 'confirmed_data required' });

  const resolvedClientName = client_name || confirmed_data['First Name'] || 'Client';
  const resolvedClientEmail = client_email || confirmed_data['Email'] || '';

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Booking system not configured — DATABASE_URL is missing.' });
  }

  try {
    const clientToken = crypto.randomBytes(32).toString('hex');

    // DB save is mandatory — if it fails we must NOT send the client a useless link
    try {
      await Promise.race([
        initDb(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB connection timeout')), 8000))
      ]);
      const db = getPool();
      const sessionResult = await Promise.race([
        db.query(
          `INSERT INTO booking_sessions (token, booking_data, client_name, client_email, status)
           VALUES ($1, $2, $3, $4, 'confirmed') RETURNING id`,
          [crypto.randomBytes(12).toString('hex'), JSON.stringify(booking_data || {}), resolvedClientName, resolvedClientEmail]
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB query timeout')), 8000))
      ]);
      const sessionId = sessionResult.rows[0].id;
      await Promise.race([
        db.query(
          `INSERT INTO booking_confirmations (token, session_id, confirmed_data, notes, total_aud, deposit_aud)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [clientToken, sessionId, JSON.stringify(confirmed_data), notes || '', total_aud || null, null]
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB query timeout')), 8000))
      ]);
    } catch (dbErr) {
      console.error('DB save failed:', dbErr.message);
      return res.status(500).json({ error: 'Failed to save booking (' + dbErr.message + '). Please try again.' });
    }

    const siteUrl = 'https://www.theglambyankita.com';
    const clientLink = `${siteUrl}/p/${clientToken}`;

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (user && pass && resolvedClientEmail) {
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

      const firstName = confirmed_data['First Name'] || resolvedClientName;
      const amountDisplay = total_aud ? `AUD $${parseFloat(total_aud).toFixed(2)}` : null;

      const detailRows = Object.entries(confirmed_data)
        .filter(([, v]) => v)
        .map(([k, v]) => `
          <tr>
            <td style="padding:10px 16px;font-size:0.82rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;width:38%;border-bottom:1px solid #fdeee8;">${k}</td>
            <td style="padding:10px 16px;font-size:0.92rem;color:#2c1810;border-bottom:1px solid #fdeee8;">${v}</td>
          </tr>`)
        .join('');

      const clientHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Booking — The Glam by Ankita</title>
</head>
<body style="margin:0;padding:0;background:#f5ede8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ede8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <tr>
          <td style="background:linear-gradient(135deg,#c9a96e 0%,#9e7c4a 100%);padding:0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:32px 36px 20px;">
                  <p style="margin:0 0 6px;font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.15em;">The Glam by Ankita</p>
                  <h1 style="margin:0;font-size:1.7rem;font-weight:700;color:#fff;line-height:1.2;">Your Booking is<br>Confirmed! ✨</h1>
                </td>
              </tr>
              <tr><td style="background:rgba(255,255,255,0.18);height:4px;"></td></tr>
              <tr>
                <td style="padding:14px 36px 28px;">
                  <p style="margin:0;font-size:0.88rem;color:rgba(255,255,255,0.9);line-height:1.6;">One last step — confirm your details and complete your payment to lock in your date 💄</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 36px 0;">
            <p style="margin:0;font-size:1rem;color:#2c1810;line-height:1.7;">Hi <strong>${firstName}</strong>,</p>
            <p style="margin:10px 0 0;font-size:0.95rem;color:#4a2e22;line-height:1.8;">I am so excited to work with you! Please review your booking details below, then click the button to confirm and complete your payment. Once that's done your date is officially locked in 🎉</p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 36px 0;">
            <p style="margin:0 0 10px;font-size:0.75rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.12em;">Booking Details</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fdeee8;border-radius:6px;overflow:hidden;font-size:0.9rem;">
              ${detailRows}
            </table>
          </td>
        </tr>

        ${notes ? `
        <tr>
          <td style="padding:20px 36px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#fff8f0;border-left:3px solid #c9a96e;border-radius:0 6px 6px 0;padding:14px 18px;">
                  <p style="margin:0 0 4px;font-size:0.75rem;font-weight:700;color:#c9a96e;text-transform:uppercase;letter-spacing:0.1em;">A note from Ankita</p>
                  <p style="margin:0;font-size:0.92rem;color:#4a2e22;line-height:1.7;">${notes}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        ${amountDisplay ? `
        <tr>
          <td style="padding:20px 36px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f4;border:1px solid #f0ddd8;border-radius:6px;overflow:hidden;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;font-size:0.75rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.1em;">Total Amount Due</p>
                  <p style="margin:4px 0 0;font-size:1.8rem;font-weight:700;color:#9e7c4a;">${amountDisplay}</p>
                  <p style="margin:6px 0 0;font-size:0.8rem;color:#b09080;">Pay securely by card, Apple Pay, Google Pay &amp; more</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <tr>
          <td style="padding:28px 36px 8px;text-align:center;">
            <a href="${clientLink}" style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;padding:16px 40px;border-radius:5px;font-size:1rem;font-weight:700;letter-spacing:0.05em;box-shadow:0 4px 14px rgba(158,124,74,0.35);">
              Confirm Booking &amp; Pay ✦
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:10px 36px 0;text-align:center;">
            <p style="margin:0;font-size:0.78rem;color:#b09080;">Button not working? Copy and paste this link into your browser:</p>
            <p style="margin:4px 0 0;font-size:0.78rem;"><a href="${clientLink}" style="color:#c9a96e;word-break:break-all;">${clientLink}</a></p>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 36px 32px;">
            <p style="margin:0;font-size:0.92rem;color:#4a2e22;line-height:1.8;">Can't wait to make you look and feel absolutely stunning 💛<br><br>With love,<br><strong style="color:#9e7c4a;">Ankita</strong><br><span style="font-size:0.85rem;color:#9a7060;">The Glam by Ankita</span></p>
          </td>
        </tr>

        <tr>
          <td style="background:#fdf0ee;padding:16px 36px;border-top:1px solid #f0ddd8;text-align:center;">
            <p style="margin:0;font-size:0.75rem;color:#b09080;line-height:1.6;">This link is unique to you and expires once used.<br>Questions? Reply to this email or visit <a href="https://www.theglambyankita.com" style="color:#c9a96e;">theglambyankita.com</a></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

      await transporter.sendMail({
        from: `"The Glam by Ankita" <${user}>`,
        to: resolvedClientEmail,
        subject: `✨ Confirm Your Booking & Complete Payment — The Glam by Ankita`,
        html: clientHtml
      });
    }

    res.json({ ok: true, client_token: clientToken });
  } catch (err) {
    console.error('send-confirmation error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
