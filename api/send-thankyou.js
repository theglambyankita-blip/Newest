const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return res.status(503).json({ error: 'Email not configured' });

  const { clientName, clientEmail } = req.body || {};
  if (!clientName || !clientEmail) return res.status(400).json({ error: 'Name and email are required' });

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fdf6ef;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6ef;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <tr>
          <td style="background:linear-gradient(135deg,#c9a96e 0%,#e8d5b0 100%);padding:40px 40px 32px;text-align:center;">
            <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a5c2e;">The Glam by Ankita</p>
            <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;color:#3d2b1f;font-weight:normal;">Thank You, ${clientName}! 💄</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 20px;font-size:16px;color:#4a3728;line-height:1.7;">
              It was such a pleasure working with you! I truly hope you felt beautiful and confident, and that your look was everything you imagined.
            </p>
            <p style="margin:0 0 20px;font-size:16px;color:#4a3728;line-height:1.7;">
              It means the world to me when my clients leave feeling their best — and I'd love to create more beautiful looks for you in the future.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td style="border-top:1px solid #e8d5b0;"></td></tr></table>

            <p style="margin:0 0 8px;font-size:15px;color:#7a5c2e;font-weight:bold;text-align:center;letter-spacing:1px;">LOVED YOUR LOOK?</p>
            <p style="margin:0 0 24px;font-size:15px;color:#4a3728;line-height:1.7;text-align:center;">
              If you enjoyed your experience, a Google review would mean so much to me — it only takes 30 seconds and helps other brides &amp; clients find me! 🌟
            </p>

            <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:32px;">
              <a href="https://share.google/AUSrQuBkkzwzI6xgz"
                 style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#b8934a);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:6px;font-family:Georgia,serif;font-size:15px;font-weight:bold;letter-spacing:1px;">
                ⭐ Leave a Google Review
              </a>
            </td></tr></table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="border-top:1px solid #e8d5b0;"></td></tr></table>

            <p style="margin:0 0 20px;font-size:15px;color:#4a3728;line-height:1.7;">
              Don't forget to tag me in your photos — I'd love to feature you on my Instagram! 📸
            </p>
            <p style="margin:0 0 4px;font-size:15px;color:#4a3728;line-height:1.7;">Until next time, stay glam! ✨</p>
            <p style="margin:16px 0 0;font-size:16px;color:#7a5c2e;font-family:Georgia,serif;font-style:italic;">— Ankita x</p>
          </td>
        </tr>

        <tr>
          <td style="background:#fdf6ef;padding:24px 40px;text-align:center;border-top:1px solid #e8d5b0;">
            <p style="margin:0 0 8px;font-size:13px;color:#7a5c2e;letter-spacing:2px;text-transform:uppercase;">The Glam by Ankita</p>
            <p style="margin:0 0 8px;font-size:13px;color:#a0856a;">Melbourne, Victoria, Australia</p>
            <a href="https://theglambyankita.com" style="font-size:13px;color:#c9a96e;text-decoration:none;">theglambyankita.com</a>
            &nbsp;·&nbsp;
            <a href="https://instagram.com/theglambyankita" style="font-size:13px;color:#c9a96e;text-decoration:none;">@theglambyankita</a>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
    await transporter.sendMail({
      from: '"The Glam by Ankita" <theglambyankita@gmail.com>',
      to: clientEmail,
      subject: `Thank You for Your Booking with The Glam by Ankita 💄`,
      html
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-thankyou error:', err.message);
    return res.status(500).json({ error: 'Failed to send email' });
  }
};
