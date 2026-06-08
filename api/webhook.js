const nodemailer = require('nodemailer');

const SITE_URL = 'https://www.theglambyankita.com';

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

  return { gCal, outlook, ics, title, service, loc, date, time };
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

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (user && pass) {
      try {
        const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
        const calLinks = buildCalendarLinks(meta);
        const calButtons = calendarButtonsHtml(calLinks);
        const detailRows = buildDetailRows(meta);

        // Email to Ankita
        await transporter.sendMail({
          from: `"The Glam by Ankita" <${user}>`,
          to: user,
          subject: `💰 Payment received — ${clientName} paid AUD $${amountAud}`,
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
                </td>
              </tr>
            </table>
          </td>
        </tr>
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

        // Confirmation email to client
        if (clientEmail) {
          const firstName = clientName.split(' ')[0] || clientName;
          await transporter.sendMail({
            from: `"The Glam by Ankita" <${user}>`,
            to: clientEmail,
            subject: `🎉 You're all booked! — The Glam by Ankita`,
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
        ${detailRows ? `
        <tr>
          <td style="padding:24px 36px 0;">
            <p style="margin:0 0 10px;font-size:0.75rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.12em;">Your Confirmed Booking</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">${detailRows}</table>
          </td>
        </tr>` : ''}
        ${calButtons ? `<tr><td style="padding:20px 36px 0;">${calButtons}</td></tr>` : ''}
        <tr>
          <td style="padding:28px 36px 0;">
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
