import { Router } from "express";
import nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { db, adminTokens, bookings } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

const ADMIN_EMAIL = "nishankn.ankita@gmail.com";

// ── Gallery setup ─────────────────────────────────────────────────
// Use import.meta.url so the path resolves correctly regardless of cwd.
// At runtime, import.meta.url = file:///.../artifacts/api-server/dist/index.mjs
// so 3 levels up reaches the workspace root.
const _adminDir = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_DIR = path.join(_adminDir, "../../../artifacts/glam-by-ankita/public/gallery");
if (!fs.existsSync(GALLERY_DIR)) fs.mkdirSync(GALLERY_DIR, { recursive: true });

const galleryStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, GALLERY_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `gallery-${Date.now()}${ext}`);
  },
});
const uploadMiddleware = multer({
  storage: galleryStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

interface GalleryMeta {
  filename: string;
  title: string;
  category: string;
  desc: string;
  uploadedAt: string;
  featured?: boolean;
  objectPosition?: string;
}

function readGalleryMeta(): GalleryMeta[] {
  const metaPath = path.join(GALLERY_DIR, "gallery.json");
  if (!fs.existsSync(metaPath)) return [];
  try { return JSON.parse(fs.readFileSync(metaPath, "utf8")); }
  catch { return []; }
}

function writeGalleryMeta(items: GalleryMeta[]) {
  fs.writeFileSync(path.join(GALLERY_DIR, "gallery.json"), JSON.stringify(items, null, 2));
}
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
  const thisMonthPrefix = today.slice(0, 7);

  const upcoming = allBookings.filter(
    (b) => b.bookingDate && b.bookingDate >= today,
  );
  const past = allBookings.filter(
    (b) => !b.bookingDate || b.bookingDate < today,
  );
  const cardPayments = allBookings.filter((b) => b.paymentMethod === "card");
  const thisMonth = allBookings.filter(
    (b) => b.bookingDate && b.bookingDate.startsWith(thisMonthPrefix),
  );

  const view = ((req.query.view as string) || "all").toLowerCase();
  const displayedBookings =
    view === "upcoming" ? upcoming
    : view === "past" ? past
    : view === "card" ? cardPayments
    : view === "thismonth" ? thisMonth
    : allBookings;

  const viewLabels: Record<string, string> = {
    all: "All Bookings",
    upcoming: "Upcoming Bookings",
    past: "Past Bookings",
    card: "Card Payments",
    thismonth: "This Month's Bookings",
  };

  const baseUrl = `/api/admin?token=${encodeURIComponent(token)}`;
  const viewUrl = (v: string) => v === "all" ? baseUrl : `${baseUrl}&view=${v}`;

  function bookingRow(b: (typeof allBookings)[0], idx: number) {
    const badge =
      b.paymentMethod === "cash"
        ? `<span style="background:#f0e8c8;color:#8a6a00;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Cash</span>`
        : `<span style="background:#e8f4e8;color:#2c6e3f;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Card</span>`;
    const createdDate = b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-AU", { day:"2-digit", month:"short", year:"numeric" }) : "—";
    const hasMsg = !!(b.clientMessage && b.clientMessage.trim());
    const reminderDone = b.reminderSent === "true";
    const msgLabel = hasMsg ? "✏️ Edit message" : "💬 Add message";
    const msgBadge = hasMsg
      ? `<span style="font-size:0.78rem;color:#6b3d2e;background:#fdf0ee;padding:3px 10px;border-radius:20px;border:1px solid #e8c4bc;">💬 Message set${reminderDone ? " · ✅ Sent" : ""}</span>`
      : (reminderDone ? `<span style="font-size:0.78rem;color:#2c6e3f;background:#e8f4e8;padding:3px 10px;border-radius:20px;">✅ Reminder sent</span>` : "");
    return `<tr class="brow" data-idx="${idx}" style="border-bottom:1px solid #f0ddd6;cursor:pointer;" onclick="toggleDetails(${idx})">
      <td style="padding:10px 12px;color:#2c1810;font-weight:600;">${esc(b.clientName || "—")}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;">${esc(b.clientEmail || "—")}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;">${esc(b.service || "—")}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;white-space:nowrap;">${esc(b.bookingDate || "—")}${b.bookingTime ? ` ${esc(b.bookingTime)}` : ""}</td>
      <td style="padding:10px 12px;color:#4a2e22;font-size:0.85rem;">${b.totalAud ? `A$${Number(b.totalAud).toFixed(2)}` : "—"}</td>
      <td style="padding:10px 12px;">${badge}</td>
      <td style="padding:10px 12px;">${msgBadge}</td>
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
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button onclick="prefillEmail('${esc(b.clientEmail || "")}');event.stopPropagation();" style="background:none;border:1px solid #c9a96e;color:#9e7c4a;padding:5px 14px;border-radius:5px;font-size:0.8rem;cursor:pointer;">✉️ Email this client</button>
          <button onclick="openMessageModal(${b.id},${idx},event)" style="background:none;border:1px solid #c9a96e;color:#9e7c4a;padding:5px 14px;border-radius:5px;font-size:0.8rem;cursor:pointer;">${msgLabel}</button>
        </div>
        ${hasMsg ? `<div id="msg-preview-${idx}" style="margin-top:10px;padding:10px 14px;background:#fff9f5;border:1px solid #e8c4bc;border-radius:6px;font-size:0.83rem;color:#4a2e22;line-height:1.6;white-space:pre-wrap;">${esc(b.clientMessage || "")}</div>` : `<div id="msg-preview-${idx}" style="display:none;margin-top:10px;padding:10px 14px;background:#fff9f5;border:1px solid #e8c4bc;border-radius:6px;font-size:0.83rem;color:#4a2e22;line-height:1.6;white-space:pre-wrap;"></div>`}
      </td>
    </tr>`;
  }

  const allBookingRows = displayedBookings.map((b, i) => bookingRow(b, i)).join("");

  const totalRevenue = allBookings
    .filter((b) => b.paymentMethod === "card" && b.totalAud)
    .reduce((sum, b) => sum + Number(b.totalAud || 0), 0);

  const thisMonthRevenue = thisMonth
    .filter((b) => b.totalAud)
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
  .stat{background:rgba(255,255,255,0.18);border-radius:8px;padding:12px 20px;text-align:center;min-width:100px;cursor:pointer;transition:background .2s,transform .15s;border:2px solid transparent;user-select:none;text-decoration:none;color:inherit;display:block;}
  .stat:hover{background:rgba(255,255,255,0.28);transform:translateY(-1px);}
  .stat.active{background:rgba(255,255,255,0.35);border-color:rgba(255,255,255,0.55);}
  .stat-val{font-family:Georgia,serif;font-size:1.6rem;font-weight:700;}
  .stat-lbl{font-size:0.75rem;opacity:0.88;margin-top:2px;}
  .content{max-width:1100px;margin:0 auto;padding:28px 20px 60px;}
  .section{margin-bottom:32px;}
  .section-title{font-family:Georgia,serif;font-size:1rem;color:#6b3d2e;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #e8c4bc;display:flex;align-items:center;gap:8px;}
  .toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;}
  .search-input{padding:8px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.88rem;color:#2c1810;background:#fff;outline:none;transition:border-color .2s;flex:1;min-width:200px;}
  .search-input:focus{border-color:#c9a96e;}
  select.filter-sel{padding:8px 12px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.88rem;color:#2c1810;background:#fff;outline:none;cursor:pointer;}
  .tab-btn{padding:7px 14px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.85rem;font-weight:600;color:#6b3d2e;background:#fff;cursor:pointer;transition:all .18s;font-family:inherit;white-space:nowrap;text-decoration:none;display:inline-block;}
  .tab-btn:hover{border-color:#c9a96e;background:#fdf5f0;}
  .tab-btn.tab-active{background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border-color:transparent;}
  .tab-btn.tab-csv{border-color:#c9a96e;color:#9e7c4a;}
  .tab-btn.tab-csv:hover{background:#c9a96e;color:#fff;}
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
    <a class="stat ${view==='all'?'active':''}" href="${viewUrl('all')}"><div class="stat-val">${allBookings.length}</div><div class="stat-lbl">Total Bookings</div></a>
    <a class="stat ${view==='upcoming'?'active':''}" href="${viewUrl('upcoming')}"><div class="stat-val">${upcoming.length}</div><div class="stat-lbl">Upcoming</div></a>
    <a class="stat ${view==='card'?'active':''}" href="${viewUrl('card')}"><div class="stat-val">A$${totalRevenue.toFixed(2)}</div><div class="stat-lbl">Total Revenue</div></a>
    <a class="stat ${view==='thismonth'?'active':''}" href="${viewUrl('thismonth')}"><div class="stat-val">A$${thisMonthRevenue.toFixed(2)}</div><div class="stat-lbl">This Month</div></a>
  </div>
</div>

<div class="content">

  <div class="section">
    <div class="section-title">📋 ${viewLabels[view] || "All Bookings"} <span style="font-size:0.8rem;font-weight:400;color:#9e7c4a;font-family:'Nunito',sans-serif;">(${displayedBookings.length})</span></div>
    <div class="toolbar">
      <input class="search-input" id="search-input" type="text" placeholder="🔍 Search name, email, service or booking ID…" oninput="filterTable()">
      <a class="tab-btn ${view==='all'?'tab-active':''}" href="${viewUrl('all')}">All (${allBookings.length})</a>
      <a class="tab-btn ${view==='upcoming'?'tab-active':''}" href="${viewUrl('upcoming')}">Upcoming (${upcoming.length})</a>
      <a class="tab-btn ${view==='past'?'tab-active':''}" href="${viewUrl('past')}">Past (${past.length})</a>
      <button class="tab-btn tab-csv" onclick="exportCSV()">⬇ CSV</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table id="bookings-table">
          <thead><tr>
            <th>Client</th><th>Email</th><th>Service</th><th>Date & Time</th><th>Amount</th><th>Payment</th><th>Reminder Msg</th>
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
    <div class="section-title">🖼️ Gallery Manager</div>
    <div class="card" style="padding:20px 24px;">
      <div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #f0ddd6;">
        <h3 style="font-size:0.95rem;color:#6b3d2e;margin:0 0 14px;font-family:Georgia,serif;">Upload New Photo</h3>
        <div style="display:grid;gap:10px;">
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <div class="field" style="margin:0;flex:1;min-width:180px;">
              <label style="font-size:0.8rem;">Photo Title</label>
              <input type="text" id="gal-title" placeholder="e.g. Soft Glam with Blue Liner">
            </div>
            <div class="field" style="margin:0;">
              <label style="font-size:0.8rem;">Category</label>
              <select id="gal-cat" class="filter-sel">
                <option value="glam">Glam</option>
                <option value="bridal">Bridal</option>
                <option value="editorial">Editorial</option>
                <option value="festival">Festival</option>
              </select>
            </div>
          </div>
          <div class="field" style="margin:0;">
            <label style="font-size:0.8rem;">Description (optional)</label>
            <input type="text" id="gal-desc" placeholder="Brief description of the look">
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <input type="file" id="gal-file" accept="image/*" style="font-size:0.85rem;color:#4a2e22;">
            <button class="btn" id="gal-upload-btn" onclick="uploadGalleryPhoto()">Upload Photo ✦</button>
            <span id="gal-upload-status" style="font-size:0.83rem;"></span>
          </div>
        </div>
      </div>
      <h3 style="font-size:0.95rem;color:#6b3d2e;margin:0 0 14px;font-family:Georgia,serif;">Uploaded Photos <span style="font-size:0.8rem;font-weight:400;color:#9e7c4a;font-family:'Nunito',sans-serif;">— drag to reorder, hover to edit or delete</span></h3>
      <div id="gal-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">
        <div style="color:#9e7c4a;font-size:0.85rem;padding:20px 0;">Loading…</div>
      </div>
    </div>
  </div>

  <!-- GALLERY EDIT MODAL -->
  <div id="gal-edit-overlay" style="display:none;position:fixed;inset:0;background:rgba(44,24,16,0.55);z-index:999;align-items:center;justify-content:center;padding:20px;">
    <div style="background:#fff;border-radius:10px;padding:28px 28px 22px;max-width:400px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.22);position:relative;">
      <button onclick="closeGalEditModal()" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.3rem;color:#9e7c4a;cursor:pointer;line-height:1;">✕</button>
      <h3 style="font-family:Georgia,serif;color:#6b3d2e;margin:0 0 18px;font-size:1.05rem;">✏️ Edit Photo Details</h3>
      <div class="field"><label>Title</label><input type="text" id="gal-edit-title" placeholder="e.g. Soft Glam"></div>
      <div class="field"><label>Category</label>
        <select id="gal-edit-cat" class="filter-sel" style="width:100%;">
          <option value="glam">Glam</option>
          <option value="bridal">Bridal</option>
          <option value="editorial">Editorial</option>
          <option value="festival">Festival</option>
        </select>
      </div>
      <div class="field"><label>Description (optional)</label><input type="text" id="gal-edit-desc" placeholder="Brief description of the look"></div>
      <div class="field" style="margin-top:14px;">
        <label style="display:block;margin-bottom:7px;">Focus Point <span style="font-weight:400;color:#9e7c4a;font-size:0.78rem;">(click dot to recentre)</span></label>
        <div style="display:flex;gap:12px;align-items:center;">
          <div id="gal-pos-grid" style="display:grid;grid-template-columns:repeat(3,30px);gap:5px;flex-shrink:0;"></div>
          <div style="flex:1;height:90px;border-radius:6px;overflow:hidden;background:#f0ddd6;border:1px solid #e8c4bc;position:relative;">
            <img id="gal-pos-preview-img" src="" alt="" style="width:100%;height:100%;object-fit:cover;display:block;transition:object-position 0.25s;">
          </div>
        </div>
        <p style="font-size:0.72rem;color:#9e7c4a;margin:5px 0 0;">Adjust which part of the photo is visible in the card</p>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px;align-items:center;flex-wrap:wrap;">
        <button class="btn" onclick="saveGalEdit()">Save Changes ✦</button>
        <button class="btn-outline" onclick="closeGalEditModal()">Cancel</button>
        <span id="gal-edit-status" style="font-size:0.83rem;"></span>
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
  clientMessage: b.clientMessage || "",
  createdAt: b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-AU") : "",
}))
)};

let _modalBookingId = null;
let _modalIdx = null;

function openMessageModal(bookingId, idx, event) {
  event.stopPropagation();
  _modalBookingId = bookingId;
  _modalIdx = idx;
  const b = ALL_BOOKINGS.find(x => x.id === bookingId);
  document.getElementById('modal-textarea').value = b ? b.clientMessage : '';
  document.getElementById('modal-client-name').textContent = b ? b.clientName : '';
  document.getElementById('modal-save-status').textContent = '';
  document.getElementById('msg-modal-overlay').style.display = 'flex';
  document.getElementById('modal-textarea').focus();
}

function closeMessageModal() {
  document.getElementById('msg-modal-overlay').style.display = 'none';
  _modalBookingId = null;
  _modalIdx = null;
}

async function saveClientMessage() {
  const msg = document.getElementById('modal-textarea').value.trim();
  const statusEl = document.getElementById('modal-save-status');
  const saveBtn = document.getElementById('modal-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  statusEl.textContent = '';
  try {
    const res = await fetch(API + '/admin/save-client-message?token=' + encodeURIComponent(TOKEN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: _modalBookingId, message: msg }),
    });
    if (!res.ok) throw new Error('Failed');
    const b = ALL_BOOKINGS.find(x => x.id === _modalBookingId);
    if (b) b.clientMessage = msg;
    const preview = document.getElementById('msg-preview-' + _modalIdx);
    if (preview) {
      preview.textContent = msg;
      preview.style.display = msg ? '' : 'none';
    }
    statusEl.style.color = '#2c6e3f';
    statusEl.textContent = '✅ Saved!';
    setTimeout(closeMessageModal, 800);
  } catch(e) {
    statusEl.style.color = '#c0392b';
    statusEl.textContent = '❌ Could not save. Try again.';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Message';
  }
}

function toggleDetails(idx) {
  const row = document.getElementById('detail-' + idx);
  if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

function filterTable() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const rows = document.querySelectorAll('.brow');
  const details = document.querySelectorAll('.brow-detail');
  let visible = 0;
  rows.forEach((row, i) => {
    const b = ALL_BOOKINGS[i];
    if (!b) return;
    const show = !q || [b.clientName, b.clientEmail, b.service, b.location, String(b.id||'')].join(' ').toLowerCase().includes(q);
    row.style.display = show ? '' : 'none';
    if (details[i]) details[i].style.display = 'none';
    if (show) visible++;
  });
  document.getElementById('no-results').style.display = visible === 0 ? 'block' : 'none';
}

function exportCSV() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const filtered = ALL_BOOKINGS.filter(b =>
    !q || [b.clientName, b.clientEmail, b.service, b.location, String(b.id||'')].join(' ').toLowerCase().includes(q)
  );
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

var _galleryPhotos = [];
var _dragSrcIdx = null;

function renderGallery() {
  var grid = document.getElementById('gal-grid');
  if (!_galleryPhotos.length) {
    grid.innerHTML = '<div style="color:#9e7c4a;font-size:0.85rem;padding:20px 0;">No photos uploaded yet. Use the form above to add your first photo.</div>';
    return;
  }
  grid.innerHTML = _galleryPhotos.map(function(p, i) {
    return '<div class="gal-card" draggable="true" data-idx="' + i + '" data-filename="' + p.filename + '" ' +
      'style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:3/4;background:#f0ddd6;box-shadow:0 2px 8px rgba(0,0,0,0.08);cursor:grab;transition:outline 0.1s;">' +
      '<div style="position:absolute;top:6px;right:6px;z-index:2;background:rgba(255,255,255,0.75);border-radius:4px;padding:2px 5px;font-size:0.8rem;color:#9e7c4a;cursor:grab;line-height:1;">⠿</div>' +
      (p.featured ? '<div style="position:absolute;top:6px;left:6px;z-index:2;background:rgba(201,169,110,0.95);border-radius:4px;padding:2px 7px;font-size:0.68rem;color:#fff;font-weight:700;line-height:1.4;">⭐ Featured</div>' : '') +
      '<img src="/gallery/' + p.filename + '" alt="' + p.title + '" style="width:100%;height:100%;object-fit:cover;object-position:' + (p.objectPosition || 'center center') + ';display:block;pointer-events:none;">' +
      '<div class="gal-overlay" style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.78) 0%,transparent 50%);opacity:0;transition:opacity 0.2s;display:flex;flex-direction:column;justify-content:flex-end;padding:10px;">' +
        '<div style="font-size:0.73rem;color:#fff;font-weight:700;line-height:1.3;">' + p.title + '</div>' +
        '<div style="font-size:0.68rem;color:rgba(255,255,255,0.8);margin-top:2px;text-transform:capitalize;">' + p.category + '</div>' +
        '<div style="display:flex;gap:5px;margin-top:7px;flex-wrap:wrap;">' +
          '<button onclick="toggleFeatured(\'' + p.filename + '\',' + i + ',event)" style="background:' + (p.featured ? 'rgba(201,169,110,0.95)' : 'rgba(80,60,40,0.7)') + ';color:#fff;border:none;padding:4px 9px;border-radius:4px;font-size:0.7rem;cursor:pointer;font-family:inherit;">' + (p.featured ? '⭐ Unfeature' : '☆ Feature') + '</button>' +
          '<button onclick="openGalEditModal(\'' + p.filename + '\',' + i + ',event)" style="background:rgba(60,100,160,0.85);color:#fff;border:none;padding:4px 9px;border-radius:4px;font-size:0.7rem;cursor:pointer;font-family:inherit;">✏️</button>' +
          '<button onclick="deleteGalleryPhoto(\'' + p.filename + '\')" style="background:rgba(200,50,50,0.9);color:#fff;border:none;padding:4px 9px;border-radius:4px;font-size:0.7rem;cursor:pointer;font-family:inherit;">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  grid.querySelectorAll('.gal-card').forEach(function(card) {
    card.addEventListener('dragstart', function(e) {
      _dragSrcIdx = parseInt(card.dataset.idx);
      card.style.opacity = '0.45';
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', function() {
      card.style.opacity = '';
      grid.querySelectorAll('.gal-card').forEach(function(c) { c.style.outline = ''; });
    });
    card.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      grid.querySelectorAll('.gal-card').forEach(function(c) { c.style.outline = ''; });
      card.style.outline = '2px solid #c9a96e';
    });
    card.addEventListener('dragleave', function() { card.style.outline = ''; });
    card.addEventListener('drop', function(e) {
      e.preventDefault();
      var targetIdx = parseInt(card.dataset.idx);
      if (_dragSrcIdx === null || _dragSrcIdx === targetIdx) return;
      var moved = _galleryPhotos.splice(_dragSrcIdx, 1)[0];
      _galleryPhotos.splice(targetIdx, 0, moved);
      _dragSrcIdx = null;
      renderGallery();
      saveGalleryOrder();
    });
    var overlay = card.querySelector('.gal-overlay');
    if (overlay) {
      card.addEventListener('mouseenter', function() { overlay.style.opacity = '1'; });
      card.addEventListener('mouseleave', function() { overlay.style.opacity = '0'; });
    }
  });
}

async function saveGalleryOrder() {
  var filenames = _galleryPhotos.map(function(p) { return p.filename; });
  try {
    await fetch(API + '/admin/gallery/reorder?token=' + encodeURIComponent(TOKEN), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames: filenames })
    });
  } catch(e) {}
}

async function toggleFeatured(filename, idx, ev) {
  ev.stopPropagation();
  try {
    var res = await fetch(API + '/admin/gallery/' + encodeURIComponent(filename) + '/featured?token=' + encodeURIComponent(TOKEN), { method: 'PUT' });
    var data = await res.json();
    if (data.ok) {
      _galleryPhotos[idx].featured = data.featured;
      renderGallery();
    }
  } catch(e) {}
}

var _galEditPos = 'center center';
var _galPosOptions = [
  ['left top','center top','right top'],
  ['left center','center center','right center'],
  ['left bottom','center bottom','right bottom']
];

function initPosGrid(filename, currentPos) {
  _galEditPos = currentPos || 'center center';
  var previewImg = document.getElementById('gal-pos-preview-img');
  previewImg.src = '/gallery/' + filename;
  previewImg.style.objectPosition = _galEditPos;
  var grid = document.getElementById('gal-pos-grid');
  grid.innerHTML = '';
  for (var row = 0; row < 3; row++) {
    for (var col = 0; col < 3; col++) {
      (function(pos) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.pos = pos;
        btn.title = pos;
        var sel = pos === _galEditPos;
        btn.style.cssText = 'width:30px;height:30px;border-radius:5px;border:2px solid ' + (sel ? '#c9a96e' : '#e8c4bc') + ';background:' + (sel ? '#fdf2e0' : '#fff') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;';
        var dot = document.createElement('div');
        dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + (sel ? '#c9a96e' : '#cbb89a') + ';pointer-events:none;';
        btn.appendChild(dot);
        btn.onclick = function() {
          _galEditPos = pos;
          document.getElementById('gal-pos-preview-img').style.objectPosition = pos;
          grid.querySelectorAll('button').forEach(function(b) {
            var active = b.dataset.pos === pos;
            b.style.border = '2px solid ' + (active ? '#c9a96e' : '#e8c4bc');
            b.style.background = active ? '#fdf2e0' : '#fff';
            b.querySelector('div').style.background = active ? '#c9a96e' : '#cbb89a';
          });
        };
        grid.appendChild(btn);
      })(_galPosOptions[row][col]);
    }
  }
}

var _galEditFilename = null;

function openGalEditModal(filename, idx, ev) {
  ev.stopPropagation();
  _galEditFilename = filename;
  var p = _galleryPhotos[idx];
  document.getElementById('gal-edit-title').value = p ? p.title : '';
  document.getElementById('gal-edit-desc').value = p ? (p.desc || '') : '';
  var catSel = document.getElementById('gal-edit-cat');
  catSel.value = p ? (p.category || 'glam') : 'glam';
  document.getElementById('gal-edit-status').textContent = '';
  initPosGrid(filename, p ? (p.objectPosition || 'center center') : 'center center');
  var overlay = document.getElementById('gal-edit-overlay');
  overlay.style.display = 'flex';
  document.getElementById('gal-edit-title').focus();
}

function closeGalEditModal() {
  document.getElementById('gal-edit-overlay').style.display = 'none';
  _galEditFilename = null;
}

async function saveGalEdit() {
  var status = document.getElementById('gal-edit-status');
  var title = document.getElementById('gal-edit-title').value.trim();
  var category = document.getElementById('gal-edit-cat').value;
  var desc = document.getElementById('gal-edit-desc').value.trim();
  if (!title) { status.textContent = '⚠️ Title required'; status.style.color = '#c0392b'; return; }
  status.textContent = 'Saving…'; status.style.color = '#9e7c4a';
  try {
    var res = await fetch(API + '/admin/gallery/' + encodeURIComponent(_galEditFilename) + '/meta?token=' + encodeURIComponent(TOKEN), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title, category: category, desc: desc, objectPosition: _galEditPos })
    });
    var data = await res.json();
    if (data.ok) {
      var idx = _galleryPhotos.findIndex(function(p) { return p.filename === _galEditFilename; });
      if (idx !== -1) { _galleryPhotos[idx].title = title; _galleryPhotos[idx].category = category; _galleryPhotos[idx].desc = desc; _galleryPhotos[idx].objectPosition = _galEditPos; }
      closeGalEditModal();
      renderGallery();
    } else {
      status.textContent = '❌ ' + (data.error || 'Failed'); status.style.color = '#c0392b';
    }
  } catch(e) {
    status.textContent = '❌ Failed'; status.style.color = '#c0392b';
  }
}

async function loadGallery() {
  var grid = document.getElementById('gal-grid');
  try {
    var res = await fetch(API + '/gallery/list');
    _galleryPhotos = await res.json();
    renderGallery();
  } catch(e) {
    grid.innerHTML = '<div style="color:#c0392b;font-size:0.85rem;padding:20px 0;">Failed to load gallery.</div>';
  }
}

async function uploadGalleryPhoto() {
  const file = document.getElementById('gal-file').files[0];
  const title = document.getElementById('gal-title').value.trim();
  const category = document.getElementById('gal-cat').value;
  const desc = document.getElementById('gal-desc').value.trim();
  const status = document.getElementById('gal-upload-status');
  if (!file) { status.textContent = '⚠️ Please select a photo'; status.style.color='#c0392b'; return; }
  if (!title) { status.textContent = '⚠️ Please add a title'; status.style.color='#c0392b'; return; }
  const btn = document.getElementById('gal-upload-btn');
  btn.disabled = true; btn.textContent = 'Uploading…';
  status.textContent = '';
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('title', title);
  formData.append('category', category);
  formData.append('desc', desc);
  try {
    const res = await fetch(API + '/admin/upload-gallery?token=' + encodeURIComponent(TOKEN), { method:'POST', body:formData });
    const data = await res.json();
    if (data.ok) {
      status.textContent = '✅ Uploaded!'; status.style.color='#2c6e3f';
      document.getElementById('gal-file').value='';
      document.getElementById('gal-title').value='';
      document.getElementById('gal-desc').value='';
      loadGallery();
    } else {
      status.textContent = '❌ ' + (data.error||'Upload failed'); status.style.color='#c0392b';
    }
  } catch(e) {
    status.textContent = '❌ Upload failed'; status.style.color='#c0392b';
  } finally {
    btn.disabled=false; btn.textContent='Upload Photo ✦';
  }
}

async function deleteGalleryPhoto(filename) {
  if (!confirm('Delete this photo from the gallery?')) return;
  const res = await fetch(API + '/admin/gallery/' + encodeURIComponent(filename) + '?token=' + encodeURIComponent(TOKEN), { method:'DELETE' });
  const data = await res.json();
  if (data.ok) loadGallery();
  else alert('Delete failed: ' + (data.error||'Unknown error'));
}

loadGallery();

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

<!-- Message Modal -->
<div id="msg-modal-overlay" onclick="if(event.target===this)closeMessageModal()" style="display:none;position:fixed;inset:0;background:rgba(44,24,16,0.45);z-index:1000;align-items:center;justify-content:center;padding:20px;">
  <div style="background:#fdf8f4;border:1px solid #e8c4bc;border-radius:12px;width:100%;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,0.18);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:18px 24px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h3 style="margin:0;color:#fff;font-family:Georgia,serif;font-size:1.05rem;">💬 Message for client</h3>
        <p id="modal-client-name" style="margin:3px 0 0;color:rgba(255,255,255,0.85);font-size:0.82rem;"></p>
      </div>
      <button onclick="closeMessageModal()" style="background:none;border:none;color:#fff;font-size:1.3rem;cursor:pointer;padding:4px 8px;line-height:1;">✕</button>
    </div>
    <div style="padding:20px 24px;">
      <p style="font-size:0.85rem;color:#6b3d2e;margin:0 0 12px;">This message will appear in the client's 9AM reminder email on the day of their appointment.</p>
      <textarea id="modal-textarea" placeholder="e.g. Please arrive with a clean face, no eye makeup. Park on the street. See you soon! 🌸" style="width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;outline:none;resize:vertical;min-height:120px;box-sizing:border-box;" onfocus="this.style.borderColor='#c9a96e'" onblur="this.style.borderColor='#e0c8c0'"></textarea>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;gap:10px;flex-wrap:wrap;">
        <span id="modal-save-status" style="font-size:0.82rem;"></span>
        <div style="display:flex;gap:8px;">
          <button onclick="closeMessageModal()" style="background:none;border:1.5px solid #c9a96e;color:#9e7c4a;padding:8px 18px;border-radius:6px;font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit;">Cancel</button>
          <button id="modal-save-btn" onclick="saveClientMessage()" style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);border:none;color:#fff;padding:8px 20px;border-radius:6px;font-size:0.88rem;font-weight:700;cursor:pointer;font-family:Georgia,serif;">Save Message</button>
        </div>
      </div>
    </div>
  </div>
</div>
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

// ── POST /api/admin/save-client-message ─────────────────────────
router.post("/admin/save-client-message", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }

  const { bookingId, message } = req.body as { bookingId?: number; message?: string };
  if (bookingId == null) { res.status(400).json({ error: "Missing bookingId" }); return; }

  try {
    await db.update(bookings)
      .set({ clientMessage: message ?? null })
      .where(eq(bookings.id, bookingId));
    res.json({ ok: true });
  } catch (e) {
    console.error("Admin save-client-message error:", e);
    res.status(500).json({ error: "Failed to save message." });
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

// ── GET /api/gallery/list — public, used by frontend ────────────
router.get("/gallery/list", (_req, res) => {
  const meta = readGalleryMeta();
  meta.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  res.json(meta);
});

// ── PUT /api/admin/gallery/:filename/featured — toggle ───────────
router.put("/admin/gallery/:filename/featured", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }

  const { filename } = req.params;
  if (!filename || filename.includes("/") || filename.includes("..")) {
    res.status(400).json({ error: "Invalid filename" }); return;
  }

  const meta = readGalleryMeta();
  const idx = meta.findIndex((m) => m.filename === filename);
  if (idx === -1) { res.status(404).json({ error: "Photo not found" }); return; }

  meta[idx].featured = !meta[idx].featured;
  writeGalleryMeta(meta);
  res.json({ ok: true, featured: meta[idx].featured });
});

// ── POST /api/admin/upload-gallery ───────────────────────────────
router.post(
  "/admin/upload-gallery",
  async (req, res, next) => {
    const token = req.query.token as string;
    const valid = await validateToken(token).catch(() => false);
    if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }
    next();
  },
  uploadMiddleware.single("photo"),
  (req, res) => {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const { title = "Untitled", category = "glam", desc = "" } = req.body as Record<string, string>;
    const meta = readGalleryMeta();
    meta.unshift({ filename: req.file.filename, title, category, desc, uploadedAt: new Date().toISOString() });
    writeGalleryMeta(meta);
    res.json({ ok: true, filename: req.file.filename });
  }
);

// ── PUT /api/admin/gallery/:filename/meta ────────────────────────
router.put("/admin/gallery/:filename/meta", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }

  const { filename } = req.params;
  if (!filename || filename.includes("/") || filename.includes("..")) {
    res.status(400).json({ error: "Invalid filename" }); return;
  }

  const { title, category, desc, objectPosition } = req.body as { title?: string; category?: string; desc?: string; objectPosition?: string };
  if (!title) { res.status(400).json({ error: "Title is required" }); return; }

  const meta = readGalleryMeta();
  const idx = meta.findIndex((m) => m.filename === filename);
  if (idx === -1) { res.status(404).json({ error: "Photo not found" }); return; }

  meta[idx].title = title;
  meta[idx].category = category || meta[idx].category;
  meta[idx].desc = desc ?? "";
  if (objectPosition !== undefined) meta[idx].objectPosition = objectPosition;
  writeGalleryMeta(meta);
  res.json({ ok: true });
});

// ── PUT /api/admin/gallery/reorder ───────────────────────────────
router.put("/admin/gallery/reorder", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }

  const { filenames } = req.body as { filenames?: string[] };
  if (!Array.isArray(filenames)) { res.status(400).json({ error: "Invalid request" }); return; }

  const meta = readGalleryMeta();
  const reordered: GalleryMeta[] = [];
  filenames.forEach((fn) => {
    const item = meta.find((m) => m.filename === fn);
    if (item) reordered.push(item);
  });
  meta.forEach((m) => {
    if (!reordered.find((r) => r.filename === m.filename)) reordered.push(m);
  });
  writeGalleryMeta(reordered);
  res.json({ ok: true });
});

// ── DELETE /api/admin/gallery/:filename ──────────────────────────
router.delete("/admin/gallery/:filename", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }

  const { filename } = req.params;
  if (!filename || filename.includes("/") || filename.includes("..")) {
    res.status(400).json({ error: "Invalid filename" }); return;
  }

  const filepath = path.join(GALLERY_DIR, filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

  const meta = readGalleryMeta().filter((p) => p.filename !== filename);
  writeGalleryMeta(meta);
  res.json({ ok: true });
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
