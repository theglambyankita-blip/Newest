const { getPool } = require('./_db');
const nodemailer = require('nodemailer');
const { randomUUID } = require('crypto');

const ADMIN_EMAIL = 'nishankn.ankita@gmail.com';
const SITE_URL = 'https://www.theglambyankita.com';

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      booking_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  try {
    await db.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_id TEXT');
  } catch (e) { /* column already exists */ }
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

  if (req.method === 'POST') {
    const token = req.query.token;
    const action = req.query.action;

    if (action === 'request') {
      const newToken = randomUUID();
      let dbSaved = false;
      let dbError = null;
      try {
        await saveToken(db, newToken);
        dbSaved = true;
      } catch (e) {
        dbError = e.message || String(e);
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

  const token = req.query.token;
  const valid = await validateToken(db, token).catch(() => false);

  if (!valid) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin — The Glam by Ankita</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:sans-serif;background:#fdf8f4;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
.box{text-align:center;padding:40px 32px;background:#fff;border:1px solid #e8c4bc;border-radius:12px;max-width:480px;width:100%;box-shadow:0 4px 20px rgba(0,0,0,0.06);}
h2{color:#6b3d2e;font-family:Georgia,serif;margin-bottom:12px;}
p{color:#4a2e22;font-size:0.9rem;line-height:1.6;margin-bottom:20px;}
.btn{display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;font-family:Georgia,serif;cursor:pointer;}
.btn:disabled{opacity:0.5;cursor:not-allowed;}
.note{font-size:0.82rem;color:#9e7c4a;margin-top:14px;}
.link-box{margin-top:20px;padding:14px 16px;background:#fdf0ee;border:1px solid #e8c4bc;border-radius:8px;text-align:left;display:none;}
.link-box p{margin:0 0 8px;font-size:0.82rem;font-weight:700;color:#6b3d2e;}
.link-box a{display:block;word-break:break-all;font-size:0.8rem;color:#c9a96e;text-decoration:none;border:1px solid #e8c4bc;padding:8px 10px;border-radius:5px;background:#fff;margin-bottom:10px;}
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
  var btn=document.getElementById('btn'),note=document.getElementById('note'),
      errMsg=document.getElementById('err-msg'),linkBox=document.getElementById('link-box');
  btn.disabled=true; btn.textContent='Generating…';
  note.textContent=''; errMsg.style.display='none'; linkBox.style.display='none';
  try {
    var res=await fetch('/api/admin?action=request',{method:'POST'});
    var j=await res.json();
    if(!res.ok) throw new Error(j.error||'Failed');
    btn.textContent=j.emailSent?'✅ Link sent!':'✅ Link generated!';
    note.textContent=j.emailSent?'Check your inbox at ${ADMIN_EMAIL}':'Email could not be sent — your link is shown below:';
    if(j.adminUrl){
      document.getElementById('link-url').textContent=j.adminUrl;
      document.getElementById('link-url').href=j.adminUrl;
      document.getElementById('link-open').href=j.adminUrl;
      linkBox.style.display='block';
    }
  } catch(e){
    btn.disabled=false; btn.textContent='Generate new link';
    errMsg.textContent='❌ '+(e.message||'Failed. Please try again.');
    errMsg.style.display='block';
  }
}
</script>
</div></body></html>`);
  }

  let allBookings = [];
  try {
    const { rows } = await db.query('SELECT * FROM bookings ORDER BY created_at DESC');
    allBookings = rows;
  } catch (e) {
    console.error('Fetch bookings error:', e);
  }

  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const totalRevenue = allBookings.reduce((sum, b) => sum + (parseFloat(b.total_aud) || 0), 0);
  const upcomingCount = allBookings.filter(b => b.booking_date && b.booking_date >= today).length;
  const pastCount = allBookings.length - upcomingCount;
  const thisMonthRevenue = allBookings
    .filter(b => b.booking_date && b.booking_date >= startOfMonth)
    .reduce((sum, b) => sum + (parseFloat(b.total_aud) || 0), 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Dashboard · The Glam by Ankita</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}

@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px) scale(0.95)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
@keyframes toastOut{from{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}to{opacity:0;transform:translateX(-50%) translateY(10px) scale(0.95)}}

body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fdf8f4;color:#2c1810;min-height:100vh;}

.topbar{display:flex;align-items:center;justify-content:space-between;padding:13px 28px;background:#fff;border-bottom:1px solid #e8c4bc;position:sticky;top:0;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,0.04);animation:fadeIn 0.3s ease;}
.logo{display:flex;align-items:center;gap:10px;}
.logo-text{font-family:Georgia,serif;font-size:1rem;color:#6b3d2e;font-style:italic;}
.admin-badge{background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;font-size:0.72rem;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:0.06em;}

.hero{background:linear-gradient(135deg,#c9a96e 0%,#9e7c4a 50%,#7a5c30 100%);padding:30px 28px 44px;color:#fff;position:relative;overflow:hidden;animation:fadeIn 0.5s ease;}
.hero::before{content:'';position:absolute;top:-60px;right:-40px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,0.06);}
.hero::after{content:'';position:absolute;bottom:-80px;left:8%;width:300px;height:300px;border-radius:50%;background:rgba(255,255,255,0.04);}
.hero-inner{max-width:1000px;margin:0 auto;position:relative;z-index:1;}
.hero h1{font-family:Georgia,serif;font-size:1.55rem;margin-bottom:4px;}
.hero p{font-size:0.87rem;opacity:0.88;margin-bottom:28px;}

.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
.stat-card{background:rgba(255,255,255,0.16);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.26);border-radius:10px;padding:16px 16px 14px;text-align:center;animation:fadeInUp 0.5s ease both;transition:transform 0.2s ease,background 0.2s ease;cursor:default;}
.stat-card:hover{background:rgba(255,255,255,0.24);transform:translateY(-3px);}
.stat-icon{font-size:1.3rem;margin-bottom:8px;display:block;}
.stat-value{font-size:1.6rem;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;display:block;}
.stat-label{font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;opacity:0.78;margin-top:4px;display:block;}

.content{max-width:1000px;margin:0 auto;padding:26px 20px 80px;}

.toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;animation:fadeInUp 0.4s ease 0.15s both;}
.search-wrap{flex:1;min-width:180px;position:relative;}
.search-wrap::before{content:'🔍';position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:0.82rem;pointer-events:none;}
.search-wrap input{width:100%;padding:9px 13px 9px 34px;border:1.5px solid #e0c8c0;border-radius:8px;font-size:0.87rem;color:#2c1810;background:#fff;outline:none;transition:border-color 0.2s,box-shadow 0.2s;font-family:inherit;}
.search-wrap input:focus{border-color:#c9a96e;box-shadow:0 0 0 3px rgba(201,169,110,0.14);}
.filter-tabs{display:flex;gap:4px;}
.tab{padding:8px 14px;border:1.5px solid #e0c8c0;border-radius:7px;background:#fff;color:#6b3d2e;font-size:0.81rem;font-weight:600;cursor:pointer;transition:all 0.15s ease;white-space:nowrap;font-family:inherit;}
.tab:hover{border-color:#c9a96e;background:#fdf5f0;}
.tab.active{background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border-color:transparent;}
.export-btn{padding:8px 14px;border:1.5px solid #c9a96e;border-radius:7px;background:#fff;color:#9e7c4a;font-size:0.81rem;font-weight:600;cursor:pointer;transition:all 0.15s ease;white-space:nowrap;font-family:inherit;}
.export-btn:hover{background:#fdf0ee;}

.card{background:#fff;border:1px solid #e8c4bc;border-radius:10px;overflow:hidden;animation:fadeInUp 0.4s ease 0.2s both;box-shadow:0 2px 12px rgba(0,0,0,0.04);}

table{width:100%;border-collapse:collapse;font-size:0.86rem;}
thead th{padding:10px 14px;text-align:left;font-size:0.7rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.07em;background:#fdf5f0;border-bottom:1.5px solid #e8c4bc;white-space:nowrap;}

.booking-row{cursor:pointer;border-bottom:1px solid #f5e8e4;transition:background 0.13s ease;}
.booking-row:hover{background:#fdf5f0;}
.booking-row.expanded{background:#fdf5f0;}
.booking-row td{padding:11px 14px;}
.detail-row td{padding:0;border-bottom:1px solid #f0ddd6;}
.detail-content{max-height:0;overflow:hidden;transition:max-height 0.35s ease,opacity 0.25s ease,padding 0.25s ease;opacity:0;padding:0 18px;background:#fdfaf7;}
.detail-content.open{max-height:380px;opacity:1;padding:16px 18px;}

.detail-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;}
.detail-label{display:block;font-size:0.67rem;font-weight:700;color:#9a7060;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;}
.detail-value{font-size:0.84rem;color:#2c1810;}
.detail-actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid #f0ddd6;}

.bid{display:inline-block;font-family:'SF Mono','Fira Code','Courier New',monospace;font-size:0.73rem;font-weight:700;color:#7a5c30;background:#fdf0d8;border:1px solid #e8c88a;padding:2px 7px;border-radius:5px;letter-spacing:0.04em;white-space:nowrap;}
.badge-card{background:#e8f4e8;color:#2c6e3f;padding:3px 9px;border-radius:20px;font-size:0.74rem;font-weight:700;white-space:nowrap;}
.badge-cash{background:#f0e8c8;color:#7a5c00;padding:3px 9px;border-radius:20px;font-size:0.74rem;font-weight:700;white-space:nowrap;}
.expand-arrow{color:#c9a96e;font-size:0.72rem;transition:transform 0.25s ease;display:inline-block;}
.expanded .expand-arrow{transform:rotate(180deg);}

.copy-btn{display:inline-block;margin-left:6px;padding:1px 7px;background:#fdf0d8;border:1px solid #e8c88a;border-radius:4px;font-size:0.67rem;color:#9e7c4a;cursor:pointer;transition:all 0.13s ease;vertical-align:middle;}
.copy-btn:hover{background:#c9a96e;color:#fff;border-color:#c9a96e;}

.action-btn{padding:7px 14px;border:1.5px solid #c9a96e;border-radius:6px;background:#fff;color:#9e7c4a;font-size:0.79rem;font-weight:600;cursor:pointer;transition:all 0.13s ease;font-family:inherit;}
.action-btn:hover{background:#fdf0ee;}

.section{margin-top:32px;}
.section-title{font-family:Georgia,serif;font-size:0.98rem;color:#6b3d2e;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #e8c4bc;display:flex;align-items:center;gap:8px;animation:fadeInUp 0.4s ease 0.3s both;}

.card-body{padding:22px 24px;}
.field{margin-bottom:15px;}
label{display:block;font-size:0.7rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px;}
input[type=email],input[type=text],textarea{width:100%;padding:9px 12px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.9rem;color:#2c1810;background:#fff;font-family:inherit;outline:none;transition:border-color 0.2s,box-shadow 0.2s;}
input:focus,textarea:focus{border-color:#c9a96e;box-shadow:0 0 0 3px rgba(201,169,110,0.14);}
textarea{resize:vertical;min-height:130px;}
.btn{display:inline-block;padding:12px 26px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border:none;border-radius:8px;font-size:0.93rem;font-weight:700;font-family:Georgia,serif;cursor:pointer;letter-spacing:0.03em;transition:opacity 0.18s,transform 0.13s;box-shadow:0 2px 8px rgba(158,124,74,0.22);}
.btn:hover{opacity:0.9;transform:translateY(-1px);}
.btn:active{transform:translateY(0);}
.btn:disabled{opacity:0.5;cursor:not-allowed;transform:none;}
.btn-outline{background:none;border:1.5px solid #c9a96e;color:#9e7c4a;padding:8px 18px;border-radius:6px;font-size:0.87rem;font-weight:600;cursor:pointer;transition:all 0.18s;font-family:inherit;}
.btn-outline:hover{background:#fdf0ee;}
.alert{padding:11px 15px;border-radius:6px;font-size:0.87rem;margin-bottom:14px;display:none;}
.alert-success{background:#f0fff4;border:1px solid #a8e6b8;color:#2c6e3f;}
.alert-error{background:#fff0f0;border:1px solid #f5c0c0;color:#c0392b;}

.amount{font-weight:700;color:#2c6e3f;}
.client-name{font-weight:600;}

.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#2c1810;color:#fff;padding:10px 20px;border-radius:8px;font-size:0.86rem;font-weight:600;z-index:9999;pointer-events:none;opacity:0;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,0.22);}
.toast.show{opacity:1;animation:toastIn 0.22s ease;}
.toast.hide{animation:toastOut 0.22s ease forwards;}

@media(max-width:700px){
  .stats-grid{grid-template-columns:repeat(2,1fr);}
  .detail-grid{grid-template-columns:repeat(2,1fr);}
  .content{padding:16px 13px 60px;}
  .hero{padding:22px 16px 30px;}
  thead th:nth-child(3),thead th:nth-child(6){display:none;}
  .booking-row td:nth-child(3),.booking-row td:nth-child(6){display:none;}
  .filter-tabs{flex-wrap:wrap;}
}
</style>
</head>
<body>

<div class="topbar">
  <div class="logo">
    <img src="${SITE_URL}/logo-original.png" width="28" height="28" style="border-radius:50%;object-fit:cover;" alt="" onerror="this.style.display='none'">
    <span class="logo-text">The Glam by Ankita</span>
  </div>
  <span class="admin-badge">✦ Admin</span>
</div>

<div class="hero">
  <div class="hero-inner">
    <h1>✦ Admin Dashboard</h1>
    <p>Welcome back, Ankita ✨ Here's an overview of all your bookings.</p>
    <div class="stats-grid">
      <div class="stat-card" style="animation-delay:0.05s">
        <span class="stat-icon">📋</span>
        <span class="stat-value" data-target="${allBookings.length}">0</span>
        <span class="stat-label">Total Bookings</span>
      </div>
      <div class="stat-card" style="animation-delay:0.1s">
        <span class="stat-icon">💰</span>
        <span class="stat-value" data-target="${Math.round(totalRevenue)}" data-prefix="A$">A$0</span>
        <span class="stat-label">Total Revenue</span>
      </div>
      <div class="stat-card" style="animation-delay:0.15s">
        <span class="stat-icon">📅</span>
        <span class="stat-value" data-target="${upcomingCount}">0</span>
        <span class="stat-label">Upcoming</span>
      </div>
      <div class="stat-card" style="animation-delay:0.2s">
        <span class="stat-icon">✨</span>
        <span class="stat-value" data-target="${Math.round(thisMonthRevenue)}" data-prefix="A$">A$0</span>
        <span class="stat-label">This Month</span>
      </div>
    </div>
  </div>
</div>

<div class="content">

  <div class="toolbar">
    <div class="search-wrap">
      <input type="search" id="search-input" placeholder="Search name, email, service or booking ID…" oninput="onSearch(this.value)">
    </div>
    <div class="filter-tabs">
      <button class="tab active" id="tab-all" onclick="setFilter('all')">All (${allBookings.length})</button>
      <button class="tab" id="tab-upcoming" onclick="setFilter('upcoming')">Upcoming (${upcomingCount})</button>
      <button class="tab" id="tab-past" onclick="setFilter('past')">Past (${pastCount})</button>
    </div>
    <button class="export-btn" onclick="exportCsv()">⬇ CSV</button>
  </div>

  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Booking ID</th>
          <th>Client</th>
          <th>Service</th>
          <th>Date &amp; Time</th>
          <th>Amount</th>
          <th>Payment</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="bookings-tbody"></tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">✉️ Send Email to Client</div>
    <div class="card">
      <div class="card-body">
        <div class="alert alert-success" id="email-success"></div>
        <div class="alert alert-error" id="email-error"></div>
        <div class="field">
          <label>To: Client Email</label>
          <input type="email" id="e-to" placeholder="client@example.com">
        </div>
        <div class="field">
          <label>Subject</label>
          <input type="text" id="e-subject" placeholder="Your upcoming appointment — The Glam by Ankita">
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
    <div class="card">
      <div class="card-body" style="padding:20px 24px;">
        <p style="font-size:0.9rem;color:#4a2e22;margin-bottom:16px;line-height:1.6;">Regenerate your admin link. A new link will be emailed to you and this one will stop working immediately.</p>
        <button class="btn-outline" id="regen-btn" onclick="regenToken()">Regenerate Link</button>
        <span style="font-size:0.8rem;color:#9e7c4a;margin-left:10px;" id="regen-status"></span>
      </div>
    </div>
  </div>

</div>

<div class="toast" id="toast"></div>

<script>
var BOOKINGS = ${JSON.stringify(allBookings)};
var TOKEN = ${JSON.stringify(token)};
var TODAY = '${today}';
var currentFilter = 'all';
var searchTerm = '';
var expandedIdx = null;

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getFiltered() {
  var list = BOOKINGS;
  if (currentFilter === 'upcoming') list = list.filter(function(b){ return b.booking_date && b.booking_date >= TODAY; });
  if (currentFilter === 'past') list = list.filter(function(b){ return !b.booking_date || b.booking_date < TODAY; });
  if (searchTerm) {
    var s = searchTerm.toLowerCase();
    list = list.filter(function(b){
      return (b.client_name||'').toLowerCase().indexOf(s)>=0 ||
             (b.client_email||'').toLowerCase().indexOf(s)>=0 ||
             (b.service||'').toLowerCase().indexOf(s)>=0 ||
             (b.booking_id||'').toLowerCase().indexOf(s)>=0;
    });
  }
  return list;
}

function renderBookings() {
  var list = getFiltered();
  var tbody = document.getElementById('bookings-tbody');
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:38px;text-align:center;color:#b09080;font-size:0.9rem;">No bookings found.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(function(b, i){ return renderRow(b, i); }).join('');
}

function renderRow(b, i) {
  var badge = b.payment_method === 'cash'
    ? '<span class="badge-cash">Cash</span>'
    : '<span class="badge-card">Card</span>';
  var amount = b.total_aud
    ? '<span class="amount">A$' + Number(b.total_aud).toFixed(2) + '</span>'
    : '—';
  var dateStr = b.booking_date ? b.booking_date + (b.booking_time ? ' ' + b.booking_time : '') : '—';
  var bidDisplay = b.booking_id
    ? '<span class="bid">' + esc(b.booking_id) + '</span>'
    : '<span style="color:#ccc;font-size:0.78rem;">—</span>';
  var stripeUrl = b.stripe_payment_intent_id
    ? 'https://dashboard.stripe.com/payments/' + b.stripe_payment_intent_id
    : '';
  var stripeLink = stripeUrl
    ? '<a href="' + stripeUrl + '" target="_blank" style="color:#c9a96e;font-size:0.82rem;text-decoration:none;" onclick="event.stopPropagation()">View in Stripe ↗</a>'
    : '—';
  var createdStr = b.created_at
    ? new Date(b.created_at).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})
    : '—';
  var emailLink = b.client_email
    ? '<a href="mailto:' + esc(b.client_email) + '" style="color:#c9a96e;text-decoration:none;" onclick="event.stopPropagation()">' + esc(b.client_email) + '</a>'
    : '—';
  var fullBid = esc(b.booking_id || '—');
  var safeName = esc(b.client_name||'').replace(/'/g, "\\'");
  var safeEmail = esc(b.client_email||'').replace(/'/g, "\\'");
  var safeService = esc(b.service||'').replace(/'/g, "\\'");
  var safeDate = esc(b.booking_date||'').replace(/'/g, "\\'");
  var safeBid = fullBid.replace(/'/g, "\\'");

  var detailHtml =
    '<div class="detail-grid">' +
      '<div><span class="detail-label">Email</span><span class="detail-value">' + emailLink + '</span></div>' +
      '<div><span class="detail-label">Location</span><span class="detail-value">' + esc(b.location||'—') + '</span></div>' +
      '<div><span class="detail-label">People</span><span class="detail-value">' + esc(b.num_people||'—') + '</span></div>' +
      '<div><span class="detail-label">Booking ID</span><span class="detail-value">' + fullBid +
        '<button class="copy-btn" onclick="copyId(\'' + safeBid + '\',event)">📋 copy</button></span></div>' +
      '<div><span class="detail-label">Stripe</span><span class="detail-value">' + stripeLink + '</span></div>' +
      '<div><span class="detail-label">Booked at</span><span class="detail-value">' + createdStr + '</span></div>' +
    '</div>' +
    '<div class="detail-actions">' +
      '<button class="action-btn" onclick="prefillEmail(\'' + safeEmail + '\',\'' + safeName + '\',\'' + safeService + '\',\'' + safeDate + '\',event)">✉️ Email this client</button>' +
    '</div>';

  return '<tr class="booking-row" id="row-' + i + '" onclick="toggleRow(' + i + ')">' +
      '<td>' + bidDisplay + '</td>' +
      '<td class="client-name">' + esc(b.client_name||'—') + '</td>' +
      '<td>' + esc(b.service||'—') + '</td>' +
      '<td style="white-space:nowrap;font-size:0.84rem;">' + esc(dateStr) + '</td>' +
      '<td>' + amount + '</td>' +
      '<td>' + badge + '</td>' +
      '<td style="text-align:center;"><span class="expand-arrow" id="arrow-' + i + '">▼</span></td>' +
    '</tr>' +
    '<tr class="detail-row" id="detail-row-' + i + '"><td colspan="7">' +
      '<div class="detail-content" id="detail-' + i + '">' + detailHtml + '</div>' +
    '</td></tr>';
}

function toggleRow(idx) {
  var content = document.getElementById('detail-' + idx);
  var row = document.getElementById('row-' + idx);
  var arrow = document.getElementById('arrow-' + idx);
  if (!content) return;
  var isOpen = content.classList.contains('open');
  if (expandedIdx !== null && expandedIdx !== idx) {
    var prev = document.getElementById('detail-' + expandedIdx);
    var prevRow = document.getElementById('row-' + expandedIdx);
    var prevArrow = document.getElementById('arrow-' + expandedIdx);
    if (prev) { prev.classList.remove('open'); }
    if (prevRow) { prevRow.classList.remove('expanded'); }
    if (prevArrow) { prevArrow.style.transform = ''; }
  }
  if (isOpen) {
    content.classList.remove('open');
    row.classList.remove('expanded');
    arrow.style.transform = '';
    expandedIdx = null;
  } else {
    content.classList.add('open');
    row.classList.add('expanded');
    arrow.style.transform = 'rotate(180deg)';
    expandedIdx = idx;
  }
}

function setFilter(f) {
  currentFilter = f;
  expandedIdx = null;
  ['all','upcoming','past'].forEach(function(id) {
    var el = document.getElementById('tab-' + id);
    if (el) el.classList.toggle('active', id === f);
  });
  renderBookings();
  animateRows();
}

function onSearch(val) {
  searchTerm = val.trim();
  expandedIdx = null;
  renderBookings();
  animateRows();
}

function copyId(id, event) {
  event.stopPropagation();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(id).then(function(){ showToast('Copied: ' + id); });
  } else {
    showToast('Booking ID: ' + id);
  }
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hide');
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function(){
    t.classList.remove('show');
    t.classList.add('hide');
    setTimeout(function(){ t.classList.remove('hide'); }, 280);
  }, 2500);
}

function prefillEmail(email, name, service, date, event) {
  event.stopPropagation();
  document.getElementById('e-to').value = email;
  document.getElementById('e-subject').value = 'Your upcoming appointment — The Glam by Ankita';
  document.getElementById('e-body').value = 'Hi ' + name + ',\\n\\nJust a reminder about your ' + service + ' appointment' + (date ? ' on ' + date : '') + '.\\n\\nLooking forward to seeing you!\\n\\nWith love,\\nAnkita';
  document.getElementById('e-to').scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Email pre-filled for ' + name);
}

function exportCsv() {
  var list = getFiltered();
  var header = ['Booking ID','Client Name','Email','Service','Date','Time','Location','People','Amount (AUD)','Payment','Status','Created At'];
  var rows = list.map(function(b) {
    return [
      b.booking_id||'', b.client_name||'', b.client_email||'', b.service||'',
      b.booking_date||'', b.booking_time||'', b.location||'', b.num_people||'',
      b.total_aud||'', b.payment_method||'', b.status||'',
      b.created_at ? new Date(b.created_at).toLocaleDateString('en-AU') : ''
    ].map(function(v){ return '"' + String(v).replace(/"/g,'""') + '"'; }).join(',');
  });
  var csv = [header.join(',')].concat(rows).join('\\n');
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'glam-bookings-' + TODAY + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Downloaded ' + list.length + ' booking' + (list.length !== 1 ? 's' : ''));
}

function animateStat(el) {
  var target = parseInt(el.getAttribute('data-target'), 10) || 0;
  var prefix = el.getAttribute('data-prefix') || '';
  if (target === 0) { el.textContent = prefix + '0'; return; }
  var duration = 900;
  var startTime = null;
  function step(ts) {
    if (!startTime) startTime = ts;
    var progress = Math.min((ts - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = Math.round(target * eased);
    el.textContent = prefix + current.toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

document.querySelectorAll('.stat-value').forEach(function(el) {
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) { animateStat(el); obs.disconnect(); }
    });
  }, { threshold: 0.1 });
  obs.observe(el);
});

function animateRows() {
  var rows = document.querySelectorAll('.booking-row');
  rows.forEach(function(row, i) {
    row.style.opacity = '0';
    row.style.transform = 'translateY(6px)';
    setTimeout(function() {
      row.style.transition = 'opacity 0.28s ease, transform 0.28s ease, background 0.13s ease';
      row.style.opacity = '1';
      row.style.transform = 'translateY(0)';
    }, 30 + i * 28);
  });
}

renderBookings();
setTimeout(animateRows, 10);

async function sendEmail() {
  var btn = document.getElementById('send-email-btn');
  var success = document.getElementById('email-success');
  var error = document.getElementById('email-error');
  success.style.display = 'none'; error.style.display = 'none';
  var to = document.getElementById('e-to').value.trim();
  var subject = document.getElementById('e-subject').value.trim();
  var body = document.getElementById('e-body').value.trim();
  if (!to || !subject || !body) {
    error.textContent = 'Please fill in all fields.';
    error.style.display = 'block'; return;
  }
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    var res = await fetch('/api/admin-send-email?token=' + encodeURIComponent(TOKEN), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to, subject: subject, body: body }),
    });
    var json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed');
    success.textContent = 'Email sent to ' + to + '!';
    success.style.display = 'block';
    document.getElementById('e-to').value = '';
    document.getElementById('e-subject').value = '';
    document.getElementById('e-body').value = '';
    showToast('Email sent!');
  } catch(e) {
    error.textContent = 'Could not send email. Please try again.';
    error.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Send Email ✦';
  }
}

async function regenToken() {
  var btn = document.getElementById('regen-btn');
  var status = document.getElementById('regen-status');
  btn.disabled = true; status.textContent = 'Regenerating…';
  try {
    var res = await fetch('/api/admin?token=' + encodeURIComponent(TOKEN), { method: 'POST' });
    var json = await res.json();
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
