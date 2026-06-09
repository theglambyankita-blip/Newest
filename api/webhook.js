const nodemailer = require('nodemailer');
const https = require('https');
const { getPool } = require('./db');

const SITE_URL = 'https://www.theglambyankita.com';
const OWNER_EMAIL = 'nishankn.ankita@gmail.com';

function sendPushNotification(title, message, priority) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return Promise.resolve();
  return new Promise((resolve) => {
    const body = JSON.stringify({
      topic,
      title,
      message,
      priority: priority || 4,
      tags: ['moneybag'],
    });
    const req = https.request(
      { hostname: 'ntfy.sh', path: '/', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { res.resume(); res.on('end', resolve); }
    );
    req.on('error', (e) => { console.error('ntfy error:', e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

function buildCalendarLinks(meta) {
  const date = meta.date || '';
  const time = meta.time || '';
  if (!date) return null;

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = (time || '09:00').split(':').map(Number);
  const pad = n => String(n || 0).padStart(2, '0');

  const startDT = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
  const endH = (hour + 2) % 24;
  const endDT = `${year}${pad(month)}${pad(day)}T${pad(endH)}${pad(minute)}00`;

  const loc = meta.location || '';
  const service = meta.service || 'Makeup Appointment';
  const numPeople = meta.num_people || '';
  const title = `${service} — The Glam by Ankita`;
  const desc = `Appointment with Ankita from The Glam by Ankita.\nService: ${service}${numPeople ? `\nNumber of people: ${numPeople}` : ''}${loc ? `\nLocation: ${loc}` : ''}`;

  const gCal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDT}/${endDT}&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(loc)}`;
  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${date}T${pad(hour)}:${pad(minute)}:00&enddt=${date}T${pad(endH)}:${pad(minute)}:00&body=${encodeURIComponent(desc)}&location=${encodeURIComponent(loc)}`;
  const ics = `${SITE_URL}/api/calendar?${new URLSearchParams({ title, date, time: time || '09:00', location: loc, description: desc, uid: `booking-${Date.now()}@theglambyankita.com` })}`;

  return { gCal, outlook, ics, title, service, loc, date, time, desc };
}

function buildIcsAttachment(meta) {
  const date = meta.date || '';
  const time = meta.time || '09:00';
  if (!date) return null;

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = (time).split(':').map(Number);
  const pad = n => String(n || 0).padStart(2, '0');

  const startStr = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
  const endTotalMins = hour * 60 + minute + 120;
  const endH = Math.floor(endTotalMins / 60) % 24;
  const endM = endTotalMins % 60;
  const dayOverflow = endTotalMins >= 24 * 60 ? 1 : 0;
  const endDay = new Date(year, month - 1, day + dayOverflow);
  const endStr = `${endDay.getFullYear()}${pad(endDay.getMonth() + 1)}${pad(endDay.getDate())}T${pad(endH)}${pad(endM)}00`;

  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const uid = `booking-${Date.now()}@theglambyankita.com`;
  const service = meta.service || 'Makeup Appointment';
  const loc = meta.location || '';
  const numPeople = meta.num_people || '';
  const title = `${service} — The Glam by Ankita`;
  const descRaw = `Appointment with Ankita from The Glam by Ankita.\nService: ${service}${numPeople ? `\nNumber of people: ${numPeople}` : ''}${loc ? `\nLocation: ${loc}` : ''}`;
  const desc = descRaw.replace(/\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Glam by Ankita//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${title}`,
    loc ? `LOCATION:${loc}` : null,
    `DESCRIPTION:${desc}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  return {
    filename: 'glam-booking.ics',
    content: Buffer.from(lines, 'utf8'),
    contentType: 'text/calendar; method=PUBLISH; charset=utf-8',
  };
}

function calendarButtonsHtml(links) {
  if (!links) return '';
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f9ff;border:1px solid #d0e4f7;border-radius:6px;margin-top:16px;">
      <tr>
        <td style="padding:14px 20px;text-align:center;">
          <p style="margin:0 0 10px;font-size:0.75rem;font-weight:700;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.1em;">📅 Add to your calendar</p>
          <a href="${links.gCal}" target="_blank" style="display:inline-block;margin:3px;background:#4285f4;color:#fff;text-decoration:none;padding:9px 18px;border-radius:4px;font-size:0.82rem;font-weight:700;">Google Calendar</a>
          <a href="${links.outlook}" target="_blank" style="display:inline-block;margin:3px;background:#0078d4;color:#fff;text-decoration:none;padding:9px 18px;border-radius:4px;font-size:0.82rem;font-weight:700;">Outlook</a>
          <a href="${links.ics}" style="display:inline-block;margin:3px;background:#555;color:#fff;text-decoration:none;padding:9px 18px;border-radius:4px;font-size:0.82rem;font-weight:700;">Apple Calendar</a>
        </td>
      </tr>
    </table>`;
}

function buildDetailRows(meta) {
  const fields = [
    ['Service', meta.service],
    ['Date', meta.date],
    ['Time', meta.time],
    ['Location', meta.location],
    ['Number of People', meta.num_people],
  ];
  return fields
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:8px 14px;font-size:0.82rem;font-weight:700;color:#9a7060;width:40%;background:#fdf0ee;border-bottom:1px solid #fdeee8;">${k}</td><td style="padding:8px 14px;font-size:0.9rem;color:#2c1810;border-bottom:1px solid #fdeee8;">${v}</td></tr>`)
    .join('');
}

function receiptHtml(receiptUrl) {
  if (!receiptUrl) return '';
  return `
    <tr>
      <td style="padding:16px 32px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fff4;border:1px solid #c8e6c9;border-radius:6px;">
          <tr>
            <td style="padding:14px 20px;text-align:center;">
              <p style="margin:0 0 8px;font-size:0.75rem;font-weight:700;color:#2e7d32;text-transform:uppercase;letter-spacing:0.1em;">🧾 Payment Receipt</p>
              <a href="${receiptUrl}" target="_blank" style="display:inline-block;background:#2e7d32;color:#fff;text-decoration:none;padding:9px 22px;border-radius:4px;font-size:0.85rem;font-weight:700;">View Stripe Invoice / Receipt</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

module.exports.config = { api: { bodyParser: false } };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const rawBody = await getRawBody(req);
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      event = JSON.parse(rawBody.toString());
    }
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const meta = intent.metadata || {};

    const amountAud = (intent.amount / 100).toFixed(2);
    const clientName = meta.client_name || 'Client';
    const clientEmail = meta.client_email || intent.receipt_email || '';

    // Fetch receipt URL from the Stripe charge
    let receiptUrl = null;
    try {
      const chargeId = intent.latest_charge;
      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId);
        receiptUrl = charge.receipt_url || null;
      }
    } catch (e) {
      console.error('Failed to fetch charge receipt URL:', e.message);
    }

    const bookingId = meta.booking_id || null;

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
        `INSERT INTO bookings (client_name, client_email, service, booking_date, booking_time, location, num_people, total_aud, payment_method, status, stripe_payment_intent_id, booking_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'card','confirmed',$9,$10)`,
        [clientName, clientEmail,
         meta.service || null, meta.date || null,
         meta.time || null, meta.location || null, meta.num_people || null,
         intent.amount / 100, intent.id, bookingId]
      );
    } catch (e) { console.error('DB save booking error:', e); }

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (user && pass) {
      try {
        const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
        const calLinks = buildCalendarLinks(meta);
        const calButtons = calendarButtonsHtml(calLinks);
        const detailRows = buildDetailRows(meta);
        const icsAttachment = buildIcsAttachment(meta);
        const receiptSection = receiptHtml(receiptUrl);
        const receiptLine = receiptUrl
          ? `<p style="margin:8px 0 0;font-size:0.88rem;color:#4a2e22;">Receipt: <a href="${receiptUrl}" style="color:#c9a96e;">${receiptUrl}</a></p>`
          : '';

        const bookingRefSection = bookingId ? `
        <tr>
          <td style="padding:16px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#fdf8f0,#fff8ec);border:1.5px solid #c9a96e;border-radius:8px;">
              <tr>
                <td style="padding:14px 20px;text-align:center;">
                  <p style="margin:0 0 6px;font-size:0.68rem;font-weight:700;color:#9e7c4a;text-transform:uppercase;letter-spacing:0.16em;">📎 Booking Reference</p>
                  <p style="margin:0;font-size:1.35rem;font-weight:700;color:#6b3d2e;letter-spacing:0.1em;font-family:'Courier New',monospace;">${bookingId}</p>
                  <p style="margin:6px 0 0;font-size:0.73rem;color:#9e7c4a;">Quote this ID for any enquiries</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : '';

        // ── Email to Ankita ────────────────────────────────────────────────
        await transporter.sendMail({
          from: `"The Glam by Ankita" <${user}>`,
          to: OWNER_EMAIL,
          subject: `💰 Payment received — ${clientName} paid AUD $${amountAud}`,
          attachments: icsAttachment ? [icsAttachment] : [],
          html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5ede8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ede8;padding:32px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:linear-gradient(135deg,#2e7d32 0%,#1b5e20 100%);padding:28px 32px;">
            <p style="margin:0 0 4px;font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.15em;">The Glam by Ankita</p>
            <h1 style="margin:0;font-size:1.5rem;font-weight:700;color:#fff;line-height:1.2;">💰 Payment Received!</h1>
            <p style="margin:8px 0 0;font-size:0.9rem;color:rgba(255,255,255,0.9);">${clientName} has completed their payment.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fff0;border:1px solid #c8e6c9;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:20px 24px;text-align:center;">
                  <p style="margin:0 0 4px;font-size:0.78rem;font-weight:700;color:#2e7d32;text-transform:uppercase;letter-spacing:0.1em;">Amount Received</p>
                  <p style="margin:0;font-size:2.2rem;font-weight:700;color:#1b5e20;">AUD $${amountAud}</p>
                  ${clientEmail ? `<p style="margin:6px 0 0;font-size:0.85rem;color:#388e3c;">From: ${clientEmail}</p>` : ''}
                  ${receiptLine}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${bookingRefSection}
        ${receiptSection}
        ${detailRows ? `
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 10px;font-size:0.75rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.12em;">Booking Details</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">${detailRows}</table>
          </td>
        </tr>` : ''}
        ${meta.notes ? `
        <tr>
          <td style="padding:16px 32px 0;">
            <p style="margin:0 0 6px;font-size:0.75rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.1em;">Notes</p>
            <p style="margin:0;font-size:0.9rem;color:#4a2e22;line-height:1.7;">${meta.notes}</p>
          </td>
        </tr>` : ''}
        ${calButtons ? `<tr><td style="padding:0 32px;">${calButtons}</td></tr>` : ''}
        <tr>
          <td style="padding:24px 32px;">
            <p style="margin:0;font-size:0.88rem;color:#4a2e22;line-height:1.7;">View all payments in your <a href="https://dashboard.stripe.com/payments" style="color:#c9a96e;">Stripe dashboard</a>.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#fdf0ee;padding:14px 32px;border-top:1px solid #f0ddd8;text-align:center;">
            <p style="margin:0;font-size:0.75rem;color:#b09080;">The Glam by Ankita — theglambyankita.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
        });

        // ── Confirmation email to client ───────────────────────────────────
        if (clientEmail) {
          const firstName = clientName.split(' ')[0] || clientName;
          const clientReceiptSection = receiptUrl ? `
        <tr>
          <td style="padding:16px 36px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fff4;border:1px solid #c8e6c9;border-radius:6px;">
              <tr>
                <td style="padding:14px 20px;text-align:center;">
                  <p style="margin:0 0 8px;font-size:0.75rem;font-weight:700;color:#2e7d32;text-transform:uppercase;letter-spacing:0.1em;">🧾 Your Payment Receipt</p>
                  <a href="${receiptUrl}" target="_blank" style="display:inline-block;background:#2e7d32;color:#fff;text-decoration:none;padding:9px 22px;border-radius:4px;font-size:0.85rem;font-weight:700;">View Receipt / Invoice</a>
                  <p style="margin:8px 0 0;font-size:0.75rem;color:#6b3d2e;">Issued by Stripe · Secure payment</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : '';

          await transporter.sendMail({
            from: `"The Glam by Ankita" <${user}>`,
            to: clientEmail,
            subject: `🎉 You're all booked! — The Glam by Ankita`,
            attachments: icsAttachment ? [icsAttachment] : [],
            html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
                  <h1 style="margin:0;font-size:1.7rem;font-weight:700;color:#fff;line-height:1.2;">You're all booked! 🎉</h1>
                </td>
              </tr>
              <tr><td style="background:rgba(255,255,255,0.18);height:4px;"></td></tr>
              <tr>
                <td style="padding:14px 36px 28px;">
                  <p style="margin:0;font-size:0.88rem;color:rgba(255,255,255,0.9);line-height:1.6;">Payment confirmed — your date is officially locked in! 💄</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 36px 0;">
            <p style="margin:0;font-size:1rem;color:#2c1810;line-height:1.7;">Hi <strong>${firstName}</strong>,</p>
            <p style="margin:10px 0 0;font-size:0.95rem;color:#4a2e22;line-height:1.8;">Your payment of <strong>AUD $${amountAud}</strong> has been received and your booking is confirmed. I absolutely can't wait to work with you! ✨</p>
          </td>
        </tr>
        ${bookingId ? `
        <tr>
          <td style="padding:20px 36px 0;">
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
        </tr>` : ''}
        ${detailRows ? `
        <tr>
          <td style="padding:20px 36px 0;">
            <p style="margin:0 0 10px;font-size:0.75rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.12em;">Your Confirmed Booking</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">${detailRows}</table>
          </td>
        </tr>` : ''}
        ${clientReceiptSection}
        ${calButtons ? `<tr><td style="padding:20px 36px 0;">${calButtons}</td></tr>` : ''}
        <tr>
          <td style="padding:20px 36px 0;">
            <p style="margin:0 0 8px;font-size:0.75rem;font-weight:700;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.1em;">📎 Calendar file attached</p>
            <p style="margin:0;font-size:0.85rem;color:#4a2e22;line-height:1.6;">A <strong>glam-booking.ics</strong> file is attached to this email — open it to instantly save your appointment to any calendar app.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 36px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0;border-left:3px solid #c9a96e;border-radius:0 6px 6px 0;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0 0 4px;font-size:0.75rem;font-weight:700;color:#c9a96e;text-transform:uppercase;letter-spacing:0.1em;">📌 A few things to remember</p>
                  <p style="margin:0;font-size:0.88rem;color:#4a2e22;line-height:1.7;">Please arrive with a clean face. If you have any questions before your appointment, feel free to reply to this email — I'm always happy to help!</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 36px 32px;">
            <p style="margin:0;font-size:0.92rem;color:#4a2e22;line-height:1.8;">Can't wait to see you! 💛<br><br>With love,<br><strong style="color:#9e7c4a;">Ankita</strong><br><span style="font-size:0.85rem;color:#9a7060;">The Glam by Ankita</span></p>
          </td>
        </tr>
        <tr>
          <td style="background:#fdf0ee;padding:16px 36px;border-top:1px solid #f0ddd8;text-align:center;">
            <p style="margin:0;font-size:0.75rem;color:#b09080;line-height:1.6;">Questions? Reply to this email or visit <a href="https://www.theglambyankita.com" style="color:#c9a96e;">theglambyankita.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
          });
        }
      } catch (err) {
        console.error('Webhook email error:', err.message);
      }
    }
  }

  res.json({ received: true });
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
