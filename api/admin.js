const { getPool } = require('./db');
const nodemailer = require('nodemailer');
const { randomUUID } = require('crypto');

const ADMIN_EMAIL = 'nishankn.ankita@gmail.com';
const SITE_URL = 'https://www.theglambyankita.com';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

async function ensureTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_tokens (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      client_name TEXT,
      client_email TEXT,
      service TEXT,
      booking_date TEXT,
      booking_time TEXT,
      location TEXT,
      num_people TEXT,
      total_aud NUMERIC(10,2),
      payment_method TEXT,
      status TEXT DEFAULT 'confirmed',
      stripe_payment_intent_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function saveToken(db, token) {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 3);
  await db.query('DELETE FROM admin_tokens');
  await db.query(
    'INSERT INTO admin_tokens (token, expires_at) VALUES ($1, $2)',
    [token, expiresAt]
  );
  return expiresAt;
}

async function sendTokenEmail(token) {
  const adminUrl = `${SITE_URL}/api/admin?token=${token}`;
  const transporter = createTransporter();
  if (!transporter) return { sent: false, adminUrl };
  await transporter.sendMail({
    from: `"The Glam by Ankita" <${process.env.GMAIL_USER}>`,
    to: ADMIN_EMAIL,
    subject: '✦ Your new admin dashboard link — The Glam by Ankita',
    html: `
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
        <h2 style="margin:0;color:#fff;font-size:1.2rem;">✦ Admin Dashboard Access</h2>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">The Glam by Ankita</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="font-size:0.95rem;color:#2c1810;margin:0 0 16px;">Hi Ankita! Here's your new admin dashboard link. Keep it private.</p>
        <p style="font-size:0.85rem;color:#6b3d2e;margin:0 0 20px;">This link expires in <strong>3 months</strong>.</p>
        <a href="${adminUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;font-family:Georgia,serif;font-weight:700;font-size:0.95rem;padding:14px 28px;border-radius:6px;">✦ Open Admin Dashboard</a>
        <p style="margin:20px 0 0;font-size:0.78rem;color:#aaa;word-break:break-all;">${adminUrl}</p>
      </div>
    </div>`,
  });
  return { sent: true, adminUrl };
}

async function generateNewToken(db) {
  const token = randomUUID();
  await saveToken(db, token);
  sendTokenEmail(token).catch((e) => console.error('Admin token email error:', e));
  return token;
}

async function validateToken(db, token) {
  if (!token) return false;
  const { rows } = await db.query(
    'SELECT * FROM admin_tokens WHERE token = $1 AND expires_at > NOW() LIMIT 1',
    [token]
  );
  return rows.length > 0;
}

module.exports = async function handler(req, res) {
  const db = getPool();

  try {
    await ensureTables(db);
  } catch (e) {
    console.error('ensureTables error:', e);
  }

  // ── POST: regenerate token (works even with expired token, or no token) ─
  if (req.method === 'POST') {
    const token = req.query.token;
    const action = req.query.action;

    // Allow force-request with no/expired token via action=request
    if (action === 'request') {
      const newToken = randomUUID();
      let dbSaved = false;
      try {
        await saveToken(db, newToken);
        dbSaved = true;
      } catch (e) {
        console.error('Save token error:', e);
      }
      const adminUrl = `${SITE_URL}/api/admin?token=${newToken}`;
      let emailSent = false;
      if (dbSaved) {
        try {
          const result = await sendTokenEmail(newToken);
          emailSent = result.sent;
        } catch (e) {
          console.error('Send token email error:', e);
        }
      }
      if (!dbSaved) {
        return res.status(500).json({ error: 'Database unavailable. Please check server configuration.' });
      }
      return res.json({ ok: true, emailSent, adminUrl });
    }

    const valid = await validateToken(db, token).catch(() => false);
    if (!valid) return res.status(403).json({ error: 'Unauthorized' });

    try {
      const newToken = randomUUID();
      await saveToken(db, newToken);
      sendTokenEmail(newToken).catch((e) => console.error('Regen email error:', e));
      return res.json({ ok: true });
    } catch (e) {
      console.error('Regen error:', e);
      return res.status(500).json({ error: 'Failed to regenerate token.' });
    }
  }

  // ── GET: admin dashboard ────────────────────────────────────────
  const token = req.query.token;
  const valid = await validateToken(db, token).catch(() => false);

  if (!valid) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin — The Glam by Ankita</title>
      <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:sans-serif;background:#fdf8f4;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
      .box{text-align:center;padding:40px 32px;background:#fff;border:1px solid #e8c4bc;border-radius:10px;max-width:480px;width:100%;}
      h2{color:#6b3d2e;font-family:Georgia,serif;margin-bottom:12px;}
      p{color:#4a2e22;font-size:0.9rem;line-height:1.6;margin-bottom:20px;}
      .btn{display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;font-family:Georgia,serif;cursor:pointer;}
      .btn:disabled{opacity:0.5;cursor:not-allowed;}
      .note{font-size:0.82rem;color:#9e7c4a;margin-top:14px;}
      .link-box{margin-top:20px;padding:14px 16px;background:#fdf0ee;border:1px solid #e8c4bc;border-radius:8px;text-align:left;display:none;}
      .link-box p{margin:0 0 8px;font-size:0.82rem;font-weight:700;color:#6b3d2e;}
      .link-box a{display:block;word-break:break-all;font-size:0.8rem;color:#c9a96e;text-decoration:none;border:1px solid #e8c4bc;padding:8px 10px;border-radius:5px;background:#fff;margin-bottom:10px;}
      .link-box a:hover{text-decoration:underline;}
      .open-btn{display:inline-block;padding:10px 22px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;border-radius:6px;font-size:0.88rem;font-weight:700;font-family:Georgia,serif;}
      .err{font-size:0.82rem;color:#c0392b;margin-top:12px;display:none;}
      </style>
      </head><body><div class="box">
      <h2>✦ Admin Access</h2>
      <p>This link has expired or is invalid.<br>Click below to generate a fresh admin link.</p>
      <button class="btn" id="btn" onclick="sendLink()">Generate new link</button>
      <p class="note" id="note"></p>
      <div class="link-box" id="link-box">
        <p>Your admin link (save this somewhere safe):</p>
        <a id="link-url" href="#" target="_blank"></a>
        <a class="open-btn" id="link-open" href="#" target="_blank">✦ Open Admin Dashboard</a>
      </div>
      <p class="err" id="err-msg"></p>
      <script>
      async function sendLink() {
        const btn = document.getElementById('btn');
        const note = document.getElementById('note');
        const errMsg = document.getElementById('err-msg');
        const linkBox = document.getElementById('link-box');
        btn.disabled = true; btn.textContent = 'Generating…';
        note.textContent = ''; errMsg.style.display = 'none'; linkBox.style.display = 'none';
        try {
          const res = await fetch('/api/admin?action=request', { method: 'POST' });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || 'Failed');
          if (j.emailSent) {
            btn.textContent = '✅ Link sent!';
            note.textContent = 'Check your inbox at ${ADMIN_EMAIL}';
          } else {
            btn.textContent = '✅ Link generated!';
            note.textContent = 'Email could not be sent — your link is shown below:';
          }
          if (j.adminUrl) {
            document.getElementById('link-url').textContent = j.adminUrl;
            document.getElementById('link-url').href = j.adminUrl;
            document.getElementById('link-open').href = j.adminUrl;
            linkBox.style.display = 'block';
          }
        } catch(e) {
          btn.disabled = false; btn.textContent = 'Generate new link';
          errMsg.textContent = '❌ ' + (e.message || 'Failed. Please try again.');
          errMsg.style.display = 'block';
        }
      }
      </script>
      </div></body></html>
    `);
  }

  // Fetch bookings
  let allBookings = [];
  try {
    const { rows } = await db.query(
      'SELECT * FROM bookings ORDER BY created_at DESC'
    );
    allBookings = rows;
  } catch (e) {
    console.error('Fetch bookings error:', e);
  }

  const today = new Date().toISOString().split('T')[0];
  const upcoming = allBookings.filter((b) => b.booking_date && b.booking_date >= today);
  const past = allBookings.filter((b) => !b.booking_date || b.booking_date < today);

  function bookingRow(b) {
    const badge = b.payment_method === 'cash'
      ? `<span style="background:#f0e8c8;color:#8a6a00;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Cash</span>`
      : `<span style="background:#e8f4e8;color:#2c6e3f;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Card</span>`;
    return `<tr style="border-bottom:1px solid #f0ddd6;">
      <td style="padding:10px 12px;color:#2c1810;font-weight:600;">${esc(b.client_name || '—')}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;">${esc(b.client_email || '—')}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;">${esc(b.service || '—')}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;white-space:nowrap;">${esc(b.booking_date || '—')}${b.booking_time ? ` ${esc(b.booking_time)}` : ''}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;">${b.total_aud ? `A$${Number(b.total_aud).toFixed(2)}` : '—'}</td>
      <td style="padding:10px 12px;">${badge}</td>
    </tr>`;
  }

  const upcomingRows = upcoming.length > 0
    ? upcoming.map(bookingRow).join('')
    : `<tr><td colspan="6" style="padding:18px;color:#aaa;text-align:center;font-size:0.9rem;">No upcoming bookings yet.</td></tr>`;

  const pastRows = past.length > 0
    ? past.map(bookingRow).join('')
    : `<tr><td colspan="6" style="padding:18px;color:#aaa;text-align:center;font-size:0.9rem;">No past bookings yet.</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Dashboard · The Glam by Ankita</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fdf8f4;color:#2c1810;min-height:100vh;}
  .topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 28px;background:#fff;border-bottom:1px solid #e8c4bc;}
  .logo{display:flex;align-items:center;gap:10px;}
  .logo-text{font-family:Georgia,serif;font-size:1rem;color:#6b3d2e;font-style:italic;}
  .badge{background:#fdf0ee;color:#6b3d2e;font-size:0.75rem;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid #e8c4bc;}
  .header{background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:28px 32px;color:#fff;}
  .header h1{font-family:Georgia,serif;font-size:1.5rem;margin-bottom:4px;}
  .header p{font-size:0.85rem;opacity:0.88;}
  .content{max-width:1000px;margin:0 auto;padding:28px 20px 60px;}
  .section{margin-bottom:32px;}
  .section-title{font-family:Georgia,serif;font-size:1rem;color:#6b3d2e;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #e8c4bc;display:flex;align-items:center;gap:8px;}
  .card{background:#fff;border:1px solid #e8c4bc;border-radius:10px;overflow:hidden;}
  table{width:100%;border-collapse:collapse;font-size:0.88rem;}
  th{padding:10px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.05em;background:#fdf5f0;border-bottom:1px solid #e8c4bc;}
  .email-form{padding:24px;}
  .field{margin-bottom:16px;}
  label{display:block;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;}
  input,textarea{width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;outline:none;transition:border-color .2s;}
  input:focus,textarea:focus{border-color:#c9a96e;}
  textarea{resize:vertical;min-height:140px;}
  .btn{display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;font-family:Georgia,serif;cursor:pointer;letter-spacing:0.03em;transition:opacity .2s;}
  .btn:hover{opacity:0.88;}
  .btn:disabled{opacity:0.5;cursor:not-allowed;}
  .btn-outline{background:none;border:1.5px solid #c9a96e;color:#9e7c4a;padding:8px 18px;border-radius:6px;font-size:0.85rem;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit;}
  .btn-outline:hover{background:#fdf0ee;}
  .alert{padding:12px 16px;border-radius:6px;font-size:0.88rem;margin-bottom:16px;display:none;}
  .alert-success{background:#f0fff4;border:1px solid #a8e6b8;color:#2c6e3f;}
  .alert-error{background:#fff0f0;border:1px solid #f5c0c0;color:#c0392b;}
  .regen-note{font-size:0.8rem;color:#9e7c4a;margin-left:8px;}
  @media(max-width:700px){table{font-size:0.78rem;}th,td{padding:8px 8px !important;}.content{padding:16px 12px 40px;}}
</style>
</head>
<body>
<div class="topbar">
  <div class="logo">
    <img src="${SITE_URL}/logo-original.png" width="32" height="32" style="border-radius:50%;object-fit:cover;" alt="">
    <span class="logo-text">The Glam by Ankita</span>
  </div>
  <span class="badge">Admin Dashboard</span>
</div>

<div class="header">
  <h1>✦ Admin Dashboard</h1>
  <p>View all bookings and send emails to clients.</p>
</div>

<div class="content">

  <div class="section">
    <div class="section-title">📅 Upcoming Confirmed Bookings <span style="font-family:sans-serif;font-size:0.8rem;font-weight:400;color:#9e7c4a;">(${upcoming.length})</span></div>
    <div class="card">
      <table>
        <thead><tr><th>Client</th><th>Email</th><th>Service</th><th>Date & Time</th><th>Amount</th><th>Payment</th></tr></thead>
        <tbody>${upcomingRows}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">🗂 Past Bookings <span style="font-family:sans-serif;font-size:0.8rem;font-weight:400;color:#9e7c4a;">(${past.length})</span></div>
    <div class="card">
      <table>
        <thead><tr><th>Client</th><th>Email</th><th>Service</th><th>Date & Time</th><th>Amount</th><th>Payment</th></tr></thead>
        <tbody>${pastRows}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">✉️ Send Email to Client</div>
    <div class="card">
      <div class="email-form">
        <div class="alert alert-success" id="email-success"></div>
        <div class="alert alert-error" id="email-error"></div>
        <div class="field">
          <label>Client Email Address</label>
          <input type="email" id="e-to" placeholder="client@example.com">
        </div>
        <div class="field">
          <label>Subject</label>
          <input type="text" id="e-subject" placeholder="e.g. Your upcoming appointment — The Glam by Ankita">
        </div>
        <div class="field">
          <label>Message</label>
          <textarea id="e-body" placeholder="Hi [Name],&#10;&#10;Write your message here…"></textarea>
        </div>
        <button class="btn" id="send-email-btn" onclick="sendEmail()">Send Email ✦</button>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">🔑 Admin Access Link</div>
    <div class="card" style="padding:20px 24px;">
      <p style="font-size:0.9rem;color:#4a2e22;margin-bottom:16px;">Regenerate your admin link. The new link will be emailed to you, and this one will stop working immediately.</p>
      <button class="btn-outline" id="regen-btn" onclick="regenToken()">Regenerate Link</button>
      <span class="regen-note" id="regen-status"></span>
    </div>
  </div>

</div>

<script>
const TOKEN = ${JSON.stringify(token)};

async function sendEmail() {
  const btn = document.getElementById('send-email-btn');
  const success = document.getElementById('email-success');
  const error = document.getElementById('email-error');
  success.style.display = 'none';
  error.style.display = 'none';
  const to = document.getElementById('e-to').value.trim();
  const subject = document.getElementById('e-subject').value.trim();
  const body = document.getElementById('e-body').value.trim();
  if (!to || !subject || !body) {
    error.textContent = 'Please fill in all fields.';
    error.style.display = 'block'; return;
  }
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await fetch('/api/admin-send-email?token=' + encodeURIComponent(TOKEN), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed');
    success.textContent = 'Email sent to ' + to + '!';
    success.style.display = 'block';
    document.getElementById('e-to').value = '';
    document.getElementById('e-subject').value = '';
    document.getElementById('e-body').value = '';
  } catch(e) {
    error.textContent = 'Could not send email. Please try again.';
    error.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Send Email ✦';
  }
}

async function regenToken() {
  const btn = document.getElementById('regen-btn');
  const status = document.getElementById('regen-status');
  btn.disabled = true; status.textContent = 'Regenerating…';
  try {
    const res = await fetch('/api/admin?token=' + encodeURIComponent(TOKEN), { method: 'POST' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed');
    status.textContent = '✅ New link sent to your email! This page will no longer work.';
    btn.style.display = 'none';
  } catch(e) {
    status.textContent = '❌ Failed to regenerate. Try again.';
    btn.disabled = false;
  }
}
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
};
