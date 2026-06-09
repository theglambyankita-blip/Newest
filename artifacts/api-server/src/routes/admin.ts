import { Router } from "express";
import nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import { db, adminTokens, bookings } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const ADMIN_EMAIL = "nishankn.ankita@gmail.com";
const SITE_URL = "https://www.theglambyankita.com";

function createTransporter() {
  const user = process.env["GMAIL_USER"];
  const pass = process.env["GMAIL_APP_PASSWORD"];
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}

function esc(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function getOrCreateToken(): Promise<string> {
  const now = new Date();
  const rows = await db
    .select()
    .from(adminTokens)
    .orderBy(desc(adminTokens.createdAt))
    .limit(1);

  if (rows.length > 0 && rows[0].expiresAt > now) {
    return rows[0].token;
  }

  return await generateNewToken();
}

async function generateNewToken(): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 3);

  await db.delete(adminTokens);
  await db.insert(adminTokens).values({ token, expiresAt });

  const adminUrl = `${SITE_URL}/api/admin?token=${token}`;
  const transporter = createTransporter();
  if (transporter) {
    await transporter
      .sendMail({
        from: `"The Glam by Ankita" <${process.env["GMAIL_USER"]}>`,
        to: ADMIN_EMAIL,
        subject: "✦ Your new admin dashboard link — The Glam by Ankita",
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
      })
      .catch((e) => console.error("Admin token email error:", e));
  }

  return token;
}

async function validateToken(token: string): Promise<boolean> {
  if (!token) return false;
  const now = new Date();
  const rows = await db
    .select()
    .from(adminTokens)
    .where(eq(adminTokens.token, token))
    .limit(1);
  return rows.length > 0 && rows[0].expiresAt > now;
}

// ── GET /api/admin — admin dashboard ────────────────────────────
router.get("/admin", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);

  if (!valid) {
    res.status(403).send(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Access Denied</title>
      <style>body{font-family:sans-serif;background:#fdf8f4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
      .box{text-align:center;padding:40px;background:#fff;border:1px solid #e8c4bc;border-radius:10px;max-width:400px;}
      h2{color:#6b3d2e;font-family:Georgia,serif;}p{color:#4a2e22;font-size:0.9rem;}</style>
      </head><body><div class="box"><h2>✦ Access Denied</h2><p>This link is invalid or has expired.<br>Please request a new admin link.</p></div></body></html>
    `);
    return;
  }

  const allBookings = await db
    .select()
    .from(bookings)
    .orderBy(desc(bookings.createdAt))
    .catch(() => []);

  const today = new Date().toISOString().split("T")[0];

  const upcoming = allBookings.filter(
    (b) => b.bookingDate && b.bookingDate >= today,
  );
  const past = allBookings.filter(
    (b) => !b.bookingDate || b.bookingDate < today,
  );

  function bookingRow(b: (typeof allBookings)[0], idx: number) {
    const badge =
      b.paymentMethod === "cash"
        ? `<span style="background:#f0e8c8;color:#8a6a00;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Cash</span>`
        : `<span style="background:#e8f4e8;color:#2c6e3f;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Card</span>`;
    const createdDate = b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-AU", { day:"2-digit", month:"short", year:"numeric" }) : "—";
    const reminderOn = b.sendReminder === "true";
    const reminderDone = b.reminderSent === "true";
    const reminderBtn = reminderDone
      ? `<span style="font-size:0.78rem;color:#2c6e3f;background:#e8f4e8;padding:3px 10px;border-radius:20px;">✅ Reminder sent</span>`
      : `<button id="reminder-btn-${idx}" onclick="toggleReminder(${idx},${b.id},event)" style="background:${reminderOn ? "linear-gradient(135deg,#c9a96e,#9e7c4a)" : "none"};border:1.5px solid ${reminderOn ? "#c9a96e" : "#d0b8b0"};color:${reminderOn ? "#fff" : "#9e7c4a"};padding:3px 10px;border-radius:20px;font-size:0.78rem;cursor:pointer;transition:all .2s;">🔔 ${reminderOn ? "Reminder ON" : "Send reminder?"}</button>`;
    return `<tr class="brow" data-idx="${idx}" style="border-bottom:1px solid #f0ddd6;cursor:pointer;" onclick="toggleDetails(${idx})">
      <td style="padding:10px 12px;color:#2c1810;font-weight:600;">${esc(b.clientName || "—")}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;">${esc(b.clientEmail || "—")}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;">${esc(b.service || "—")}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;white-space:nowrap;">${esc(b.bookingDate || "—")}${b.bookingTime ? ` ${esc(b.bookingTime)}` : ""}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;">${b.totalAud ? `A$${Number(b.totalAud).toFixed(2)}` : "—"}</td>
      <td style="padding:10px 12px;">${badge}</td>
      <td style="padding:10px 12px;">${reminderBtn}</td>
    </tr>
    <tr class="brow-detail" id="detail-${idx}" style="display:none;background:#fdf8f4;">
      <td colspan="7" style="padding:12px 20px 16px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;font-size:0.83rem;">
          ${b.location ? `<div><span style="font-weight:700;color:#6b3d2e;">Location:</span> ${esc(b.location)}</div>` : ""}
          ${b.numPeople ? `<div><span style="font-weight:700;color:#6b3d2e;">People:</span> ${esc(b.numPeople)}</div>` : ""}
          ${b.stripePaymentIntentId ? `<div><span style="font-weight:700;color:#6b3d2e;">Stripe PI:</span> <span style="font-family:monospace;font-size:0.78rem;">${esc(b.stripePaymentIntentId)}</span></div>` : ""}
          <div><span style="font-weight:700;color:#6b3d2e;">Status:</span> ${esc(b.status || "confirmed")}</div>
          <div><span style="font-weight:700;color:#6b3d2e;">Booked on:</span> ${createdDate}</div>
        </div>
        <button onclick="prefillEmail('${esc(b.clientEmail || "")}');event.stopPropagation();" style="margin-top:10px;background:none;border:1px solid #c9a96e;color:#9e7c4a;padding:5px 14px;border-radius:5px;font-size:0.8rem;cursor:pointer;">✉️ Email this client</button>
      </td>
    </tr>`;
  }

  const allBookingRows = allBookings.map((b, i) => bookingRow(b, i)).join("");

  const totalRevenue = allBookings
    .filter((b) => b.paymentMethod === "card" && b.totalAud)
    .reduce((sum, b) => sum + Number(b.totalAud || 0), 0);

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
  .stats{display:flex;gap:16px;flex-wrap:wrap;margin-top:20px;}
  .stat{background:rgba(255,255,255,0.18);border-radius:8px;padding:12px 20px;text-align:center;min-width:100px;}
  .stat-val{font-family:Georgia,serif;font-size:1.6rem;font-weight:700;}
  .stat-lbl{font-size:0.75rem;opacity:0.88;margin-top:2px;}
  .content{max-width:1100px;margin:0 auto;padding:28px 20px 60px;}
  .section{margin-bottom:32px;}
  .section-title{font-family:Georgia,serif;font-size:1rem;color:#6b3d2e;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #e8c4bc;display:flex;align-items:center;gap:8px;}
  .toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center;}
  .search-input{padding:8px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.88rem;color:#2c1810;background:#fff;outline:none;transition:border-color .2s;flex:1;min-width:180px;}
  .search-input:focus{border-color:#c9a96e;}
  select.filter-sel{padding:8px 12px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.88rem;color:#2c1810;background:#fff;outline:none;cursor:pointer;}
  .card{background:#fff;border:1px solid #e8c4bc;border-radius:10px;overflow:hidden;}
  .table-wrap{overflow-x:auto;}
  table{width:100%;border-collapse:collapse;font-size:0.88rem;}
  th{padding:10px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.05em;background:#fdf5f0;border-bottom:1px solid #e8c4bc;white-space:nowrap;}
  .brow:hover{background:#fdf5f0;}
  .email-form{padding:24px;}
  .field{margin-bottom:16px;}
  label{display:block;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;}
  input,textarea{width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;outline:none;transition:border-color .2s;}
  input:focus,textarea:focus{border-color:#c9a96e;}
  textarea{resize:vertical;min-height:140px;}
  .btn{display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;font-family:Georgia,serif;cursor:pointer;letter-spacing:0.03em;transition:opacity .2s;}
  .btn:hover{opacity:0.88;}
  .btn:disabled{opacity:0.5;cursor:not-allowed;}
  .btn-outline{background:none;border:1.5px solid #c9a96e;color:#9e7c4a;padding:8px 18px;border-radius:6px;font-size:0.85rem;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit;white-space:nowrap;}
  .btn-outline:hover{background:#fdf0ee;}
  .btn-sm{padding:7px 16px;font-size:0.82rem;}
  .alert{padding:12px 16px;border-radius:6px;font-size:0.88rem;margin-bottom:16px;display:none;}
  .alert-success{background:#f0fff4;border:1px solid #a8e6b8;color:#2c6e3f;}
  .alert-error{background:#fff0f0;border:1px solid #f5c0c0;color:#c0392b;}
  .regen-section{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
  .regen-note{font-size:0.8rem;color:#9e7c4a;}
  #no-results{display:none;padding:18px;color:#aaa;text-align:center;font-size:0.9rem;}
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
  <p>View and manage all bookings, send emails to clients.</p>
  <div class="stats">
    <div class="stat"><div class="stat-val">${allBookings.length}</div><div class="stat-lbl">Total Bookings</div></div>
    <div class="stat"><div class="stat-val">${upcoming.length}</div><div class="stat-lbl">Upcoming</div></div>
    <div class="stat"><div class="stat-val">A$${totalRevenue.toFixed(2)}</div><div class="stat-lbl">Card Revenue</div></div>
    <div class="stat"><div class="stat-val">${allBookings.filter(b => b.paymentMethod === "cash").length}</div><div class="stat-lbl">Cash Bookings</div></div>
  </div>
</div>

<div class="content">

  <div class="section">
    <div class="section-title">📋 All Bookings</div>
    <div class="toolbar">
      <input class="search-input" id="search-input" type="text" placeholder="Search by name, email, or service…" oninput="filterTable()">
      <select class="filter-sel" id="filter-payment" onchange="filterTable()">
        <option value="">All payments</option>
        <option value="card">Card</option>
        <option value="cash">Cash</option>
      </select>
      <select class="filter-sel" id="filter-time" onchange="filterTable()">
        <option value="">All dates</option>
        <option value="upcoming">Upcoming</option>
        <option value="past">Past</option>
      </select>
      <button class="btn-outline btn-sm" onclick="exportCSV()">⬇ Export CSV</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table id="bookings-table">
          <thead><tr>
            <th>Client</th><th>Email</th><th>Service</th><th>Date & Time</th><th>Amount</th><th>Payment</th><th>Reminder</th>
          </tr></thead>
          <tbody id="bookings-tbody">${allBookingRows}</tbody>
        </table>
        <div id="no-results">No bookings match your search.</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">✉️ Send Email to Client</div>
    <div class="card">
      <div class="email-form">
        <div class="alert alert-success" id="email-success">Email sent successfully!</div>
        <div class="alert alert-error" id="email-error">Could not send email. Please try again.</div>
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
      <div class="regen-section">
        <button class="btn-outline" id="regen-btn" onclick="regenToken()">Regenerate Link</button>
        <span class="regen-note" id="regen-status"></span>
      </div>
    </div>
  </div>

</div>

<script>
const TOKEN = ${JSON.stringify(token)};
const API = '/api';
const TODAY = new Date().toISOString().split('T')[0];

const ALL_BOOKINGS = ${JSON.stringify(allBookings.map(b => ({
  id: b.id,
  clientName: b.clientName || "",
  clientEmail: b.clientEmail || "",
  service: b.service || "",
  bookingDate: b.bookingDate || "",
  bookingTime: b.bookingTime || "",
  location: b.location || "",
  numPeople: b.numPeople || "",
  totalAud: b.totalAud ? Number(b.totalAud).toFixed(2) : "",
  paymentMethod: b.paymentMethod || "",
  status: b.status || "confirmed",
  stripePaymentIntentId: b.stripePaymentIntentId || "",
  sendReminder: b.sendReminder || "false",
  reminderSent: b.reminderSent || "false",
  createdAt: b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-AU") : "",
}))
)};

async function toggleReminder(idx, bookingId, event) {
  event.stopPropagation();
  const btn = document.getElementById('reminder-btn-' + idx);
  if (!btn) return;
  const isOn = btn.textContent.includes('ON');
  const newVal = !isOn;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const res = await fetch(API + '/admin/toggle-reminder?token=' + encodeURIComponent(TOKEN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, sendReminder: newVal }),
    });
    if (!res.ok) throw new Error('Failed');
    btn.style.background = newVal ? 'linear-gradient(135deg,#c9a96e,#9e7c4a)' : 'none';
    btn.style.border = '1.5px solid ' + (newVal ? '#c9a96e' : '#d0b8b0');
    btn.style.color = newVal ? '#fff' : '#9e7c4a';
    btn.textContent = '🔔 ' + (newVal ? 'Reminder ON' : 'Send reminder?');
  } catch(e) {
    btn.textContent = '❌ Error';
  } finally {
    btn.disabled = false;
  }
}

function toggleDetails(idx) {
  const row = document.getElementById('detail-' + idx);
  if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

function filterTable() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const pm = document.getElementById('filter-payment').value;
  const ft = document.getElementById('filter-time').value;
  const rows = document.querySelectorAll('.brow');
  const details = document.querySelectorAll('.brow-detail');
  let visible = 0;
  rows.forEach((row, i) => {
    const b = ALL_BOOKINGS[i];
    if (!b) return;
    const matchQ = !q || [b.clientName, b.clientEmail, b.service, b.location].join(' ').toLowerCase().includes(q);
    const matchPm = !pm || b.paymentMethod === pm;
    const matchFt = !ft ||
      (ft === 'upcoming' && b.bookingDate >= TODAY) ||
      (ft === 'past' && (!b.bookingDate || b.bookingDate < TODAY));
    const show = matchQ && matchPm && matchFt;
    row.style.display = show ? '' : 'none';
    if (details[i]) details[i].style.display = 'none';
    if (show) visible++;
  });
  document.getElementById('no-results').style.display = visible === 0 ? 'block' : 'none';
}

function exportCSV() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const pm = document.getElementById('filter-payment').value;
  const ft = document.getElementById('filter-time').value;
  const filtered = ALL_BOOKINGS.filter(b => {
    const matchQ = !q || [b.clientName, b.clientEmail, b.service, b.location].join(' ').toLowerCase().includes(q);
    const matchPm = !pm || b.paymentMethod === pm;
    const matchFt = !ft ||
      (ft === 'upcoming' && b.bookingDate >= TODAY) ||
      (ft === 'past' && (!b.bookingDate || b.bookingDate < TODAY));
    return matchQ && matchPm && matchFt;
  });
  const headers = ['Name','Email','Service','Date','Time','Location','People','Amount (AUD)','Payment','Status','Booked On'];
  const rows = filtered.map(b => [
    b.clientName, b.clientEmail, b.service, b.bookingDate, b.bookingTime,
    b.location, b.numPeople, b.totalAud, b.paymentMethod, b.status, b.createdAt
  ].map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(','));
  const csv = [headers.join(','), ...rows].join('\\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'glam-bookings-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function prefillEmail(email) {
  document.getElementById('e-to').value = email;
  document.getElementById('e-subject').focus();
  document.getElementById('e-subject').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

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
    error.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await fetch(API + '/admin/send-client-email?token=' + encodeURIComponent(TOKEN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    btn.disabled = false;
    btn.textContent = 'Send Email ✦';
  }
}

async function regenToken() {
  const btn = document.getElementById('regen-btn');
  const status = document.getElementById('regen-status');
  btn.disabled = true;
  status.textContent = 'Regenerating…';
  try {
    const res = await fetch(API + '/admin/regenerate-token?token=' + encodeURIComponent(TOKEN), { method: 'POST' });
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

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ── POST /api/admin/send-client-email ───────────────────────────
router.post("/admin/send-client-email", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const { to, subject, body } = req.body as {
    to?: string;
    subject?: string;
    body?: string;
  };

  if (!to || !subject || !body) {
    res.status(400).json({ error: "Missing required fields." });
    return;
  }

  const transporter = createTransporter();
  if (!transporter) {
    res.status(503).json({ error: "Email not configured." });
    return;
  }

  const gmailUser = process.env["GMAIL_USER"] || "";

  const paragraphs = body
    .split("\n")
    .map((line) =>
      line.trim()
        ? `<p style="font-size:0.95rem;color:#4a2e22;line-height:1.75;margin:0 0 12px;">${esc(line)}</p>`
        : `<div style="height:8px;"></div>`,
    )
    .join("");

  const html = `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
      <img src="${SITE_URL}/logo-original.png" width="40" height="40"
        style="border-radius:50%;object-fit:cover;display:block;margin-bottom:12px;" alt="">
      <h2 style="margin:0;color:#fff;font-family:Georgia,serif;font-size:1.3rem;">The Glam by Ankita</h2>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">✦ Beauty & Makeup Artist</p>
    </div>
    <div style="padding:28px 32px 8px;">
      ${paragraphs}
    </div>
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
    await transporter.sendMail({
      from: `"The Glam by Ankita" <${gmailUser}>`,
      to,
      subject,
      html,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("Admin send-client-email error:", e);
    res.status(500).json({ error: "Failed to send email." });
  }
});

// ── POST /api/admin/toggle-reminder ─────────────────────────────
router.post("/admin/toggle-reminder", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }

  const { bookingId, sendReminder } = req.body as { bookingId?: number; sendReminder?: boolean };
  if (bookingId == null) { res.status(400).json({ error: "Missing bookingId" }); return; }

  try {
    await db.update(bookings)
      .set({ sendReminder: sendReminder ? "true" : "false" })
      .where(eq(bookings.id, bookingId));
    res.json({ ok: true });
  } catch (e) {
    console.error("Admin toggle-reminder error:", e);
    res.status(500).json({ error: "Failed to update reminder." });
  }
});

// ── POST /api/admin/regenerate-token ────────────────────────────
router.post("/admin/regenerate-token", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  try {
    await generateNewToken();
    res.json({ ok: true });
  } catch (e) {
    console.error("Admin regen token error:", e);
    res.status(500).json({ error: "Failed to regenerate token." });
  }
});

// ── POST /api/admin/init — create first token if none exists ─────
// Called internally on startup
export async function initAdminToken() {
  try {
    await getOrCreateToken();
  } catch (e) {
    console.error("Admin token init error:", e);
  }
}

export default router;
