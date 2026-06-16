const express = require('express');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const https = require('https');
const { formidable } = require('formidable');
const Stripe = require('stripe');

const app = express();

// ── DB ────────────────────────────────────────────────────────────
let _pool;
function getPool() {
  if (!_pool) {
    const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || null;
    let connectionString = raw;
    if (raw) {
      try {
        const u = new URL(raw);
        u.searchParams.delete('pgbouncer');
        u.searchParams.delete('connection_limit');
        connectionString = u.toString();
      } catch {}
    }
    _pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return _pool;
}

// ── Helpers ───────────────────────────────────────────────────────
const SITE_URL = 'https://www.theglambyankita.com';
const ADMIN_EMAIL = 'nishankn.ankita@gmail.com';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function createTransporter() {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

function getTokenSecret() {
  return process.env.GMAIL_APP_PASSWORD || 'glam-by-ankita-2026';
}

function createBookingToken(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', getTokenSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function getPossibleSecrets() {
  const s = ['glam-by-ankita-2026'];
  if (process.env.GMAIL_APP_PASSWORD) s.unshift(process.env.GMAIL_APP_PASSWORD);
  if (process.env.STRIPE_SECRET_KEY) s.unshift(process.env.STRIPE_SECRET_KEY);
  return s;
}

function verifyBookingToken(token) {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) throw new Error('Invalid token format');
  const payload = token.substring(0, lastDot);
  const sig = token.substring(lastDot + 1);
  const matched = getPossibleSecrets().some(secret => {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return sig === expected;
  });
  if (!matched) throw new Error('Invalid or tampered booking link.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

function decodeToken(token) {
  // Try signed token first, fall back to plain base64url
  try { return verifyBookingToken(token); } catch {}
  const payload = token.includes('.') ? token.substring(0, token.lastIndexOf('.')) : token;
  const b64 = payload.replace(/-/g,'+').replace(/_/g,'/');
  const pad = (4 - b64.length % 4) % 4;
  return JSON.parse(Buffer.from(b64 + '='.repeat(pad), 'base64').toString('utf8'));
}

function generateBookingId() {
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0'), d = String(now.getDate()).padStart(2,'0');
  return `GBA-${y}${m}${d}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

async function validateAdminToken(token) {
  if (!token) return false;
  try {
    const db = getPool();
    const { rows } = await db.query('SELECT id FROM admin_tokens WHERE token=$1 AND expires_at>NOW() LIMIT 1', [token]);
    return rows.length > 0;
  } catch { return false; }
}

function buildIcsContent({ date, time, service, location: loc, numPeople, uid }) {
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = (time || '09:00').split(':').map(Number);
  const pad = n => String(n||0).padStart(2,'0');
  const startStr = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
  const endTotalMins = hour * 60 + minute + 120;
  const endH = Math.floor(endTotalMins/60) % 24, endM = endTotalMins % 60;
  const dayOverflow = endTotalMins >= 24*60 ? 1 : 0;
  const endDay = new Date(year, month-1, day+dayOverflow);
  const endStr = `${endDay.getFullYear()}${pad(endDay.getMonth()+1)}${pad(endDay.getDate())}T${pad(endH)}${pad(endM)}00`;
  const now = new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)+'Z';
  const title = `${service || 'Makeup Appointment'} — The Glam by Ankita`;
  const descRaw = [`Appointment with The Glam by Ankita.`, service?`Service: ${service}`:'', numPeople?`People: ${numPeople}`:'', loc?`Location: ${loc}`:''].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//The Glam by Ankita//Bookings//EN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    `UID:${uid||`booking-${Date.now()}@theglambyankita.com`}`,
    `DTSTAMP:${now}`,`DTSTART:${startStr}`,`DTEND:${endStr}`,`SUMMARY:${title}`,
    loc?`LOCATION:${loc}`:null,`DESCRIPTION:${descRaw.replace(/\n/g,'\\n')}`,
    'END:VEVENT','END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  return { filename:'glam-booking.ics', content:Buffer.from(lines,'utf8'), contentType:'text/calendar; method=PUBLISH; charset=utf-8' };
}

function buildCalendarButtons({ date, time, service, location: loc, numPeople }) {
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = (time||'09:00').split(':').map(Number);
  const pad = n => String(n||0).padStart(2,'0');
  const startDT = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
  const endH = (hour+2)%24;
  const endDT = `${year}${pad(month)}${pad(day)}T${pad(endH)}${pad(minute)}00`;
  const title = `${service||'Makeup Appointment'} — The Glam by Ankita`;
  const desc = [`Appointment with The Glam by Ankita.`,service?`Service: ${service}`:'',numPeople?`Number of people: ${numPeople}`:'',loc?`Location: ${loc}`:''].filter(Boolean).join('\n');
  const gCal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDT}/${endDT}&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(loc||'')}`;
  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${date}T${pad(hour)}:${pad(minute)}:00&enddt=${date}T${pad(endH)}:${pad(minute)}:00&body=${encodeURIComponent(desc)}&location=${encodeURIComponent(loc||'')}`;
  const ics = `${SITE_URL}/api/calendar?${new URLSearchParams({title,date,time:time||'09:00',location:loc||'',description:desc})}`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f9ff;border:1px solid #d0e4f7;border-radius:6px;margin-top:10px;"><tr><td style="padding:14px 20px;text-align:center;"><p style="margin:0 0 10px;font-size:0.75rem;font-weight:700;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.1em;">📅 Add to your calendar</p><a href="${gCal}" target="_blank" style="display:inline-block;margin:3px;background:#4285f4;color:#fff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:0.8rem;font-weight:700;">Google Calendar</a><a href="${outlook}" target="_blank" style="display:inline-block;margin:3px;background:#0078d4;color:#fff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:0.8rem;font-weight:700;">Outlook</a><a href="${ics}" style="display:inline-block;margin:3px;background:#555;color:#fff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:0.8rem;font-weight:700;">Apple Calendar</a></td></tr></table>`;
}

// ── Strip /api prefix so routes work whether called directly or via Vercel rewrite ─
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) req.url = req.url.slice(4);
  else if (req.url === '/api') req.url = '/';
  next();
});

// ── STRIPE WEBHOOK (raw body required — mount before express.json) ─
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY || '');
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
      : JSON.parse(req.body.toString());
  } catch (err) {
    console.error('Webhook sig error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const meta = intent.metadata || {};
    const amountAud = (intent.amount / 100).toFixed(2);
    const clientName = meta.client_name || 'Client';
    const clientEmail = meta.client_email || intent.receipt_email || '';

    let receiptUrl = null;
    try {
      if (intent.latest_charge) {
        const charge = await stripe.charges.retrieve(intent.latest_charge);
        receiptUrl = charge.receipt_url || null;
      }
    } catch(e) { console.error('Receipt URL error:', e.message); }

    try {
      const db = getPool();
      await db.query(`CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY, client_name TEXT, client_email TEXT, service TEXT, booking_date TEXT, booking_time TEXT, location TEXT, num_people TEXT, total_aud NUMERIC(10,2), payment_method TEXT, status TEXT DEFAULT 'confirmed', stripe_payment_intent_id TEXT, booking_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
      try { await db.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_id TEXT'); } catch {}
      await db.query(`INSERT INTO bookings (client_name,client_email,service,booking_date,booking_time,location,num_people,total_aud,payment_method,status,stripe_payment_intent_id,booking_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'card','confirmed',$9,$10)`,
        [clientName,clientEmail,meta.service||null,meta.date||null,meta.time||null,meta.location||null,meta.num_people||null,intent.amount/100,intent.id,meta.booking_id||null]);
    } catch(e) { console.error('DB save webhook booking error:', e); }

    const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
    if (user && pass) {
      try {
        const transporter = nodemailer.createTransport({ service:'gmail', auth:{user,pass} });
        const icsAttachment = buildIcsContent({ date:meta.date, time:meta.time, service:meta.service, location:meta.location, numPeople:meta.num_people, uid:`webhook-${intent.id}@theglambyankita.com` });
        const calBtns = buildCalendarButtons({ date:meta.date, time:meta.time, service:meta.service, location:meta.location, numPeople:meta.num_people });
        const bookingId = meta.booking_id || null;

        const detailRows = [['Service',meta.service],['Date',meta.date],['Time',meta.time],['Location',meta.location],['Number of People',meta.num_people]]
          .filter(([,v])=>v).map(([k,v])=>`<tr><td style="padding:8px 14px;font-size:0.82rem;font-weight:700;color:#9a7060;width:40%;background:#fdf0ee;border-bottom:1px solid #fdeee8;">${k}</td><td style="padding:8px 14px;font-size:0.9rem;color:#2c1810;border-bottom:1px solid #fdeee8;">${v}</td></tr>`).join('');

        const bookingRefHtml = bookingId ? `<tr><td style="padding:16px 32px 0;"><table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#fdf8f0,#fff8ec);border:1.5px solid #c9a96e;border-radius:8px;"><tr><td style="padding:14px 20px;text-align:center;"><p style="margin:0 0 6px;font-size:0.68rem;font-weight:700;color:#9e7c4a;text-transform:uppercase;letter-spacing:0.16em;">📎 Booking Reference</p><p style="margin:0;font-size:1.35rem;font-weight:700;color:#6b3d2e;letter-spacing:0.1em;font-family:'Courier New',monospace;">${bookingId}</p></td></tr></table></td></tr>` : '';
        const receiptHtmlOwner = receiptUrl ? `<p style="margin:8px 0 0;font-size:0.88rem;"><a href="${receiptUrl}" style="color:#c9a96e;">View Stripe receipt</a></p>` : '';
        const receiptHtmlClient = receiptUrl ? `<tr><td style="padding:16px 36px 0;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fff4;border:1px solid #c8e6c9;border-radius:6px;"><tr><td style="padding:14px 20px;text-align:center;"><a href="${receiptUrl}" target="_blank" style="display:inline-block;background:#2e7d32;color:#fff;text-decoration:none;padding:9px 22px;border-radius:4px;font-size:0.85rem;font-weight:700;">View Stripe Receipt</a></td></tr></table></td></tr>` : '';

        await transporter.sendMail({
          from:`"The Glam by Ankita" <${user}>`, to:ADMIN_EMAIL,
          subject:`💰 Payment received — ${clientName} paid AUD $${amountAud}`,
          attachments: icsAttachment ? [icsAttachment] : [],
          html:`<div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;"><div style="background:linear-gradient(135deg,#2e7d32,#1b5e20);padding:28px 32px;"><h1 style="margin:0;font-size:1.4rem;color:#fff;">💰 Payment Received!</h1><p style="margin:6px 0 0;color:rgba(255,255,255,0.9);">${clientName} — AUD $${amountAud}</p></div><div style="padding:20px 32px;">${receiptHtmlOwner}</div>${bookingRefHtml}${detailRows?`<div style="padding:0 32px 16px;"><table style="width:100%;border-collapse:collapse;border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">${detailRows}</table></div>`:''}<div style="padding:0 32px 20px;"><p style="margin:0;font-size:0.85rem;color:#4a2e22;">View payments at <a href="https://dashboard.stripe.com/payments" style="color:#c9a96e;">Stripe dashboard</a>.</p>${calBtns}</div></div>`
        });

        if (clientEmail) {
          const firstName = clientName.split(' ')[0] || clientName;
          await transporter.sendMail({
            from:`"The Glam by Ankita" <${user}>`, to:clientEmail,
            subject:`🎉 You're all booked! — The Glam by Ankita`,
            attachments: icsAttachment ? [icsAttachment] : [],
            html:`<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:10px;overflow:hidden;"><div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:32px 36px;"><p style="margin:0 0 6px;font-size:0.75rem;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.15em;">The Glam by Ankita</p><h1 style="margin:0;font-size:1.7rem;color:#fff;">You're all booked! 🎉</h1><p style="margin:8px 0 0;font-size:0.88rem;color:rgba(255,255,255,0.9);">Payment confirmed — your date is locked in! 💄</p></div><div style="padding:28px 36px 0;"><p style="margin:0;font-size:1rem;color:#2c1810;">Hi <strong>${firstName}</strong>,</p><p style="margin:10px 0 0;font-size:0.95rem;color:#4a2e22;line-height:1.8;">Your payment of <strong>AUD $${amountAud}</strong> has been received. I can't wait to work with you! ✨</p></div>${bookingRefHtml}${detailRows?`<div style="padding:20px 36px 0;"><table style="width:100%;border-collapse:collapse;border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">${detailRows}</table></div>`:''}<table width="100%" style="padding:0 36px;">${receiptHtmlClient}</table><div style="padding:20px 36px 0;">${calBtns}</div><div style="padding:24px 36px 32px;"><p style="margin:0;font-size:0.92rem;color:#4a2e22;line-height:1.8;">Can't wait to see you! 💛<br><br>With love,<br><strong style="color:#9e7c4a;">Ankita</strong><br><span style="font-size:0.85rem;color:#9a7060;">The Glam by Ankita</span></p></div><div style="background:#fdf0ee;padding:16px 36px;border-top:1px solid #f0ddd8;text-align:center;"><p style="margin:0;font-size:0.75rem;color:#b09080;">Questions? Visit <a href="${SITE_URL}" style="color:#c9a96e;">theglambyankita.com</a></p></div></div>`
          });
        }
      } catch(e) { console.error('Webhook email error:', e); }
    }
  }
  res.json({ received: true });
});

// ── JSON body parsing (after webhook raw) ────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ── GET /config ──────────────────────────────────────────────────
app.get('/config', (req, res) => {
  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;
  if (req.query.debug === '1') {
    const found = Object.keys(process.env).filter(k=>k.toUpperCase().includes('STRIPE')).map(k=>`${k}=${(process.env[k]||'').substring(0,10)}...`);
    return res.json({ stripePublishableKey, found });
  }
  res.json({ stripePublishableKey });
});

// ── GET /calendar ─────────────────────────────────────────────────
app.get('/calendar', (req, res) => {
  const { title, date, time, location, description, uid } = req.query;
  if (!date) return res.status(400).send('Missing date');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = (time||'09:00').split(':').map(Number);
  const pad = n => String(n||0).padStart(2,'0');
  const startStr = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
  const endTotalMins = hour*60+minute+120;
  const endH = Math.floor(endTotalMins/60)%24, endM = endTotalMins%60;
  const dayOverflow = endTotalMins >= 24*60 ? 1 : 0;
  const endDay = new Date(year,month-1,day+dayOverflow);
  const endStr = `${endDay.getFullYear()}${pad(endDay.getMonth()+1)}${pad(endDay.getDate())}T${pad(endH)}${pad(endM)}00`;
  const now = new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)+'Z';
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//The Glam by Ankita//Bookings//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:${uid||`booking-${Date.now()}@theglambyankita.com`}`,`DTSTAMP:${now}`,`DTSTART:${startStr}`,`DTEND:${endStr}`,`SUMMARY:${title||'Makeup Appointment — The Glam by Ankita'}`,location?`LOCATION:${location}`:null,`DESCRIPTION:${(description||'Booking with The Glam by Ankita').replace(/\n/g,'\\n')}`,'END:VEVENT','END:VCALENDAR'].filter(Boolean).join('\r\n');
  res.setHeader('Content-Type','text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="glam-booking.ics"');
  res.setHeader('Cache-Control','no-store');
  res.send(lines);
});

// ── GET /get-booking ─────────────────────────────────────────────
app.get('/get-booking', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error:'Token required' });
  if (/^[a-f0-9]{64}$/.test(token)) return res.status(404).json({ error:'This link has expired.' });
  try {
    const data = verifyBookingToken(token);
    res.json({ confirmed_data:data.confirmedData||{}, client_name:data.clientName||'', client_email:data.clientEmail||'', notes:data.notes||'', total_aud:data.totalAud||null, status:'pending' });
  } catch(err) {
    res.status(404).json({ error: err.message || 'Invalid or expired link.' });
  }
});

// ── POST /create-payment-intent ───────────────────────────────────
app.post('/create-payment-intent', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error:'Payments not configured.' });
  const { token } = req.body;
  if (!token) return res.status(400).json({ error:'Token required' });
  try {
    const data = verifyBookingToken(token);
    const amount = parseFloat(data.totalAud);
    if (!amount || amount < 0.5) return res.status(400).json({ error:'Invalid payment amount' });
    const cd = data.confirmedData || {};
    const bookingId = generateBookingId();
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount*100), currency:'aud',
      automatic_payment_methods:{ enabled:true },
      metadata:{ booking_id:bookingId, client_name:(data.clientName||'').substring(0,100), client_email:(data.clientEmail||'').substring(0,200), service:(cd['Service']||'').substring(0,100), date:(cd['Date']||'').substring(0,20), time:(cd['Time']||'').substring(0,20), location:(cd['Location']||'').substring(0,200), num_people:String(cd['Number of People']||'').substring(0,20), notes:(data.notes||'').substring(0,300) },
      receipt_email: data.clientEmail || undefined,
      description:`The Glam by Ankita — ${data.clientName||'Client'} (${bookingId})`,
    });
    res.json({ client_secret:paymentIntent.client_secret, booking_id:bookingId });
  } catch(err) {
    if (err.message?.includes('tampered')||err.message?.includes('Invalid token')) return res.status(400).json({ error:'Invalid booking link.' });
    res.status(500).json({ error:'Server error: '+err.message });
  }
});

// ── POST /confirm-payment ─────────────────────────────────────────
app.post('/confirm-payment', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error:'Token required' });
  let booking;
  try { booking = decodeToken(token); } catch(e) { return res.status(400).json({ error:'Invalid token' }); }

  const confirmedData = booking.confirmedData || booking.confirmed_data || {};
  const clientName = booking.clientName || booking.client_name || confirmedData['First Name'] || 'Client';
  const clientEmail = booking.clientEmail || booking.client_email || confirmedData['Email'] || '';
  const totalAud = booking.totalAud ?? booking.total_aud ?? null;
  const amount = totalAud ? `AUD $${parseFloat(totalAud).toFixed(2)}` : 'TBC';
  const notes = booking.notes || '';
  const bookingId = generateBookingId();

  try {
    const db = getPool();
    await db.query(`CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY, client_name TEXT, client_email TEXT, service TEXT, booking_date TEXT, booking_time TEXT, location TEXT, num_people TEXT, total_aud NUMERIC(10,2), payment_method TEXT, status TEXT DEFAULT 'confirmed', stripe_payment_intent_id TEXT, booking_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
    try { await db.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_id TEXT'); } catch {}
    await db.query(`INSERT INTO bookings (client_name,client_email,service,booking_date,booking_time,location,num_people,total_aud,payment_method,status,booking_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'card','confirmed',$9)`,
      [clientName,clientEmail,confirmedData['Service']||null,confirmedData['Date']||null,confirmedData['Time']||null,confirmedData['Location']||null,confirmedData['Number of People']||null,totalAud!=null?parseFloat(totalAud):null,bookingId]);
  } catch(e) { console.error('DB save confirm-payment error:', e); }

  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (user && pass) {
    try {
      const transporter = nodemailer.createTransport({ service:'gmail', auth:{user,pass} });
      const detailRows = Object.entries(confirmedData).filter(([,v])=>v).map(([k,v])=>`<tr><td style="padding:8px 14px;font-size:0.82rem;font-weight:700;color:#9a7060;width:38%;background:#fdf0ee;border-bottom:1px solid #fdeee8;">${k}</td><td style="padding:8px 14px;font-size:0.9rem;color:#2c1810;border-bottom:1px solid #fdeee8;">${v}</td></tr>`).join('');
      const calSection = buildCalendarButtons({ date:confirmedData['Date'], time:confirmedData['Time'], service:confirmedData['Service'], location:confirmedData['Location'], numPeople:confirmedData['Number of People'] });
      const siteUrl = SITE_URL;

      if (clientEmail) {
        await transporter.sendMail({
          from:`"The Glam by Ankita" <${user}>`, to:clientEmail,
          subject:`🎉 Payment Confirmed — The Glam by Ankita`,
          html:`<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:10px;overflow:hidden;"><div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:32px 36px;"><h1 style="margin:0;font-size:1.6rem;color:#fff;">Booking Confirmed! ✅</h1><p style="margin:8px 0 0;font-size:0.88rem;color:rgba(255,255,255,0.9);">Your deposit is paid and your appointment is locked in!</p></div><div style="padding:28px 36px 0;"><p style="margin:0;font-size:1rem;color:#2c1810;">Hi <strong>${clientName}</strong>,</p><p style="margin:10px 0 0;font-size:0.95rem;color:#4a2e22;line-height:1.8;">Your deposit of <strong style="color:#9e7c4a;">${amount}</strong> has been received — your appointment is officially secured. Ankita can't wait to work with you! 💄</p></div>${detailRows?`<div style="padding:20px 36px 0;"><table style="width:100%;border-collapse:collapse;border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">${detailRows}</table></div>`:''}<div style="padding:20px 36px 0;">${calSection}</div><div style="padding:24px 36px 32px;"><p style="margin:0;font-size:0.92rem;color:#4a2e22;line-height:1.8;">Can't wait to make you look stunning 💛<br><br>With love,<br><strong style="color:#9e7c4a;">Ankita</strong></p></div><div style="background:#fdf0ee;padding:16px 36px;border-top:1px solid #f0ddd8;text-align:center;"><p style="margin:0;font-size:0.75rem;color:#b09080;">Questions? Visit <a href="${siteUrl}" style="color:#c9a96e;">theglambyankita.com</a></p></div></div>`
        });
      }

      await transporter.sendMail({
        from:`"The Glam by Ankita" <${user}>`, to:ADMIN_EMAIL,
        subject:`💳 Deposit paid — ${clientName} (${amount})`,
        html:`<div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;"><div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:22px 28px;"><h2 style="margin:0;color:#fff;">✅ Deposit Received — ${amount}</h2></div><div style="padding:24px 28px;"><p style="margin:0 0 8px;font-size:0.95rem;color:#2c1810;"><strong>${clientName}</strong> paid by card.</p>${clientEmail?`<p style="margin:0 0 16px;font-size:0.88rem;color:#6b3d2e;">Email: ${clientEmail}</p>`:''}<table style="width:100%;border-collapse:collapse;border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">${detailRows}</table></div></div>`
      });
    } catch(emailErr) { console.error('confirm-payment email error:', emailErr); }
  }

  res.json({ ok:true });
});

// ── POST /select-cash ─────────────────────────────────────────────
app.post('/select-cash', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error:'Token required' });
  let booking;
  try { booking = decodeToken(token); } catch(e) { return res.status(400).json({ error:'Invalid token' }); }

  const confirmedData = booking.confirmedData || booking.confirmed_data || {};
  const clientName = booking.clientName || booking.client_name || confirmedData['First Name'] || 'Client';
  const clientEmail = booking.clientEmail || booking.client_email || confirmedData['Email'] || '';
  const totalAud = booking.totalAud ?? booking.total_aud ?? null;
  const amount = totalAud ? `AUD $${parseFloat(totalAud).toFixed(2)}` : 'TBC';
  const notes = booking.notes || '';
  const bookingId = generateBookingId();

  try {
    const db = getPool();
    await db.query(`CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY, client_name TEXT, client_email TEXT, service TEXT, booking_date TEXT, booking_time TEXT, location TEXT, num_people TEXT, total_aud NUMERIC(10,2), payment_method TEXT, status TEXT DEFAULT 'confirmed', stripe_payment_intent_id TEXT, booking_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
    try { await db.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_id TEXT'); } catch {}
    await db.query(`INSERT INTO bookings (client_name,client_email,service,booking_date,booking_time,location,num_people,total_aud,payment_method,status,booking_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'cash','confirmed',$9)`,
      [clientName,clientEmail,confirmedData['Service']||null,confirmedData['Date']||null,confirmedData['Time']||null,confirmedData['Location']||null,confirmedData['Number of People']||null,totalAud!=null?parseFloat(totalAud):null,bookingId]);
  } catch(e) { console.error('DB save cash booking error:', e); }

  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (user && pass) {
    try {
      const transporter = nodemailer.createTransport({ service:'gmail', auth:{user,pass} });
      const detailRows = Object.entries(confirmedData).filter(([,v])=>v).map(([k,v])=>`<tr><td style="padding:8px 14px;font-size:0.82rem;font-weight:700;color:#9a7060;width:38%;background:#fdf0ee;border-bottom:1px solid #fdeee8;">${k}</td><td style="padding:8px 14px;font-size:0.9rem;color:#2c1810;border-bottom:1px solid #fdeee8;">${v}</td></tr>`).join('');
      const calSection = buildCalendarButtons({ date:confirmedData['Date'], time:confirmedData['Time'], service:confirmedData['Service'], location:confirmedData['Location'], numPeople:confirmedData['Number of People'] });

      if (clientEmail) {
        await transporter.sendMail({
          from:`"The Glam by Ankita" <${user}>`, to:clientEmail,
          subject:`✅ Booking Confirmed — The Glam by Ankita`,
          html:`<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:10px;overflow:hidden;"><div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:32px 36px;"><h1 style="margin:0;font-size:1.6rem;color:#fff;">Booking Confirmed! ✅</h1><p style="margin:8px 0 0;font-size:0.88rem;color:rgba(255,255,255,0.9);">Your appointment is locked in!</p></div><div style="padding:28px 36px 0;"><p style="margin:0;font-size:1rem;color:#2c1810;">Hi <strong>${clientName}</strong>,</p><p style="margin:10px 0 0;font-size:0.95rem;color:#4a2e22;line-height:1.8;">Your booking is confirmed! You've chosen to pay <strong style="color:#9e7c4a;">${amount}</strong> in cash at the appointment. I can't wait to work with you! ✨</p></div>${notes?`<div style="padding:16px 36px 0;"><div style="background:#fff8f0;border-left:3px solid #c9a96e;padding:14px 18px;border-radius:0 6px 6px 0;"><p style="margin:0 0 4px;font-size:0.75rem;font-weight:700;color:#c9a96e;text-transform:uppercase;letter-spacing:0.1em;">A note from Ankita</p><p style="margin:0;font-size:0.92rem;color:#4a2e22;line-height:1.7;">${notes}</p></div></div>`:''}<div style="padding:16px 36px 0;"><table style="width:100%;border-collapse:collapse;border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">${detailRows}</table></div><div style="padding:20px 36px 0;">${calSection}</div><div style="padding:24px 36px 32px;"><p style="margin:0;font-size:0.92rem;color:#4a2e22;line-height:1.8;">Can't wait to make you look stunning 💛<br><br>With love,<br><strong style="color:#9e7c4a;">Ankita</strong></p></div><div style="background:#fdf0ee;padding:16px 36px;border-top:1px solid #f0ddd8;text-align:center;"><p style="margin:0;font-size:0.75rem;color:#b09080;">Questions? Visit <a href="${SITE_URL}" style="color:#c9a96e;">theglambyankita.com</a></p></div></div>`
        });
      }

      await transporter.sendMail({
        from:`"The Glam by Ankita" <${user}>`, to:ADMIN_EMAIL,
        subject:`💵 Cash payment selected — ${clientName}`,
        html:`<div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;"><div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:22px 28px;"><h2 style="margin:0;color:#fff;">💵 Cash Payment Selected</h2></div><div style="padding:24px 28px;"><p style="margin:0 0 8px;"><strong>${clientName}</strong> chose cash — collect <strong>${amount}</strong> at the appointment.</p>${clientEmail?`<p style="margin:0 0 8px;font-size:0.88rem;color:#6b3d2e;">Email: ${clientEmail}</p>`:''}<p style="margin:0 0 16px;font-size:0.85rem;color:#9e7c4a;">Booking ref: <strong style="font-family:'Courier New',monospace;">${bookingId}</strong></p><table style="width:100%;border-collapse:collapse;border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">${detailRows}</table></div></div>`
      });
    } catch(emailErr) { console.error('select-cash email error:', emailErr); }
  }

  res.json({ ok:true });
});

// ── POST /send-confirmation ───────────────────────────────────────
app.post('/send-confirmation', async (req, res) => {
  const { booking_data, client_name, client_email, confirmed_data, notes, total_aud } = req.body;
  if (!confirmed_data) return res.status(400).json({ error:'confirmed_data required' });

  const resolvedClientName = client_name || confirmed_data['First Name'] || 'Client';
  const resolvedClientEmail = client_email || confirmed_data['Email'] || '';
  if (!total_aud || parseFloat(total_aud) <= 0) return res.status(400).json({ error:'A deposit amount is required.' });

  const tokenData = { clientName:resolvedClientName, clientEmail:resolvedClientEmail, confirmedData:confirmed_data, notes:notes||'', totalAud:parseFloat(total_aud), issuedAt:Date.now() };
  const clientToken = createBookingToken(tokenData);
  const clientLink = `${SITE_URL}/p?t=${clientToken}`;

  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (user && pass && resolvedClientEmail) {
    try {
      const transporter = nodemailer.createTransport({ service:'gmail', auth:{user,pass} });
      const firstName = confirmed_data['First Name'] || resolvedClientName;
      const amountDisplay = `AUD $${parseFloat(total_aud).toFixed(2)}`;
      const detailRows = Object.entries(confirmed_data).filter(([,v])=>v).map(([k,v])=>`<tr><td style="padding:10px 16px;font-size:0.82rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;width:38%;border-bottom:1px solid #fdeee8;">${k}</td><td style="padding:10px 16px;font-size:0.92rem;color:#2c1810;border-bottom:1px solid #fdeee8;">${v}</td></tr>`).join('');

      await transporter.sendMail({
        from:`"The Glam by Ankita" <${user}>`, to:resolvedClientEmail,
        subject:`✨ Confirm Your Booking & Complete Payment — The Glam by Ankita`,
        html:`<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:10px;overflow:hidden;"><div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:32px 36px;"><p style="margin:0 0 6px;font-size:0.75rem;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.15em;">The Glam by Ankita</p><h1 style="margin:0;font-size:1.7rem;color:#fff;">Your Booking is Confirmed! ✨</h1><p style="margin:8px 0 0;font-size:0.88rem;color:rgba(255,255,255,0.9);">One last step — complete your payment to lock in your date 💄</p></div><div style="padding:28px 36px 0;"><p style="margin:0;font-size:1rem;color:#2c1810;">Hi <strong>${firstName}</strong>,</p><p style="margin:10px 0 0;font-size:0.95rem;color:#4a2e22;line-height:1.8;">I am so excited to work with you! Please review your booking details below, then click the button to confirm and complete your payment 🎉</p></div><div style="padding:24px 36px 0;"><table style="width:100%;border-collapse:collapse;border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">${detailRows}</table></div>${notes?`<div style="padding:16px 36px 0;"><div style="background:#fff8f0;border-left:3px solid #c9a96e;padding:14px 18px;border-radius:0 6px 6px 0;"><p style="margin:0 0 4px;font-size:0.75rem;font-weight:700;color:#c9a96e;text-transform:uppercase;">A note from Ankita</p><p style="margin:0;font-size:0.92rem;color:#4a2e22;line-height:1.7;">${notes}</p></div></div>`:''}<div style="padding:16px 36px 0;"><div style="background:#fdf8f4;border:1px solid #f0ddd8;border-radius:6px;padding:16px 20px;"><p style="margin:0;font-size:0.75rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.1em;">Total Amount Due</p><p style="margin:4px 0 0;font-size:1.8rem;font-weight:700;color:#9e7c4a;">${amountDisplay}</p></div></div><div style="padding:28px 36px;text-align:center;"><a href="${clientLink}" style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;padding:16px 40px;border-radius:5px;font-size:1rem;font-weight:700;letter-spacing:0.05em;">Confirm Booking &amp; Pay ✦</a></div><div style="padding:0 36px 32px;"><p style="margin:0;font-size:0.92rem;color:#4a2e22;line-height:1.8;">Can't wait to make you look stunning 💛<br><br>With love,<br><strong style="color:#9e7c4a;">Ankita</strong></p></div><div style="background:#fdf0ee;padding:16px 36px;border-top:1px solid #f0ddd8;text-align:center;"><p style="margin:0;font-size:0.75rem;color:#b09080;">Questions? Visit <a href="${SITE_URL}" style="color:#c9a96e;">theglambyankita.com</a></p></div></div>`
      });

      const ownerDetailRows = Object.entries(confirmed_data).filter(([,v])=>v).map(([k,v])=>`<tr><td style="padding:6px 14px;font-size:0.82rem;font-weight:700;color:#9a7060;width:38%;background:#fdf0ee;border-bottom:1px solid #fdeee8;">${k}</td><td style="padding:6px 14px;font-size:0.9rem;color:#2c1810;border-bottom:1px solid #fdeee8;">${v}</td></tr>`).join('');
      await transporter.sendMail({
        from:`"The Glam by Ankita" <${user}>`, to:ADMIN_EMAIL,
        subject:`📨 Confirmation sent to ${resolvedClientName} — deposit ${amountDisplay}`,
        html:`<div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;"><div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:22px 28px;"><h2 style="margin:0;color:#fff;">📨 Confirmation Sent to ${resolvedClientName}</h2><p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">They have been emailed their payment link.</p></div><div style="padding:22px 28px;"><p style="margin:0 0 8px;font-size:0.9rem;color:#2c1810;">Client: <strong>${resolvedClientName}</strong> &lt;${resolvedClientEmail}&gt;</p><p style="margin:0 0 16px;font-size:0.9rem;color:#2c1810;">Deposit: <strong style="color:#9e7c4a;">${amountDisplay}</strong></p><table style="width:100%;border-collapse:collapse;border:1px solid #fdeee8;border-radius:6px;overflow:hidden;">${ownerDetailRows}</table></div></div>`
      });
    } catch(e) { console.error('send-confirmation error:', e); }
  }

  res.json({ ok:true });
});

// ── POST /send-email ──────────────────────────────────────────────
app.post('/send-email', async (req, res) => {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return res.status(503).json({ error:'Email not configured.' });

  const form = formidable({ maxFileSize:10*1024*1024, maxFiles:5 });
  let fields, files;
  try { [fields, files] = await form.parse(req); } catch(e) { return res.status(400).json({ error:'Failed to parse request.' }); }

  const get = k => (Array.isArray(fields[k]) ? fields[k][0] : fields[k]) || '';
  const type = get('type'), isBooking = type === 'booking';
  const clientEmail = get('client_email') || get('collab_email') || get('from_email');
  const firstName = get('first_name'), lastName = get('last_name');
  const clientName = firstName ? `${firstName} ${lastName}`.trim() : (get('name') || 'there');
  const subject = isBooking ? `New Booking Request from ${clientName}` : `New Collab Enquiry from ${clientName}`;

  const labelMap = { first_name:'First Name', last_name:'Last Name', client_email:'Email', phone:'Phone', contact_method:'Preferred Contact', preferred_date:'Preferred Date', num_people:'Number of People', services:'Services', location:'Suburb / Location', postcode:'Postcode', referral:'How They Found You', vision:'Look / Vision', name:'Name', brand:'Brand / Company', collab_email:'Email', instagram:'Instagram Handle', collab_type:'Collaboration Type', project_desc:'Project Description' };
  const toLabel = k => labelMap[k] || k.split('_').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
  const excludeKeys = ['type','owner_email','from_email'];
  const rows = Object.entries(fields).filter(([k])=>!excludeKeys.includes(k)).map(([k,v])=>`<tr><td style="padding:8px 14px;font-weight:700;color:#6b3d2e;white-space:nowrap;background:#fdf0ee;border-bottom:1px solid #f0ddd6;">${toLabel(k)}</td><td style="padding:8px 14px;color:#2c1810;border-bottom:1px solid #f0ddd6;">${Array.isArray(v)?v[0]:v||'—'}</td></tr>`).join('');
  const fileList = Object.values(files).flat();

  let reviewButtonHtml = '';
  if (isBooking) {
    const bookingData = { _client_name:clientName, _client_email:clientEmail };
    Object.entries(fields).forEach(([k,v])=>{ bookingData[k] = Array.isArray(v)?v[0]:v; });
    const encoded = Buffer.from(JSON.stringify(bookingData)).toString('base64url');
    const reviewLink = `${SITE_URL}/r?b=${encoded}`;
    reviewButtonHtml = `<div style="text-align:center;padding:24px 32px 28px;background:#fff8f0;border-top:2px solid #e8c4bc;"><p style="margin:0 0 14px;font-size:0.88rem;color:#6b3d2e;font-weight:600;">Ready to confirm this booking?</p><a href="${reviewLink}" style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;padding:14px 32px;border-radius:5px;font-weight:700;font-size:0.95rem;display:inline-block;">✦ Review &amp; Send Confirmation to Client</a></div>`;
  }

  const transporter = nodemailer.createTransport({ service:'gmail', auth:{user,pass} });

  const ownerHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;"><div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;"><h2 style="margin:0;color:#fff;">${subject}</h2><p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">Via The Glam by Ankita website</p></div><table style="width:100%;border-collapse:collapse;font-size:0.9rem;">${rows}</table>${fileList.length>0?`<p style="padding:12px 16px;color:#6b3d2e;font-size:0.85rem;">📎 ${fileList.length} attachment(s) included.</p>`:''}${reviewButtonHtml}</div>`;

  const attachments = fileList.map(f=>({ filename:f.originalFilename||'attachment', path:f.filepath }));
  const ownerEmail = get('owner_email') || ADMIN_EMAIL;
  await transporter.sendMail({ from:`"The Glam by Ankita" <${user}>`, to:ownerEmail, subject, html:ownerHtml, attachments }).catch(e=>console.error('send-email owner error:',e));

  if (clientEmail) {
    const confirmHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;"><div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;"><h2 style="margin:0;color:#fff;">✨ ${isBooking?'Booking Request Received!':'Enquiry Received!'}</h2><p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">The Glam by Ankita</p></div><div style="padding:28px 32px;"><p style="font-size:1rem;color:#2c1810;margin:0 0 16px;">Hi ${clientName},</p><p style="font-size:0.95rem;color:#4a2e22;line-height:1.75;">${isBooking?"I've received your booking request and I'll be in touch soon to confirm the details and send you a payment link! ✨":"Thank you for reaching out! I'll review your enquiry and get back to you soon. ✨"}</p></div><div style="padding:18px 32px 28px;"><p style="font-size:0.9rem;color:#6b3d2e;margin:0;">With love,<br><strong>Ankita</strong><br>The Glam by Ankita ✦</p></div></div>`;
    await transporter.sendMail({ from:`"The Glam by Ankita" <${user}>`, to:clientEmail, subject:isBooking?'Booking request received — The Glam by Ankita ✨':'Enquiry received — The Glam by Ankita ✨', html:confirmHtml }).catch(e=>console.error('send-email client error:',e));
  }

  res.json({ ok:true });
});

// ── GET /r — review booking (Ankita's review page) ────────────────
app.get('/r', (req, res) => {
  const { b } = req.query;
  if (!b) return res.status(400).send('<h2>No booking token found.</h2>');
  let d;
  try { d = JSON.parse(Buffer.from(b,'base64url').toString('utf8')); } catch(e) { return res.status(400).send('<h2>Invalid booking link.</h2>'); }

  const val = (...keys) => { for (const k of keys) { if (d[k]) return esc(d[k]); } return ''; };
  const labels = { first_name:'First Name', last_name:'Last Name', client_email:'Email', phone:'Phone', contact_method:'Preferred Contact', preferred_date:'Requested Date', num_people:'Number of People', services:'Services Requested', location:'Location / Suburb', postcode:'Postcode', referral:'How They Found You', vision:'Look / Vision / Inspo' };
  const skip = new Set(['owner_email','from_email','_client_email','_client_name','type']);
  const rawRows = Object.entries(d).filter(([k,v])=>!skip.has(k)&&v).map(([k,v])=>`<div class="raw-row"><span class="raw-key">${esc(labels[k]||k.replace(/_/g,' '))}</span><span class="raw-val">${esc(v)}</span></div>`).join('');

  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review Booking — The Glam by Ankita</title><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fdf8f4;color:#2c1810;min-height:100vh}.logo-bar{display:flex;align-items:center;gap:10px;padding:16px 32px;background:#fdf8f4;border-bottom:1px solid #e8c4bc}.logo-bar img{width:36px;height:36px;border-radius:50%;object-fit:cover}.logo-bar span{font-size:1.1rem;color:#6b3d2e;font-style:italic}.header{background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:28px 32px}.header h1{color:#fff;font-size:1.5rem;font-weight:700;margin:0}.header p{margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem}.body{max-width:680px;margin:0 auto;padding:32px 24px 60px}.card{background:#fff;border:1px solid #e8c4bc;border-radius:8px;padding:20px 24px;margin-bottom:16px}.card h3{font-size:1rem;color:#2c1810;margin:0 0 16px;padding-bottom:10px;border-bottom:1px solid #f5ddd8}.raw-row{display:flex;gap:12px;padding:6px 0;border-bottom:1px solid #f5ddd8}.raw-row:last-child{border-bottom:none}.raw-key{min-width:165px;font-weight:700;color:#9e7c4a;flex-shrink:0;font-size:0.88rem}.raw-val{color:#2c1810;font-size:0.88rem;line-height:1.6}.field{margin-bottom:14px}.field label{display:block;font-size:0.78rem;font-weight:700;color:#9e7c4a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px}.field input,.field textarea,.field select{width:100%;padding:9px 12px;border:1.5px solid #e8c4bc;border-radius:4px;font-family:inherit;font-size:0.9rem;color:#2c1810;background:#fdf8f4;outline:none;transition:border-color 0.2s}.field input:focus,.field textarea:focus{border-color:#c9a96e}.field textarea{resize:vertical;min-height:80px}.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:480px){.row2{grid-template-columns:1fr}}.deposit-card{border:2px solid #c9a96e;background:linear-gradient(135deg,#fdf8f4,#fdf0ee)}.btn{width:100%;padding:14px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border:none;border-radius:4px;font-family:inherit;font-weight:700;font-size:0.95rem;cursor:pointer;transition:opacity 0.2s,transform 0.2s;margin-top:8px}.btn:hover{opacity:0.9;transform:translateY(-1px)}.btn:disabled{opacity:0.6;cursor:not-allowed;transform:none}.error-msg{background:#fff0f0;border:1px solid #f5c0c0;color:#c62828;padding:10px 14px;border-radius:4px;font-size:0.85rem;margin-bottom:12px;display:none}.success-box{display:none;text-align:center;padding:32px 0}.success-icon{font-size:3rem;margin-bottom:12px}.success-box h3{color:#2c1810;margin:0 0 8px}.success-box p{color:#6b3d2e;font-size:0.9rem}.spinner{display:none;width:18px;height:18px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-right:8px}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="logo-bar"><img src="${SITE_URL}/logo-original.png" alt=""><span>The Glam by Ankita</span></div><div class="header"><h1>Review Booking Request</h1><p>Edit details, set deposit, then send to client</p></div><div class="body"><div class="card" style="background:#fff9f0;border:1.5px solid #e8d5a3;"><h3 style="color:#9e7c4a;">📋 Client's Full Submission</h3><div>${rawRows||'<em style="color:#9a7060;">No details found.</em>'}</div></div><div id="main-content"><div class="card"><h3>Confirm Client Details <span style="font-weight:400;font-size:0.75rem;color:#9a7060;">edit if needed</span></h3><div class="row2"><div class="field"><label>First Name</label><input type="text" id="rv-first-name" value="${val('first_name')}"></div><div class="field"><label>Last Name</label><input type="text" id="rv-last-name" value="${val('last_name')}"></div></div><div class="row2"><div class="field"><label>Email</label><input type="email" id="rv-email" value="${val('_client_email','client_email')}"></div><div class="field"><label>Phone</label><input type="tel" id="rv-phone" value="${val('phone')}"></div></div></div><div class="card"><h3>Confirm Booking Details <span style="font-weight:400;font-size:0.75rem;color:#9a7060;">edit if needed</span></h3><div class="row2"><div class="field"><label>Confirmed Date</label><input type="date" id="rv-date" value="${val('preferred_date')}"></div><div class="field"><label>Time</label><input type="time" id="rv-time"></div></div><div class="field"><label>Service</label><input type="text" id="rv-service" value="${val('services','service')}"></div><div class="row2"><div class="field"><label>Number of People</label><input type="number" id="rv-num-people" min="1" value="${val('num_people')}"></div><div class="field"><label>Location / Address</label><input type="text" id="rv-location" value="${val('location')}"></div></div></div><div class="card deposit-card"><h3>💰 Set Deposit Amount</h3><div class="field"><label>Amount to Charge (AUD $)</label><input type="number" id="rv-total" min="0" step="0.01" placeholder="e.g. 150" style="font-size:1.1rem;font-weight:700;"></div></div><div class="card"><h3>Personal Note to Client <span style="font-weight:400;font-size:0.8rem;color:#9a7060;">(optional)</span></h3><div class="field"><textarea id="rv-notes" placeholder="e.g. So excited to see you! Please arrive with a clean face…"></textarea></div></div><div class="error-msg" id="rv-error"></div><button class="btn" id="rv-send-btn" onclick="sendConfirmation()"><span class="spinner" id="rv-spinner"></span>Send Confirmation to Client ✦</button><div class="success-box" id="rv-success"><div class="success-icon">✅</div><h3>Confirmation Sent!</h3><p>The client has been emailed their confirmation and payment link.</p></div></div></div><script>async function sendConfirmation(){var btn=document.getElementById('rv-send-btn'),spinner=document.getElementById('rv-spinner'),errEl=document.getElementById('rv-error');var firstName=document.getElementById('rv-first-name').value.trim();var email=document.getElementById('rv-email').value.trim();var total=parseFloat(document.getElementById('rv-total').value);errEl.style.display='none';if(!email){errEl.textContent='Please enter the client email.';errEl.style.display='block';return;}if(!total||total<=0){errEl.textContent='Please set a deposit amount greater than $0.';errEl.style.display='block';return;}btn.disabled=true;spinner.style.display='inline-block';var confirmed_data={'First Name':firstName,'Last Name':document.getElementById('rv-last-name').value.trim(),'Email':email,'Phone':document.getElementById('rv-phone').value.trim(),'Date':document.getElementById('rv-date').value,'Time':document.getElementById('rv-time').value,'Service':document.getElementById('rv-service').value.trim(),'Number of People':document.getElementById('rv-num-people').value,'Location':document.getElementById('rv-location').value.trim()};try{var res=await fetch('/api/send-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:firstName,client_email:email,confirmed_data,notes:document.getElementById('rv-notes').value,total_aud:total})});if(!res.ok){var j=await res.json().catch(()=>({}));throw new Error(j.error||'Server error ('+res.status+')');}document.getElementById('main-content').style.display='none';document.getElementById('rv-success').style.display='block';}catch(e){errEl.textContent=e.message||'Something went wrong. Please try again.';errEl.style.display='block';btn.disabled=false;spinner.style.display='none';}}</script></body></html>`);
});

// ── POST /admin-send-email ────────────────────────────────────────
app.post('/admin-send-email', async (req, res) => {
  const token = req.query.token;
  const valid = await validateAdminToken(token);
  if (!valid) return res.status(403).json({ error:'Unauthorized' });

  const { to, subject, body } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error:'Missing required fields.' });

  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return res.status(503).json({ error:'Email not configured.' });

  const transporter = nodemailer.createTransport({ service:'gmail', auth:{user,pass} });
  const paragraphs = body.split('\n').map(line=>line.trim()?`<p style="font-size:0.95rem;color:#4a2e22;line-height:1.75;margin:0 0 12px;">${esc(line)}</p>`:`<div style="height:8px;"></div>`).join('');
  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;"><div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;"><h2 style="margin:0;color:#fff;">The Glam by Ankita</h2></div><div style="padding:28px 32px 8px;">${paragraphs}</div><div style="padding:20px 32px 28px;"><p style="font-size:0.9rem;color:#6b3d2e;margin:0;">With love,<br><strong>Ankita</strong><br>The Glam by Ankita ✦</p></div></div>`;
  try {
    await transporter.sendMail({ from:`"The Glam by Ankita" <${user}>`, to, subject, html });
    res.json({ ok:true });
  } catch(e) {
    console.error('Admin send-email error:', e);
    res.status(500).json({ error:'Failed to send email.' });
  }
});

// ── GET & POST /admin ─────────────────────────────────────────────
async function ensureAdminTables() {
  const db = getPool();
  await db.query(`CREATE TABLE IF NOT EXISTS admin_tokens (id SERIAL PRIMARY KEY, token TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL); CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY, client_name TEXT, client_email TEXT, service TEXT, booking_date TEXT, booking_time TEXT, location TEXT, num_people TEXT, total_aud NUMERIC(10,2), payment_method TEXT, status TEXT DEFAULT 'confirmed', stripe_payment_intent_id TEXT, booking_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
  try { await db.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_id TEXT'); } catch {}
}

async function saveAdminToken(token) {
  const db = getPool();
  const expiresAt = new Date(); expiresAt.setMonth(expiresAt.getMonth()+3);
  await db.query('DELETE FROM admin_tokens');
  await db.query('INSERT INTO admin_tokens (token,expires_at) VALUES ($1,$2)', [token,expiresAt]);
  return expiresAt;
}

async function sendAdminTokenEmail(token) {
  const adminUrl = `${SITE_URL}/api/admin?token=${token}`;
  const transporter = createTransporter();
  if (!transporter) return { sent:false, adminUrl };
  await transporter.sendMail({ from:`"The Glam by Ankita" <${process.env.GMAIL_USER}>`, to:ADMIN_EMAIL, subject:'✦ Your new admin dashboard link — The Glam by Ankita', html:`<div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;"><div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;"><h2 style="margin:0;color:#fff;">✦ Admin Dashboard Access</h2></div><div style="padding:28px 32px;"><p style="margin:0 0 16px;">Hi Ankita! Here's your new admin dashboard link. Keep it private.</p><a href="${adminUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:700;">✦ Open Admin Dashboard</a><p style="margin:20px 0 0;font-size:0.78rem;color:#aaa;word-break:break-all;">${adminUrl}</p></div></div>` }).catch(e=>console.error('Admin token email error:',e));
  return { sent:true, adminUrl };
}

app.post('/admin', async (req, res) => {
  try { await ensureAdminTables(); } catch(e) { console.error('ensureAdminTables error:', e); }
  const action = req.query.action, token = req.query.token;

  if (action === 'request') {
    const newToken = randomUUID();
    try {
      await saveAdminToken(newToken);
      const { sent, adminUrl } = await sendAdminTokenEmail(newToken);
      return res.json({ ok:true, emailSent:sent, adminUrl });
    } catch(e) {
      return res.status(500).json({ error:'Database unavailable.' });
    }
  }

  const valid = await validateAdminToken(token);
  if (!valid) return res.status(403).json({ error:'Unauthorized' });

  try {
    const newToken = randomUUID();
    await saveAdminToken(newToken);
    sendAdminTokenEmail(newToken).catch(e=>console.error('Regen email error:',e));
    res.json({ ok:true });
  } catch(e) {
    res.status(500).json({ error:'Failed to regenerate token.' });
  }
});

app.get('/admin', async (req, res) => {
  try { await ensureAdminTables(); } catch(e) { console.error('ensureAdminTables error:', e); }
  const token = req.query.token;
  const valid = await validateAdminToken(token);

  if (!valid) {
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin — The Glam by Ankita</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#fdf8f4;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.box{text-align:center;padding:40px 32px;background:#fff;border:1px solid #e8c4bc;border-radius:12px;max-width:480px;width:100%;}h2{color:#6b3d2e;margin-bottom:12px;}p{color:#4a2e22;font-size:0.9rem;line-height:1.6;margin-bottom:20px;}.btn{display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;cursor:pointer;}.btn:disabled{opacity:0.5;cursor:not-allowed;}.note{font-size:0.82rem;color:#9e7c4a;margin-top:14px;}.link-box{margin-top:20px;padding:14px 16px;background:#fdf0ee;border:1px solid #e8c4bc;border-radius:8px;text-align:left;display:none;}.link-box p{margin:0 0 8px;font-size:0.82rem;font-weight:700;color:#6b3d2e;}.link-box a{display:block;word-break:break-all;font-size:0.8rem;color:#c9a96e;text-decoration:none;border:1px solid #e8c4bc;padding:8px 10px;border-radius:5px;background:#fff;margin-bottom:10px;}.open-btn{display:inline-block;padding:10px 22px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;border-radius:6px;font-size:0.88rem;font-weight:700;}.err{font-size:0.82rem;color:#c0392b;margin-top:12px;display:none;}</style></head><body><div class="box"><h2>✦ Admin Access</h2><p>This link has expired or is invalid.<br>Click below to generate a fresh admin link.</p><button class="btn" id="btn" onclick="sendLink()">Generate new link</button><p class="note" id="note"></p><div class="link-box" id="link-box"><p>Your admin link:</p><a id="link-url" href="#" target="_blank"></a><a class="open-btn" id="link-open" href="#" target="_blank">✦ Open Admin Dashboard</a></div><p class="err" id="err-msg"></p></div><script>async function sendLink(){var btn=document.getElementById('btn'),note=document.getElementById('note'),errMsg=document.getElementById('err-msg'),linkBox=document.getElementById('link-box');btn.disabled=true;btn.textContent='Generating…';note.textContent='';errMsg.style.display='none';linkBox.style.display='none';try{var res=await fetch('/api/admin?action=request',{method:'POST'});var j=await res.json();if(!res.ok)throw new Error(j.error||'Failed');btn.textContent=j.emailSent?'✅ Link sent!':'✅ Link generated!';note.textContent=j.emailSent?'Check your inbox at ${ADMIN_EMAIL}':'Email could not be sent — your link is shown below:';if(j.adminUrl){document.getElementById('link-url').textContent=j.adminUrl;document.getElementById('link-url').href=j.adminUrl;document.getElementById('link-open').href=j.adminUrl;linkBox.style.display='block';}}catch(e){btn.disabled=false;btn.textContent='Generate new link';errMsg.textContent='❌ '+(e.message||'Failed.');errMsg.style.display='block';}}</script></body></html>`);
  }

  // Valid token — show dashboard
  const db = getPool();
  const allBookings = await db.query('SELECT * FROM bookings ORDER BY created_at DESC').then(r=>r.rows).catch(()=>[]);
  const today = new Date().toISOString().split('T')[0];
  const upcoming = allBookings.filter(b=>b.booking_date&&b.booking_date>=today);
  const totalRevenue = allBookings.filter(b=>b.payment_method==='card'&&b.total_aud).reduce((s,b)=>s+Number(b.total_aud||0),0);
  const thisMonthPrefix = today.slice(0,7);
  const thisMonthRevenue = allBookings.filter(b=>b.booking_date&&b.booking_date.startsWith(thisMonthPrefix)&&b.total_aud).reduce((s,b)=>s+Number(b.total_aud||0),0);

  const view = (req.query.view||'all').toLowerCase();
  const displayed = view==='upcoming'?upcoming:view==='past'?allBookings.filter(b=>!b.booking_date||b.booking_date<today):view==='card'?allBookings.filter(b=>b.payment_method==='card'):allBookings;

  const bookingRows = displayed.map((b,i)=>{
    const badge = b.payment_method==='cash'?`<span style="background:#f0e8c8;color:#8a6a00;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Cash</span>`:`<span style="background:#e8f4e8;color:#2c6e3f;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Card</span>`;
    return `<tr style="border-bottom:1px solid #f0ddd6;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'table-row':'none'"><td style="padding:10px 12px;font-weight:600;">${esc(b.client_name||'—')}</td><td style="padding:10px 12px;font-size:0.85rem;">${esc(b.client_email||'—')}</td><td style="padding:10px 12px;font-size:0.85rem;">${esc(b.service||'—')}</td><td style="padding:10px 12px;font-size:0.85rem;white-space:nowrap;">${esc(b.booking_date||'—')}${b.booking_time?` ${esc(b.booking_time)}`:''}</td><td style="padding:10px 12px;font-size:0.85rem;">${b.total_aud?`A$${Number(b.total_aud).toFixed(2)}`:'—'}</td><td style="padding:10px 12px;">${badge}</td></tr><tr style="display:none;background:#fdf8f4;"><td colspan="6" style="padding:12px 20px;font-size:0.83rem;color:#4a2e22;">${b.location?`<strong>Location:</strong> ${esc(b.location)} &nbsp;`:''} ${b.num_people?`<strong>People:</strong> ${esc(b.num_people)} &nbsp;`:''} ${b.booking_id?`<strong>Ref:</strong> <code>${esc(b.booking_id)}</code> &nbsp;`:''}</td></tr>`;
  }).join('');

  const baseUrl = `/api/admin?token=${encodeURIComponent(token)}`;
  const tabBtn = (v,label) => `<a href="${baseUrl}${v==='all'?'':('&view='+v)}" style="padding:7px 14px;border:1.5px solid ${view===v?'transparent':'#e0c8c0'};border-radius:6px;font-size:0.85rem;font-weight:600;color:${view===v?'#fff':'#6b3d2e'};background:${view===v?'linear-gradient(135deg,#c9a96e,#9e7c4a)':'#fff'};text-decoration:none;display:inline-block;">${label}</a>`;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || '';
  const posPresets = ['top left','top center','top right','center left','center center','center right','bottom left','bottom center','bottom right'];
  const posIcons = ['↖','↑','↗','←','·','→','↙','↓','↘'];
  const posBtns = (fnName) => posPresets.map((p,i)=>`<button onclick="${fnName}('${p}')" style="padding:5px 2px;font-size:0.75rem;border:1px solid #e0c8c0;border-radius:4px;background:#fff;color:#6b3d2e;cursor:pointer;font-family:inherit;">${posIcons[i]}</button>`).join('');
  const gallerySectionHtml = `<div class="section"><div class="section-title">🖼️ Gallery Photos</div>
  <div class="card" style="padding:20px 24px;margin-bottom:16px;">
    <h3 style="font-size:0.93rem;color:#2c1810;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #f0ddd8;">Upload New Photo</h3>
    ${!cloudName?`<div style="background:#fff8e6;border:1px solid #f0c060;border-radius:6px;padding:12px 16px;margin-bottom:14px;font-size:0.83rem;color:#7a5a00;">⚠️ <strong>Cloudinary not configured.</strong> Add <code>CLOUDINARY_CLOUD_NAME</code> and <code>CLOUDINARY_UPLOAD_PRESET</code> to your environment variables to enable uploads. <a href="https://cloudinary.com/users/register/free" target="_blank" style="color:#c9a96e;text-decoration:underline;">Create free account →</a></div>`:''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div>
        <div class="field"><label>Photo</label><input type="file" id="gal-file" accept="image/*" onchange="galPreviewFile(event)" style="padding:8px;"></div>
        <div id="gal-preview-wrap" style="display:none;margin-bottom:10px;">
          <div style="font-size:0.72rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">Click image to set focus point</div>
          <div id="gal-preview-box" style="position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;border-radius:6px;cursor:crosshair;border:1.5px solid #e8c4bc;background:#f5e8e0;" onclick="galSetPos(event,this,'gal-preview-img','gal-focus-dot','gal-pos-val',true)">
            <img id="gal-preview-img" style="width:100%;height:100%;object-fit:cover;object-position:center center;pointer-events:none;" alt="Preview">
            <div id="gal-focus-dot" style="position:absolute;width:14px;height:14px;background:rgba(201,169,110,0.9);border:2.5px solid #fff;border-radius:50%;transform:translate(-50%,-50%);left:50%;top:50%;pointer-events:none;box-shadow:0 0 0 3px rgba(0,0,0,0.2);transition:left 0.15s,top 0.15s;"></div>
          </div>
          <div id="gal-pos-val" style="font-size:0.76rem;color:#9e7c4a;margin-top:5px;text-align:center;">Focus: center center</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:6px;">${posBtns('galApplyUploadPos')}</div>
        </div>
        <div class="field"><label>Title</label><input type="text" id="gal-title" placeholder="e.g. Bridal Glam"></div>
      </div>
      <div>
        <div class="field"><label>Category</label><select id="gal-category" style="width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;"><option value="glam">Glam</option><option value="bridal">Bridal</option><option value="editorial">Editorial</option><option value="festival">Festival</option><option value="creative">Creative</option><option value="collab">Collab</option></select></div>
        <div class="field"><label>Description</label><textarea id="gal-desc" rows="3" placeholder="Short description…" style="min-height:75px;"></textarea></div>
        <button class="btn" id="gal-upload-btn" onclick="galUpload()" ${!cloudName?'disabled':''}>Upload Photo ✦</button>
        <div id="gal-upload-status" style="margin-top:10px;font-size:0.84rem;"></div>
      </div>
    </div>
  </div>
  <div class="card" style="padding:20px 24px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #f0ddd8;">
      <h3 style="font-size:0.93rem;color:#2c1810;margin:0;">All Photos</h3>
      <span style="font-size:0.76rem;color:#9a7060;">Click a photo to edit · drag to reorder</span>
    </div>
    <div id="gal-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;"></div>
    <div id="gal-empty" style="color:#9e7c4a;font-size:0.85rem;padding:20px 0;display:none;">No photos yet. Upload your first photo above!</div>
  </div>
</div>
<div id="gal-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;align-items:center;justify-content:center;padding:16px;">
  <div style="background:#fff;border-radius:12px;max-width:640px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.22);">
    <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:18px 24px;border-radius:12px 12px 0 0;"><h3 style="color:#fff;margin:0;font-size:1.05rem;">✏️ Edit Photo</h3></div>
    <div style="padding:20px 24px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:16px;">
        <div>
          <div style="font-size:0.72rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">Click to recenter image</div>
          <div id="gal-edit-pbox" style="position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;border-radius:6px;cursor:crosshair;border:1.5px solid #e8c4bc;background:#f5e8e0;" onclick="galSetPos(event,this,'gal-edit-img','gal-edit-dot','gal-edit-pos-val',false)">
            <img id="gal-edit-img" style="width:100%;height:100%;object-fit:cover;object-position:center center;pointer-events:none;" alt="">
            <div id="gal-edit-dot" style="position:absolute;width:14px;height:14px;background:rgba(201,169,110,0.9);border:2.5px solid #fff;border-radius:50%;transform:translate(-50%,-50%);left:50%;top:50%;pointer-events:none;box-shadow:0 0 0 3px rgba(0,0,0,0.2);transition:left 0.15s,top 0.15s;"></div>
          </div>
          <div id="gal-edit-pos-val" style="font-size:0.76rem;color:#9e7c4a;margin-top:5px;text-align:center;">Focus: center center</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:6px;">${posBtns('galEditApplyPos')}</div>
        </div>
        <div>
          <div class="field"><label>Title</label><input type="text" id="gal-edit-title"></div>
          <div class="field"><label>Category</label><select id="gal-edit-cat" style="width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;"><option value="glam">Glam</option><option value="bridal">Bridal</option><option value="editorial">Editorial</option><option value="festival">Festival</option><option value="creative">Creative</option><option value="collab">Collab</option></select></div>
          <div class="field"><label>Description</label><textarea id="gal-edit-desc" rows="3" style="min-height:70px;"></textarea></div>
        </div>
      </div>
      <div id="gal-edit-err" style="background:#fff0f0;border:1px solid #f5c0c0;color:#c62828;padding:10px 14px;border-radius:4px;font-size:0.85rem;margin-bottom:12px;display:none;"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn" style="flex:1;min-width:110px;" id="gal-save-btn" onclick="galEditSave()">Save ✦</button>
        <button id="gal-feat-btn" onclick="galToggleFeatured()" style="flex:1;min-width:110px;padding:13px 16px;border:1.5px solid #c9a96e;border-radius:8px;background:#fff;color:#9e7c4a;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:inherit;">⭐ Feature</button>
        <button onclick="galDelete()" style="padding:13px 16px;border:1.5px solid #f5c0c0;border-radius:8px;background:#fff;color:#c0392b;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:inherit;">🗑️ Delete</button>
        <button onclick="galCloseModal()" style="padding:13px 16px;border:1.5px solid #e0c8c0;border-radius:8px;background:#fff;color:#6b3d2e;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:inherit;">Cancel</button>
      </div>
    </div>
  </div>
</div>`;

  const couponSectionHtml = `<div class="section"><div class="section-title">🏷️ Promo Codes</div>
  <div class="card" style="padding:20px 24px;margin-bottom:16px;">
    <h3 style="font-size:0.93rem;color:#2c1810;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #f0ddd8;">Add New Promo Code</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;align-items:end;flex-wrap:wrap;">
      <div class="field" style="margin:0;"><label>Code</label><input type="text" id="cp-code" placeholder="e.g. SAVE20" style="text-transform:uppercase;"></div>
      <div class="field" style="margin:0;"><label>Type</label><select id="cp-type" style="width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;"><option value="percent">Percent (%)</option><option value="fixed">Fixed (A$)</option></select></div>
      <div class="field" style="margin:0;"><label>Value</label><input type="number" id="cp-value" placeholder="e.g. 20" min="0" step="0.01"></div>
      <div class="field" style="margin:0;"><label>Description</label><input type="text" id="cp-desc" placeholder="e.g. 20% off for crew"></div>
    </div>
    <div style="margin-top:12px;display:flex;align-items:center;gap:12px;">
      <button class="btn" onclick="cpAdd()" id="cp-add-btn" style="padding:10px 22px;font-size:0.88rem;">Add Code ✦</button>
      <span id="cp-add-status" style="font-size:0.83rem;"></span>
    </div>
  </div>
  <div class="card" style="padding:20px 24px;">
    <h3 style="font-size:0.93rem;color:#2c1810;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #f0ddd8;">All Promo Codes</h3>
    <div id="cp-list"><p style="color:#9e7c4a;font-size:0.85rem;">Loading…</p></div>
  </div>
</div>
<div id="cp-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;padding:16px;">
  <div style="background:#fff;border-radius:12px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
    <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:18px 24px;border-radius:12px 12px 0 0;"><h3 style="color:#fff;margin:0;font-size:1.05rem;">✏️ Edit Promo Code</h3></div>
    <div style="padding:20px 24px;">
      <input type="hidden" id="cp-edit-id">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div class="field" style="margin:0;"><label>Code</label><input type="text" id="cp-edit-code" style="text-transform:uppercase;"></div>
        <div class="field" style="margin:0;"><label>Type</label><select id="cp-edit-type" style="width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;"><option value="percent">Percent (%)</option><option value="fixed">Fixed (A$)</option></select></div>
        <div class="field" style="margin:0;"><label>Value</label><input type="number" id="cp-edit-value" min="0" step="0.01"></div>
        <div class="field" style="margin:0;"><label>Description</label><input type="text" id="cp-edit-desc"></div>
      </div>
      <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;"><input type="checkbox" id="cp-edit-valid" style="width:auto;"><label style="text-transform:none;font-size:0.9rem;letter-spacing:0;" for="cp-edit-valid">Active (can be used)</label></div>
      <div id="cp-edit-err" style="background:#fff0f0;border:1px solid #f5c0c0;color:#c62828;padding:10px 14px;border-radius:4px;font-size:0.85rem;margin-bottom:12px;display:none;"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn" style="flex:1;" onclick="cpEditSave()">Save ✦</button>
        <button onclick="cpEditDelete()" style="padding:13px 16px;border:1.5px solid #f5c0c0;border-radius:8px;background:#fff;color:#c0392b;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:inherit;">🗑️ Delete</button>
        <button onclick="cpCloseModal()" style="padding:13px 16px;border:1.5px solid #e0c8c0;border-radius:8px;background:#fff;color:#6b3d2e;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:inherit;">Cancel</button>
      </div>
    </div>
  </div>
</div>`;

  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Dashboard · The Glam by Ankita</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fdf8f4;color:#2c1810;min-height:100vh;}.topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 28px;background:#fff;border-bottom:1px solid #e8c4bc;}.logo-text{font-size:1rem;color:#6b3d2e;font-style:italic;}.header{background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:28px 32px;color:#fff;}.header h1{font-size:1.5rem;margin-bottom:4px;}.stats{display:flex;gap:16px;flex-wrap:wrap;margin-top:20px;}.stat{background:rgba(255,255,255,0.18);border-radius:8px;padding:12px 20px;text-align:center;min-width:100px;border:2px solid transparent;text-decoration:none;color:inherit;display:block;}.stat-val{font-size:1.6rem;font-weight:700;}.stat-lbl{font-size:0.75rem;opacity:0.88;margin-top:2px;}.content{max-width:1100px;margin:0 auto;padding:28px 20px 60px;}.section{margin-bottom:32px;}.section-title{font-size:1rem;color:#6b3d2e;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #e8c4bc;}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;}.card{background:#fff;border:1px solid #e8c4bc;border-radius:10px;overflow:hidden;}.table-wrap{overflow-x:auto;}table{width:100%;border-collapse:collapse;font-size:0.88rem;}th{padding:10px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.05em;background:#fdf5f0;border-bottom:1px solid #e8c4bc;white-space:nowrap;}tr:hover td{background:#fdf5f0;}.email-form{padding:24px;}.field{margin-bottom:16px;}label{display:block;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;}input,textarea{width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;outline:none;transition:border-color .2s;}input:focus,textarea:focus{border-color:#c9a96e;}textarea{resize:vertical;min-height:140px;}.btn{display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;cursor:pointer;}.btn:disabled{opacity:0.5;cursor:not-allowed;}.alert{padding:12px 16px;border-radius:6px;font-size:0.88rem;margin-bottom:16px;display:none;}.alert-success{background:#f0fff4;border:1px solid #a8e6b8;color:#2c6e3f;}.alert-error{background:#fff0f0;border:1px solid #f5c0c0;color:#c0392b;}</style></head><body>
<div class="topbar"><span class="logo-text">The Glam by Ankita</span><span style="background:#fdf0ee;color:#6b3d2e;font-size:0.75rem;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid #e8c4bc;">Admin Dashboard</span></div>
<div class="header"><h1>✦ Admin Dashboard</h1><p>View and manage all bookings, send emails to clients.</p>
<div class="stats">
  <a class="stat" href="${baseUrl}"><div class="stat-val">${allBookings.length}</div><div class="stat-lbl">Total Bookings</div></a>
  <a class="stat" href="${baseUrl}&view=upcoming"><div class="stat-val">${upcoming.length}</div><div class="stat-lbl">Upcoming</div></a>
  <a class="stat" href="${baseUrl}&view=card"><div class="stat-val">A$${totalRevenue.toFixed(2)}</div><div class="stat-lbl">Total Revenue</div></a>
  <a class="stat"><div class="stat-val">A$${thisMonthRevenue.toFixed(2)}</div><div class="stat-lbl">This Month</div></a>
</div></div>
<div class="content">
  <div class="section"><div class="section-title">📋 Bookings (${displayed.length})</div>
    <div class="toolbar">${tabBtn('all','All ('+allBookings.length+')')}${tabBtn('upcoming','Upcoming ('+upcoming.length+')')}${tabBtn('past','Past')}${tabBtn('card','Card payments')}</div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Client</th><th>Email</th><th>Service</th><th>Date & Time</th><th>Amount</th><th>Payment</th></tr></thead><tbody>${bookingRows}</tbody></table></div></div>
  </div>
  <div class="section"><div class="section-title">✉️ Send Email to Client</div>
    <div class="card"><div class="email-form">
      <div class="alert alert-success" id="email-success">Email sent successfully!</div>
      <div class="alert alert-error" id="email-error">Could not send email.</div>
      <div class="field"><label>Client Email</label><input type="email" id="e-to" placeholder="client@example.com"></div>
      <div class="field"><label>Subject</label><input type="text" id="e-subject" placeholder="e.g. Your upcoming appointment"></div>
      <div class="field"><label>Message</label><textarea id="e-body" placeholder="Hi [Name],&#10;&#10;Write your message here…"></textarea></div>
      <button class="btn" onclick="sendEmail()">Send Email ✦</button>
    </div></div>
  </div>
  ${gallerySectionHtml}
  ${couponSectionHtml}
  <div class="section"><div class="section-title">🔗 Admin Link</div>
    <div class="card" style="padding:20px 24px;">
      <p style="font-size:0.88rem;color:#4a2e22;margin-bottom:14px;">Regenerate your admin link (a new one will be emailed to you and this page will no longer work).</p>
      <button class="btn" style="padding:9px 20px;font-size:0.85rem;" id="regen-btn" onclick="regenToken()">Regenerate Admin Link</button>
      <span id="regen-status" style="margin-left:12px;font-size:0.83rem;color:#9e7c4a;"></span>
    </div>
  </div>
</div>
<script>
const TOKEN='${esc(token)}';
const CLOUD_NAME='${cloudName}';
const UPLOAD_PRESET='${uploadPreset}';
var _galPhotos=[];
var _galEditFilename='';
var _galEditPos='center center';
var _galUploadPos='center center';

// ── Shared position tool ──────────────────────────────────────────
function galSetPos(e,box,imgId,dotId,valId,isUpload){
  var rect=box.getBoundingClientRect();
  var x=Math.round(((e.clientX-rect.left)/rect.width)*100);
  var y=Math.round(((e.clientY-rect.top)/rect.height)*100);
  var pos=x+'% '+y+'%';
  document.getElementById(imgId).style.objectPosition=pos;
  document.getElementById(dotId).style.left=x+'%';
  document.getElementById(dotId).style.top=y+'%';
  document.getElementById(valId).textContent='Focus: '+pos;
  if(isUpload){_galUploadPos=pos;}else{_galEditPos=pos;}
}
function galApplyPreset(pos,imgId,dotId,valId,isUpload){
  document.getElementById(imgId).style.objectPosition=pos;
  var xMap={'left':'0%','center':'50%','right':'100%'};
  var yMap={'top':'0%','center':'50%','bottom':'100%'};
  var parts=pos.split(' ');
  document.getElementById(dotId).style.left=xMap[parts[1]||'center']||'50%';
  document.getElementById(dotId).style.top=yMap[parts[0]||'center']||'50%';
  document.getElementById(valId).textContent='Focus: '+pos;
  if(isUpload){_galUploadPos=pos;}else{_galEditPos=pos;}
}
function galApplyUploadPos(pos){galApplyPreset(pos,'gal-preview-img','gal-focus-dot','gal-pos-val',true);}
function galEditApplyPos(pos){galApplyPreset(pos,'gal-edit-img','gal-edit-dot','gal-edit-pos-val',false);}

// ── Load & render gallery ─────────────────────────────────────────
async function loadGallery(){
  try{
    var r=await fetch('/api/gallery/list');
    _galPhotos=await r.json();
    renderGallery();
  }catch(e){console.error('Gallery load error',e);}
}
function renderGallery(){
  var grid=document.getElementById('gal-grid');
  var empty=document.getElementById('gal-empty');
  if(!_galPhotos.length){grid.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  grid.innerHTML=_galPhotos.map(function(p){
    var imgUrl=p.url||('/gallery/'+p.filename);
    var pos=p.objectPosition||'center center';
    return '<div draggable="true" ondragstart="galDragStart(event,\''+p.filename+'\')" ondragover="galDragOver(event)" ondrop="galDrop(event,\''+p.filename+'\')" data-fn="'+p.filename+'" style="position:relative;aspect-ratio:1;overflow:hidden;border-radius:8px;border:1.5px solid #e8c4bc;cursor:pointer;background:#f5e8e0;transition:box-shadow 0.2s;" onclick="galOpenEdit(\''+p.filename+'\')">'+
      (p.featured?'<div style="position:absolute;top:5px;left:5px;z-index:2;background:rgba(201,169,110,0.95);border-radius:4px;padding:2px 7px;font-size:0.66rem;color:#fff;font-weight:700;pointer-events:none;">⭐</div>':'')+
      '<img src="'+imgUrl+'" style="width:100%;height:100%;object-fit:cover;object-position:'+pos+';display:block;pointer-events:none;" alt="'+p.title+'">'+
      '<div style="position:absolute;inset:0;background:rgba(44,24,16,0);transition:background 0.2s;pointer-events:none;" class="gal-hover-ov"></div>'+
      '<div style="position:absolute;bottom:0;left:0;right:0;padding:7px 8px;color:#fff;font-size:0.7rem;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.7);pointer-events:none;background:linear-gradient(transparent,rgba(0,0,0,0.55));">'+p.title+'</div>'+
      '</div>';
  }).join('');
}

// ── Drag to reorder ───────────────────────────────────────────────
var _galDragSrc='';
function galDragStart(e,fn){_galDragSrc=fn;e.dataTransfer.effectAllowed='move';}
function galDragOver(e){e.preventDefault();e.dataTransfer.dropEffect='move';}
async function galDrop(e,targetFn){
  e.preventDefault();
  if(_galDragSrc===targetFn)return;
  var si=_galPhotos.findIndex(function(p){return p.filename===_galDragSrc;});
  var ti=_galPhotos.findIndex(function(p){return p.filename===targetFn;});
  var moved=_galPhotos.splice(si,1)[0];
  _galPhotos.splice(ti,0,moved);
  renderGallery();
  await fetch('/api/admin/gallery/reorder?token='+encodeURIComponent(TOKEN),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({order:_galPhotos.map(function(p){return p.filename;})})});
}

// ── Upload ────────────────────────────────────────────────────────
function galPreviewFile(e){
  var file=e.target.files[0];if(!file)return;
  var img=document.getElementById('gal-preview-img');
  img.src=URL.createObjectURL(file);
  img.style.objectPosition='center center';
  _galUploadPos='center center';
  document.getElementById('gal-pos-val').textContent='Focus: center center';
  document.getElementById('gal-focus-dot').style.left='50%';
  document.getElementById('gal-focus-dot').style.top='50%';
  document.getElementById('gal-preview-wrap').style.display='block';
}
async function galUpload(){
  if(!CLOUD_NAME||!UPLOAD_PRESET){alert('Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET env vars.');return;}
  var fileInput=document.getElementById('gal-file');
  var file=fileInput.files[0];if(!file){alert('Please select a photo first.');return;}
  var title=document.getElementById('gal-title').value.trim();
  var category=document.getElementById('gal-category').value;
  var desc=document.getElementById('gal-desc').value.trim();
  var btn=document.getElementById('gal-upload-btn');
  var status=document.getElementById('gal-upload-status');
  btn.disabled=true;btn.textContent='Uploading…';status.textContent='';
  try{
    var fd=new FormData();
    fd.append('file',file);
    fd.append('upload_preset',UPLOAD_PRESET);
    fd.append('folder','glam-by-ankita');
    status.textContent='Uploading to cloud…';
    var cr=await fetch('https://api.cloudinary.com/v1_1/'+CLOUD_NAME+'/image/upload',{method:'POST',body:fd});
    if(!cr.ok){var ce=await cr.json().catch(()=>({}));throw new Error(ce.error?.message||'Cloudinary upload failed');}
    var cd=await cr.json();
    status.textContent='Saving…';
    var sr=await fetch('/api/admin/gallery?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:cd.secure_url,public_id:cd.public_id,title:title,category:category,description:desc,object_position:_galUploadPos})});
    if(!sr.ok)throw new Error('Failed to save metadata');
    status.innerHTML='<span style="color:#2e7d32;">✅ Photo uploaded successfully!</span>';
    fileInput.value='';
    document.getElementById('gal-preview-wrap').style.display='none';
    document.getElementById('gal-title').value='';
    document.getElementById('gal-desc').value='';
    _galUploadPos='center center';
    await loadGallery();
  }catch(e){status.innerHTML='<span style="color:#c0392b;">❌ '+e.message+'</span>';}
  btn.disabled=false;btn.textContent='Upload Photo ✦';
}

// ── Edit modal ────────────────────────────────────────────────────
function galOpenEdit(filename){
  var p=_galPhotos.find(function(x){return x.filename===filename;});if(!p)return;
  _galEditFilename=filename;
  _galEditPos=p.objectPosition||'center center';
  var img=document.getElementById('gal-edit-img');
  img.src=p.url||('/gallery/'+p.filename);
  img.style.objectPosition=_galEditPos;
  var parts=_galEditPos.replace(/%/g,'').trim().split(/\s+/);
  var xp=parseFloat(parts[0]),yp=parseFloat(parts[1]);
  if(!isNaN(xp)&&!isNaN(yp)){
    document.getElementById('gal-edit-dot').style.left=xp+'%';
    document.getElementById('gal-edit-dot').style.top=yp+'%';
  }else{
    var xMap={left:'0%',center:'50%',right:'100%'};
    var yMap={top:'0%',center:'50%',bottom:'100%'};
    document.getElementById('gal-edit-dot').style.left=xMap[parts[1]||'center']||'50%';
    document.getElementById('gal-edit-dot').style.top=yMap[parts[0]||'center']||'50%';
  }
  document.getElementById('gal-edit-pos-val').textContent='Focus: '+_galEditPos;
  document.getElementById('gal-edit-title').value=p.title||'';
  document.getElementById('gal-edit-cat').value=p.category||'glam';
  document.getElementById('gal-edit-desc').value=p.desc||'';
  document.getElementById('gal-edit-err').style.display='none';
  document.getElementById('gal-feat-btn').textContent=p.featured?'☆ Unfeature':'⭐ Feature';
  document.getElementById('gal-modal').style.display='flex';
}
function galCloseModal(){document.getElementById('gal-modal').style.display='none';}
document.getElementById('gal-modal').addEventListener('click',function(e){if(e.target===this)galCloseModal();});

async function galEditSave(){
  var btn=document.getElementById('gal-save-btn');
  var err=document.getElementById('gal-edit-err');
  btn.disabled=true;btn.textContent='Saving…';err.style.display='none';
  try{
    var r=await fetch('/api/admin/gallery/'+encodeURIComponent(_galEditFilename)+'/meta?token='+encodeURIComponent(TOKEN),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:document.getElementById('gal-edit-title').value,category:document.getElementById('gal-edit-cat').value,description:document.getElementById('gal-edit-desc').value,object_position:_galEditPos})});
    if(!r.ok)throw new Error('Save failed');
    galCloseModal();await loadGallery();
  }catch(e){err.textContent='Failed to save. Please try again.';err.style.display='block';}
  btn.disabled=false;btn.textContent='Save ✦';
}
async function galToggleFeatured(){
  var r=await fetch('/api/admin/gallery/'+encodeURIComponent(_galEditFilename)+'/featured?token='+encodeURIComponent(TOKEN),{method:'PUT'});
  if(r.ok){galCloseModal();await loadGallery();}
  else alert('Failed to update featured status.');
}
async function galDelete(){
  if(!confirm('Delete this photo permanently?'))return;
  var r=await fetch('/api/admin/gallery/'+encodeURIComponent(_galEditFilename)+'?token='+encodeURIComponent(TOKEN),{method:'DELETE'});
  if(r.ok){galCloseModal();await loadGallery();}
  else alert('Delete failed. Please try again.');
}

// ── Email & admin ─────────────────────────────────────────────────
async function sendEmail(){var btn=event.target,success=document.getElementById('email-success'),error=document.getElementById('email-error');success.style.display='none';error.style.display='none';var to=document.getElementById('e-to').value.trim(),subject=document.getElementById('e-subject').value.trim(),body=document.getElementById('e-body').value.trim();if(!to||!subject||!body){error.textContent='Please fill in all fields.';error.style.display='block';return;}btn.disabled=true;btn.textContent='Sending…';try{var res=await fetch('/api/admin-send-email?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to,subject,body})});var json=await res.json();if(!res.ok)throw new Error(json.error||'Failed');success.textContent='Email sent to '+to+'!';success.style.display='block';document.getElementById('e-to').value='';document.getElementById('e-subject').value='';document.getElementById('e-body').value='';}catch(e){error.textContent='Could not send email. Please try again.';error.style.display='block';}finally{btn.disabled=false;btn.textContent='Send Email ✦';}}
async function regenToken(){var btn=document.getElementById('regen-btn'),status=document.getElementById('regen-status');btn.disabled=true;status.textContent='Regenerating…';try{var res=await fetch('/api/admin?token='+encodeURIComponent(TOKEN),{method:'POST'});var json=await res.json();if(!res.ok)throw new Error(json.error||'Failed');status.textContent='✅ New link sent to your email!';btn.style.display='none';}catch(e){status.textContent='❌ Failed. Try again.';btn.disabled=false;}}

// ── Coupon management ─────────────────────────────────────────────
var _cpCoupons=[];
async function loadCoupons(){
  try{
    var r=await fetch('/api/admin/coupons?token='+encodeURIComponent(TOKEN));
    _cpCoupons=await r.json();
    renderCoupons();
  }catch(e){document.getElementById('cp-list').innerHTML='<p style="color:#c0392b;font-size:0.85rem;">Failed to load coupons.</p>';}
}
function renderCoupons(){
  var el=document.getElementById('cp-list');
  if(!_cpCoupons.length){el.innerHTML='<p style="color:#9e7c4a;font-size:0.85rem;">No promo codes yet.</p>';return;}
  el.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:0.88rem;"><thead><tr><th style="padding:8px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;background:#fdf5f0;border-bottom:1px solid #e8c4bc;">Code</th><th style="padding:8px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;background:#fdf5f0;border-bottom:1px solid #e8c4bc;">Discount</th><th style="padding:8px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;background:#fdf5f0;border-bottom:1px solid #e8c4bc;">Description</th><th style="padding:8px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;background:#fdf5f0;border-bottom:1px solid #e8c4bc;">Status</th><th style="padding:8px 12px;background:#fdf5f0;border-bottom:1px solid #e8c4bc;"></th></tr></thead><tbody>'+
    _cpCoupons.map(function(c){
      var disc=c.discount_type==='fixed'?'A$'+Number(c.discount_value).toFixed(2)+' off':Number(c.discount_value)+'% off';
      var badge=c.valid?'<span style="background:#e8f4e8;color:#2c6e3f;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Active</span>':'<span style="background:#f5e8e8;color:#c0392b;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Inactive</span>';
      return '<tr style="border-bottom:1px solid #f0ddd6;"><td style="padding:10px 12px;font-weight:700;font-family:monospace;font-size:0.9rem;">'+c.code+'</td><td style="padding:10px 12px;">'+disc+'</td><td style="padding:10px 12px;color:#6b3d2e;font-size:0.85rem;">'+( c.description||'—')+'</td><td style="padding:10px 12px;">'+badge+'</td><td style="padding:10px 12px;"><button onclick="cpOpenEdit('+c.id+')" style="padding:5px 12px;border:1.5px solid #c9a96e;border-radius:6px;background:#fff;color:#9e7c4a;font-weight:700;font-size:0.8rem;cursor:pointer;font-family:inherit;">Edit</button></td></tr>';
    }).join('')+'</tbody></table>';
}
async function cpAdd(){
  var code=document.getElementById('cp-code').value.trim().toUpperCase();
  var type=document.getElementById('cp-type').value;
  var value=document.getElementById('cp-value').value;
  var desc=document.getElementById('cp-desc').value.trim();
  var status=document.getElementById('cp-add-status');
  var btn=document.getElementById('cp-add-btn');
  if(!code||!value){status.innerHTML='<span style="color:#c0392b;">Code and value are required.</span>';return;}
  btn.disabled=true;btn.textContent='Adding…';status.textContent='';
  try{
    var r=await fetch('/api/admin/coupons?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,discount_type:type,discount_value:parseFloat(value),description:desc})});
    var j=await r.json();
    if(!r.ok)throw new Error(j.error||'Failed');
    status.innerHTML='<span style="color:#2c6e3f;">✅ Code added!</span>';
    document.getElementById('cp-code').value='';document.getElementById('cp-value').value='';document.getElementById('cp-desc').value='';
    await loadCoupons();
  }catch(e){status.innerHTML='<span style="color:#c0392b;">❌ '+e.message+'</span>';}
  btn.disabled=false;btn.textContent='Add Code ✦';
}
function cpOpenEdit(id){
  var c=_cpCoupons.find(function(x){return x.id===id;});if(!c)return;
  document.getElementById('cp-edit-id').value=c.id;
  document.getElementById('cp-edit-code').value=c.code;
  document.getElementById('cp-edit-type').value=c.discount_type;
  document.getElementById('cp-edit-value').value=Number(c.discount_value);
  document.getElementById('cp-edit-desc').value=c.description||'';
  document.getElementById('cp-edit-valid').checked=c.valid;
  document.getElementById('cp-edit-err').style.display='none';
  document.getElementById('cp-modal').style.display='flex';
}
function cpCloseModal(){document.getElementById('cp-modal').style.display='none';}
document.getElementById('cp-modal').addEventListener('click',function(e){if(e.target===this)cpCloseModal();});
async function cpEditSave(){
  var id=document.getElementById('cp-edit-id').value;
  var code=document.getElementById('cp-edit-code').value.trim().toUpperCase();
  var type=document.getElementById('cp-edit-type').value;
  var value=document.getElementById('cp-edit-value').value;
  var desc=document.getElementById('cp-edit-desc').value.trim();
  var valid=document.getElementById('cp-edit-valid').checked;
  var err=document.getElementById('cp-edit-err');
  if(!code||!value){err.textContent='Code and value are required.';err.style.display='block';return;}
  try{
    var r=await fetch('/api/admin/coupons/'+id+'?token='+encodeURIComponent(TOKEN),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,discount_type:type,discount_value:parseFloat(value),description:desc,valid})});
    var j=await r.json();
    if(!r.ok)throw new Error(j.error||'Failed');
    cpCloseModal();await loadCoupons();
  }catch(e){err.textContent=e.message;err.style.display='block';}
}
async function cpEditDelete(){
  var id=document.getElementById('cp-edit-id').value;
  var code=document.getElementById('cp-edit-code').value;
  if(!confirm('Delete promo code '+code+'?'))return;
  try{
    var r=await fetch('/api/admin/coupons/'+id+'?token='+encodeURIComponent(TOKEN),{method:'DELETE'});
    if(r.ok){cpCloseModal();await loadCoupons();}
    else alert('Delete failed.');
  }catch(e){alert('Delete failed.');}
}

loadGallery();
loadCoupons();
</script></body></html>`);
});

// ── Gallery ───────────────────────────────────────────────────────
const STATIC_GALLERY_SEED = [
  { filename:'glam-city.png', url:'/gallery/glam-city.png', title:'Full Glam with a Statement Red Lip', category:'glam', description:'Bold red lip, warm neutral eyes & bronzed skin — polished, glamorous, and sophisticated', object_position:'center 30%', featured:true, sort_order:0 },
  { filename:'smokey-salon.jpeg', url:'/gallery/smokey-salon.jpeg', title:'Soft Glam with Smokey Eyes', category:'glam', description:'Rich brown smokey eye, rosy mauve blush, nude pink lips — elegant, refined, and effortlessly glamorous', object_position:'center top', featured:false, sort_order:1 },
  { filename:'soft-smokey.jpeg', url:'/gallery/soft-smokey.jpeg', title:'Soft Smokey Glam', category:'glam', description:'Soft taupe and warm brown tones, diffused smoky corners, rosy nude lips — polished and timeless', object_position:'center top', featured:false, sort_order:2 },
  { filename:'purple-glam.jpeg', url:'/gallery/purple-glam.jpeg', title:'Soft Glam with a Pop of Blue Liner', category:'glam', description:'Soft pink/mauve shadow & a sharp blue-violet winged liner — clean, feminine, wearable', object_position:'center 30%', featured:false, sort_order:3 },
];

async function ensureGalleryTable() {
  const db = getPool();
  await db.query(`CREATE TABLE IF NOT EXISTS gallery_images (
    id SERIAL PRIMARY KEY, filename TEXT NOT NULL UNIQUE, url TEXT NOT NULL,
    public_id TEXT, title TEXT DEFAULT '', category TEXT DEFAULT 'glam',
    description TEXT DEFAULT '', object_position TEXT DEFAULT 'center center',
    featured BOOLEAN DEFAULT false, sort_order INTEGER DEFAULT 0,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

async function ensureCouponsTable() {
  const db = getPool();
  await db.query(`CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE,
    discount_type TEXT NOT NULL DEFAULT 'percent',
    discount_value NUMERIC(10,2) NOT NULL,
    valid BOOLEAN DEFAULT true,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.query(
    `INSERT INTO coupons (code,discount_type,discount_value,description,valid)
     VALUES ('CONDITNCREW','percent',30,'30% off for crew',true)
     ON CONFLICT (code) DO NOTHING`
  );
}

let _gallerySynced = false;
async function getGalleryItems() {
  await ensureGalleryTable();
  const db = getPool();
  if (!_gallerySynced) {
    _gallerySynced = true;
    for (const item of STATIC_GALLERY_SEED) {
      await db.query(
        `INSERT INTO gallery_images (filename,url,title,category,description,object_position,featured,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (filename) DO NOTHING`,
        [item.filename,item.url,item.title,item.category,item.description,item.object_position,item.featured,item.sort_order]
      );
    }
  }
  const { rows } = await db.query('SELECT * FROM gallery_images ORDER BY sort_order ASC, uploaded_at DESC');
  return rows;
}

app.get('/gallery/list', async (req, res) => {
  try {
    const rows = await getGalleryItems();
    const items = rows.map(r => ({ filename:r.filename, url:r.url, title:r.title||'', category:r.category||'glam', desc:r.description||'', objectPosition:r.object_position||'center center', featured:r.featured||false }));
    items.sort((a,b) => (b.featured?1:0)-(a.featured?1:0));
    res.json(items);
  } catch(e) { console.error('gallery/list error:',e); res.json([]); }
});

// ── GET /validate-coupon ──────────────────────────────────────────
app.get('/validate-coupon', async (req, res) => {
  const code = (req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    await ensureCouponsTable();
    const { rows } = await getPool().query(
      'SELECT * FROM coupons WHERE UPPER(code)=$1 AND valid=true LIMIT 1', [code]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invalid or expired promo code.' });
    const c = rows[0];
    res.json({ code: c.code, discountType: c.discount_type, discountValue: Number(c.discount_value), description: c.description || '' });
  } catch(e) {
    console.error('validate-coupon error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/admin/gallery', async (req, res) => {
  const valid = await validateAdminToken(req.query.token);
  if (!valid) return res.status(403).json({ error:'Unauthorized' });
  const { url, public_id, title, category, description, object_position } = req.body;
  if (!url) return res.status(400).json({ error:'URL required' });
  const filename = public_id ? public_id.replace(/\//g,'-') : `gal-${Date.now()}`;
  try {
    await ensureGalleryTable();
    const db = getPool();
    const { rows:mx } = await db.query('SELECT MAX(sort_order) as m FROM gallery_images');
    const sortOrder = (Number(mx[0]?.m)||0)+1;
    await db.query(`INSERT INTO gallery_images (filename,url,public_id,title,category,description,object_position,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (filename) DO UPDATE SET url=$2,title=$4,category=$5,description=$6,object_position=$7`,
      [filename,url,public_id||null,title||'',category||'glam',description||'',object_position||'center center',sortOrder]);
    res.json({ ok:true, filename });
  } catch(e) { console.error('gallery save error:',e); res.status(500).json({ error:'Failed to save' }); }
});

app.put('/admin/gallery/reorder', async (req, res) => {
  const valid = await validateAdminToken(req.query.token);
  if (!valid) return res.status(403).json({ error:'Unauthorized' });
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error:'order array required' });
  try {
    await ensureGalleryTable();
    const db = getPool();
    for (let i=0; i<order.length; i++) await db.query('UPDATE gallery_images SET sort_order=$1 WHERE filename=$2',[i,order[i]]);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:'Failed to reorder' }); }
});

app.put('/admin/gallery/:filename/meta', async (req, res) => {
  const valid = await validateAdminToken(req.query.token);
  if (!valid) return res.status(403).json({ error:'Unauthorized' });
  const { title, category, description, object_position } = req.body;
  try {
    await ensureGalleryTable();
    await getPool().query('UPDATE gallery_images SET title=$1,category=$2,description=$3,object_position=$4 WHERE filename=$5',
      [title||'',category||'glam',description||'',object_position||'center center',req.params.filename]);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:'Failed to update' }); }
});

app.put('/admin/gallery/:filename/featured', async (req, res) => {
  const valid = await validateAdminToken(req.query.token);
  if (!valid) return res.status(403).json({ error:'Unauthorized' });
  try {
    await ensureGalleryTable();
    const db = getPool();
    const { rows } = await db.query('SELECT featured FROM gallery_images WHERE filename=$1',[req.params.filename]);
    if (!rows.length) return res.status(404).json({ error:'Not found' });
    const newFeatured = !rows[0].featured;
    await db.query('UPDATE gallery_images SET featured=$1 WHERE filename=$2',[newFeatured,req.params.filename]);
    res.json({ ok:true, featured:newFeatured });
  } catch(e) { res.status(500).json({ error:'Failed to update' }); }
});

app.delete('/admin/gallery/:filename', async (req, res) => {
  const valid = await validateAdminToken(req.query.token);
  if (!valid) return res.status(403).json({ error:'Unauthorized' });
  try {
    await ensureGalleryTable();
    await getPool().query('DELETE FROM gallery_images WHERE filename=$1',[req.params.filename]);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:'Failed to delete' }); }
});

// ── Admin Coupon CRUD ─────────────────────────────────────────────
app.get('/admin/coupons', async (req, res) => {
  const valid = await validateAdminToken(req.query.token);
  if (!valid) return res.status(403).json({ error: 'Unauthorized' });
  try {
    await ensureCouponsTable();
    const { rows } = await getPool().query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Failed to load coupons' }); }
});

app.post('/admin/coupons', async (req, res) => {
  const valid = await validateAdminToken(req.query.token);
  if (!valid) return res.status(403).json({ error: 'Unauthorized' });
  const { code, discount_type, discount_value, description } = req.body;
  if (!code || discount_value == null) return res.status(400).json({ error: 'code and discount_value required' });
  try {
    await ensureCouponsTable();
    const { rows } = await getPool().query(
      `INSERT INTO coupons (code,discount_type,discount_value,description,valid) VALUES (UPPER($1),$2,$3,$4,true) RETURNING *`,
      [code.trim(), discount_type||'percent', parseFloat(discount_value), description||'']
    );
    res.json(rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: 'That code already exists.' });
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

app.put('/admin/coupons/:id', async (req, res) => {
  const valid = await validateAdminToken(req.query.token);
  if (!valid) return res.status(403).json({ error: 'Unauthorized' });
  const { code, discount_type, discount_value, description, valid: isValid } = req.body;
  if (!code || discount_value == null) return res.status(400).json({ error: 'code and discount_value required' });
  try {
    await ensureCouponsTable();
    await getPool().query(
      `UPDATE coupons SET code=UPPER($1),discount_type=$2,discount_value=$3,description=$4,valid=$5 WHERE id=$6`,
      [code.trim(), discount_type||'percent', parseFloat(discount_value), description||'', isValid!==false, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: 'That code already exists.' });
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

app.delete('/admin/coupons/:id', async (req, res) => {
  const valid = await validateAdminToken(req.query.token);
  if (!valid) return res.status(403).json({ error: 'Unauthorized' });
  try {
    await ensureCouponsTable();
    await getPool().query('DELETE FROM coupons WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Failed to delete coupon' }); }
});

// ── Export for Vercel serverless ──────────────────────────────────
module.exports = app;
