const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { getPool } = require('./db');

function generateBookingId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `GBA-${y}${m}${d}-${rand}`;
}

function decodeToken(token) {
  const payload = token.includes('.') ? token.substring(0, token.lastIndexOf('.')) : token;
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - b64.length % 4) % 4;
  return JSON.parse(Buffer.from(b64 + '='.repeat(pad), 'base64').toString('utf8'));
}

function buildCalendarSection(confirmedData, siteUrl) {
  const date = confirmedData['Date'] || confirmedData['Confirmed Date'] || '';
  const time = confirmedData['Time'] || '09:00';
  if (!date) return '';

  const service = confirmedData['Service'] || 'Makeup Appointment';
  const location = confirmedData['Location'] || '';
  const numPeople = confirmedData['Number of People'] || confirmedData['People'] || '';
  const title = `${service} — The Glam by Ankita`;
  const desc = [`Appointment with Ankita from The Glam by Ankita.`, `Service: ${service}`, numPeople ? `Number of people: ${numPeople}` : '', location ? `Location: ${location}` : ''].filter(Boolean).join('\n');

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = (time || '09:00').split(':').map(Number);
  const pad = n => String(n || 0).padStart(2, '0');
  const startDT = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
  const endH = (hour + 2) % 24;
  const endDT = `${year}${pad(month)}${pad(day)}T${pad(endH)}${pad(minute)}00`;

  const gCal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDT}/${endDT}&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(location)}`;
  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${date}T${pad(hour)}:${pad(minute)}:00&enddt=${date}T${pad(endH)}:${pad(minute)}:00&body=${encodeURIComponent(desc)}&location=${encodeURIComponent(location)}`;
  const ics = `${siteUrl}/api/calendar?${new URLSearchParams({ title, date, time: time || '09:00', location, description: desc })}`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f6ff;border:1px solid #c5d8f7;border-radius:6px;margin-top:8px;">
      <tr>
        <td style="padding:14px 20px;text-align:center;">
          <p style="margin:0 0 10px;font-size:0.75rem;font-weight:700;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.1em;">📅 Add to your calendar</p>
          <a href="${gCal}" target="_blank" style="display:inline-block;margin:3px;background:#4285f4;color:#fff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:0.8rem;font-weight:700;">Google Calendar</a>
          <a href="${outlook}" target="_blank" style="display:inline-block;margin:3px;background:#0078d4;color:#fff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:0.8rem;font-weight:700;">Outlook</a>
          <a href="${ics}" style="display:inline-block;margin:3px;background:#555;color:#fff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:0.8rem;font-weight:700;">Apple Calendar</a>
        </td>
      </tr>
    </table>`;
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
  const clientEmail = booking.clientEmail || booking.client_email || confirmedData['Email'] || '';
  const totalAud = booking.totalAud != null ? booking.totalAud : (booking.total_aud != null ? booking.total_aud : null);
  const amount = totalAud ? `AUD $${parseFloat(totalAud).toFixed(2)}` : 'TBC';
  const notes = booking.notes || '';

  const bookingId = generateBookingId();

  // Save booking to DB
  try {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY, client_name TEXT, client_email TEXT, service TEXT,
        booking_date TEXT, booking_time TEXT, location TEXT, num_people TEXT,
        total_aud NUMERIC(10,2), payment_method TEXT, status TEXT DEFAULT 'confirmed',
        stripe_payment_intent_id TEXT, booking_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    try { await db.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_id TEXT'); } catch(e) {}
    await db.query(
      `INSERT INTO bookings (client_name, client_email, service, booking_date, booking_time, location, num_people, total_aud, payment_method, status, booking_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'cash','confirmed',$9)`,
      [clientName, clientEmail,
       confirmedData['Service'] || null, confirmedData['Date'] || confirmedData['Confirmed Date'] || null,
       confirmedData['Time'] || null, confirmedData['Location'] || null,
       confirmedData['Number of People'] || confirmedData['People'] || null,
       totalAud != null ? parseFloat(totalAud) : null,
       bookingId]
    );
  } catch (e) { console.error('DB save cash booking error:', e); }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const ownerEmail = 'nishankn.ankita@gmail.com';
  const siteUrl = 'https://www.theglambyankita.com';

  const detailRows = Object.entries(confirmedData)
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:8px 14px;font-size:0.82rem;font-weight:700;color:#9a7060;width:38%;background:#fdf0ee;border-bottom:1px solid #fdeee8;">${k}</td><td style="padding:8px 14px;font-size:0.9rem;color:#2c1810;border-bottom:1px solid #fdeee8;">${v}</td></tr>`)
    .join('');

  if (user && pass) {
    try {
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

      const calSection = buildCalendarSection(confirmedData, siteUrl);

      if (clientEmail) {
        const clientHtml = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Booking Confirmed — The Glam by Ankita</title></head>
<body style="margin:0;padding:0;background:#f5ede8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ede8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:linear-gradient(135deg,#c9a96e 0%,#9e7c4a 100%);padding:32px 36px 28px;">
            <p style="margin:0 0 6px;font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.15em;">The Glam by Ankita</p>
            <h1 style="margin:0;font-size:1.6rem;font-weight:700;color:#fff;line-height:1.2;">Booking Confirmed! ✅</h1>
            <p style="margin:10px 0 0;font-size:0.88rem;color:rgba(255,255,255,0.9);">Your appointment is locked in — see you soon!</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 36px 0;">
            <p style="margin:0;font-size:1rem;color:#2c1810;line-height:1.7;">Hi <strong>${clientName}</strong>,</p>
            <p style="margin:10px 0 0;font-size:0.95rem;color:#4a2e22;line-height:1.8;">Your booking is confirmed and Ankita is so excited to work with you! 💄</p>
            <p style="margin:8px 0 0;font-size:0.95rem;color:#4a2e22;line-height:1.8;">You have chosen to pay the deposit of <strong style="color:#9e7c4a;">${amount}</strong> in cash at the appointment.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 36px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#fdf8f0,#fff8ec);border:1.5px solid #c9a96e;border-radius:8px;">
              <tr>
                <td style="padding:14px 20px;text-align:center;">
                  <p style="margin:0 0 6px;font-size:0.68rem;font-weight:700;color:#9e7c4a;text-transform:uppercase;letter-spacing:0.16em;">📎 Your Booking Reference</p>
                  <p style="margin:0;font-size:1.35rem;font-weight:700;color:#6b3d2e;letter-spacing:0.1em;font-family:'Courier New',monospace;">${bookingId}</p>
                  <p style="margin:6px 0 0;font-size:0.73rem;color:#9e7c4a;">Keep this for your records · Quote it for any enquiries</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px 0;">
            <p style="margin:0 0 10px;font-size:0.75rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.12em;">Booking Details</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">
              ${detailRows}
            </table>
          </td>
        </tr>
        ${notes ? `
        <tr>
          <td style="padding:16px 36px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="background:#fff8f0;border-left:3px solid #c9a96e;border-radius:0 6px 6px 0;padding:14px 18px;">
                <p style="margin:0 0 4px;font-size:0.75rem;font-weight:700;color:#c9a96e;text-transform:uppercase;letter-spacing:0.1em;">A note from Ankita</p>
                <p style="margin:0;font-size:0.92rem;color:#4a2e22;line-height:1.7;">${notes}</p>
              </td></tr>
            </table>
          </td>
        </tr>` : ''}
        <tr><td style="padding:20px 36px 0;">${calSection}</td></tr>
        <tr>
          <td style="padding:28px 36px 32px;">
            <p style="margin:0;font-size:0.92rem;color:#4a2e22;line-height:1.8;">Can't wait to make you look and feel absolutely stunning 💛<br><br>With love,<br><strong style="color:#9e7c4a;">Ankita</strong><br><span style="font-size:0.85rem;color:#9a7060;">The Glam by Ankita</span></p>
          </td>
        </tr>
        <tr>
          <td style="background:#fdf0ee;padding:16px 36px;border-top:1px solid #f0ddd8;text-align:center;">
            <p style="margin:0;font-size:0.75rem;color:#b09080;line-height:1.6;">Questions? Reply to this email or visit <a href="${siteUrl}" style="color:#c9a96e;">${siteUrl.replace('https://www.','')}</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

        await transporter.sendMail({
          from: `"The Glam by Ankita" <${user}>`,
          to: clientEmail,
          subject: `✅ Booking Confirmed — The Glam by Ankita`,
          html: clientHtml,
        });
      }

      await transporter.sendMail({
        from: `"The Glam by Ankita" <${user}>`,
        to: ownerEmail,
        subject: `💵 Cash payment selected — ${clientName}`,
        html: `
          <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:22px 28px;">
              <h2 style="margin:0;color:#fff;font-size:1.2rem;">💵 Cash Payment Selected</h2>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">The Glam by Ankita — Booking Notification</p>
            </div>
            <div style="padding:24px 28px;">
              <p style="margin:0 0 8px;font-size:0.95rem;color:#2c1810;"><strong>${clientName}</strong> has chosen to pay by <strong>cash</strong> at the appointment.</p>
              <p style="margin:0 0 8px;font-size:0.95rem;color:#2c1810;">Amount to collect: <strong style="color:#9e7c4a;">${amount}</strong></p>
              <p style="margin:0 0 16px;font-size:0.85rem;color:#9e7c4a;">Booking ref: <strong style="font-family:'Courier New',monospace;letter-spacing:0.06em;">${bookingId}</strong></p>
              ${clientEmail ? `<p style="margin:0 0 16px;font-size:0.88rem;color:#6b3d2e;">Client email: ${clientEmail}</p>` : ''}
              <table style="width:100%;border-collapse:collapse;font-size:0.9rem;border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">
                ${detailRows}
              </table>
            </div>
            <div style="padding:14px 28px;background:#fff9f0;border-top:1px solid #e8c4bc;">
              <p style="margin:0;font-size:0.82rem;color:#9e7c4a;">Remember to collect the cash deposit at the appointment.</p>
            </div>
          </div>`,
      });
    } catch (emailErr) {
      console.error('select-cash email error:', emailErr);
    }
  }

  res.json({ ok: true });
};
