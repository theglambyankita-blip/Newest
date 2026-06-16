import { Router } from "express";
import nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { db, adminTokens, bookings, coupons } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env["CLOUDINARY_CLOUD_NAME"],
  api_key: process.env["CLOUDINARY_API_KEY"],
  api_secret: process.env["CLOUDINARY_API_SECRET"],
});

const router = Router();

const ADMIN_EMAIL = "nishankn.ankita@gmail.com";

// ── Gallery setup ─────────────────────────────────────────────────
// Use import.meta.url so the path resolves correctly regardless of cwd.
// At runtime, import.meta.url = file:///.../artifacts/api-server/dist/index.mjs
// so 3 levels up reaches the workspace root.
const _adminDir = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_DIR = path.join(_adminDir, "../../../artifacts/glam-by-ankita/public/gallery");
if (!fs.existsSync(GALLERY_DIR)) fs.mkdirSync(GALLERY_DIR, { recursive: true });

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function uploadToCloudinary(buffer: Buffer, folder: string): Promise<{ secure_url: string; public_id: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => {
        if (err || !result) return reject(err || new Error("Upload failed"));
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

interface GalleryMeta {
  filename: string;
  title: string;
  category: string;
  desc: string;
  uploadedAt: string;
  featured?: boolean;
  objectPosition?: string;
  url?: string;
  cloudinaryPublicId?: string;
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
  // Accept the hardcoded env-var token as a permanent bypass (no DB needed)
  const envToken = process.env["ADMIN_TOKEN"];
  if (envToken && token === envToken) return true;
  // Fall back to DB lookup
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(adminTokens)
      .where(eq(adminTokens.token, token))
      .limit(1);
    return rows.length > 0 && rows[0].expiresAt > now;
  } catch {
    return false;
  }
}

// ── GET /api/admin-token — returns current valid token for the admin panel redirect ──
router.get("/admin-token", async (req, res) => {
  try {
    const token = await getOrCreateToken();
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: "Could not retrieve admin token." });
  }
});

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

  const cloudName = process.env["CLOUDINARY_CLOUD_NAME"] || "";

  const posArrows: Record<string, string> = {
    'top left':'↖','top center':'↑','top right':'↗',
    'center left':'←','center center':'·','center right':'→',
    'bottom left':'↙','bottom center':'↓','bottom right':'↘'
  };
  const posBtnsUpload = ['top left','top center','top right','center left','center center','center right','bottom left','bottom center','bottom right']
    .map(p => `<button onclick="galApplyUploadPos('${p}')" style="padding:5px 2px;font-size:0.75rem;border:1px solid #e0c8c0;border-radius:4px;background:#fff;color:#6b3d2e;cursor:pointer;font-family:inherit;">${posArrows[p]}</button>`).join('');
  const posBtnsEdit = ['top left','top center','top right','center left','center center','center right','bottom left','bottom center','bottom right']
    .map(p => `<button onclick="galEditApplyPos('${p}')" style="padding:5px 2px;font-size:0.75rem;border:1px solid #e0c8c0;border-radius:4px;background:#fff;color:#6b3d2e;cursor:pointer;font-family:inherit;">${posArrows[p]}</button>`).join('');

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
.logo-text{font-size:1rem;color:#6b3d2e;font-style:italic;}
.header{background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:28px 32px;color:#fff;}
.header h1{font-size:1.5rem;margin-bottom:4px;}
.stats{display:flex;gap:16px;flex-wrap:wrap;margin-top:20px;}
.stat{background:rgba(255,255,255,0.18);border-radius:8px;padding:12px 20px;text-align:center;min-width:100px;border:2px solid transparent;text-decoration:none;color:inherit;display:block;}
.stat.active{background:rgba(255,255,255,0.35);border-color:rgba(255,255,255,0.55);}
.stat-val{font-size:1.6rem;font-weight:700;}
.stat-lbl{font-size:0.75rem;opacity:0.88;margin-top:2px;}
.content{max-width:1100px;margin:0 auto;padding:28px 20px 60px;}
.section{margin-bottom:32px;}
.section-title{font-size:1rem;color:#6b3d2e;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #e8c4bc;}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;}
.tab-btn{padding:7px 14px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.85rem;font-weight:600;color:#6b3d2e;background:#fff;cursor:pointer;text-decoration:none;display:inline-block;font-family:inherit;}
.tab-btn.tab-active{background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border-color:transparent;}
.search-input{padding:8px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.88rem;color:#2c1810;background:#fff;outline:none;flex:1;min-width:200px;font-family:inherit;}
.search-input:focus{border-color:#c9a96e;}
.card{background:#fff;border:1px solid #e8c4bc;border-radius:10px;overflow:hidden;}
.table-wrap{overflow-x:auto;}
table{width:100%;border-collapse:collapse;font-size:0.88rem;}
th{padding:10px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.05em;background:#fdf5f0;border-bottom:1px solid #e8c4bc;white-space:nowrap;}
.brow:hover td{background:#fdf5f0;}
.brow{cursor:pointer;}
.email-form{padding:24px;}
.field{margin-bottom:16px;}
label{display:block;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;}
input[type=text],input[type=email],input[type=number],input[type=file],textarea,select{width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;outline:none;transition:border-color .2s;}
input:focus,textarea:focus,select:focus{border-color:#c9a96e;}
textarea{resize:vertical;min-height:140px;}
.btn{display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;cursor:pointer;font-family:inherit;}
.btn:disabled{opacity:0.5;cursor:not-allowed;}
#no-results{display:none;padding:18px;color:#aaa;text-align:center;font-size:0.9rem;}
</style>
</head>
<body>
<div class="topbar">
  <span class="logo-text">The Glam by Ankita</span>
  <span style="background:#fdf0ee;color:#6b3d2e;font-size:0.75rem;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid #e8c4bc;">Admin Dashboard</span>
</div>
<div class="header">
  <h1>&#10022; Admin Dashboard</h1>
  <p>Manage bookings, gallery and promo codes.</p>
  <div class="stats">
    <a class="stat ${view==='all'?'active':''}" href="${viewUrl('all')}"><div class="stat-val">${allBookings.length}</div><div class="stat-lbl">Total Bookings</div></a>
    <a class="stat ${view==='upcoming'?'active':''}" href="${viewUrl('upcoming')}"><div class="stat-val">${upcoming.length}</div><div class="stat-lbl">Upcoming</div></a>
    <a class="stat ${view==='card'?'active':''}" href="${viewUrl('card')}"><div class="stat-val">A$${totalRevenue.toFixed(2)}</div><div class="stat-lbl">Total Revenue</div></a>
    <a class="stat"><div class="stat-val">A$${thisMonthRevenue.toFixed(2)}</div><div class="stat-lbl">This Month</div></a>
  </div>
</div>
<div class="content">
  <div class="section">
    <div class="section-title">ð ${viewLabels[view] || 'All Bookings'} (${displayedBookings.length})</div>
    <div class="toolbar">
      <input class="search-input" id="search-input" type="text" placeholder="Search name, email, service..." oninput="filterTable()">
      <a class="tab-btn ${view==='all'?'tab-active':''}" href="${viewUrl('all')}">All (${allBookings.length})</a>
      <a class="tab-btn ${view==='upcoming'?'tab-active':''}" href="${viewUrl('upcoming')}">Upcoming (${upcoming.length})</a>
      <a class="tab-btn ${view==='past'?'tab-active':''}" href="${viewUrl('past')}">Past (${past.length})</a>
      <a class="tab-btn ${view==='card'?'tab-active':''}" href="${viewUrl('card')}">Card payments</a>
      <button class="tab-btn" style="border-color:#c9a96e;color:#9e7c4a;" onclick="exportCSV()">CSV</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table id="bookings-table">
          <thead><tr><th>Client</th><th>Email</th><th>Service</th><th>Date &amp; Time</th><th>Amount</th><th>Payment</th></tr></thead>
          <tbody id="bookings-tbody">${allBookingRows}</tbody>
        </table>
        <div id="no-results">No bookings match your search.</div>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">&#9993; Send Email to Client</div>
    <div class="card"><div class="email-form">
      <div id="email-success" style="display:none;background:#f0fff4;border:1px solid #a8e6b8;color:#2c6e3f;padding:12px 16px;border-radius:6px;margin-bottom:16px;font-size:0.88rem;"></div>
      <div id="email-error" style="display:none;background:#fff0f0;border:1px solid #f5c0c0;color:#c0392b;padding:12px 16px;border-radius:6px;margin-bottom:16px;font-size:0.88rem;"></div>
      <div class="field"><label>Client Email</label><input type="email" id="e-to" placeholder="client@example.com"></div>
      <div class="field"><label>Subject</label><input type="text" id="e-subject" placeholder="e.g. Your upcoming appointment"></div>
      <div class="field"><label>Message</label><textarea id="e-body" placeholder="Hi [Name],&#10;&#10;Write your message here..."></textarea></div>
      <button class="btn" onclick="sendEmail()">Send Email &#10022;</button>
    </div></div>
  </div>
  <div class="section">
    <div class="section-title">&#128444; Gallery Photos</div>
    <div class="card" style="padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:0.93rem;color:#2c1810;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #f0ddd8;">Upload New Photo</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div>
          <div class="field"><label>Photo</label><input type="file" id="gal-file" accept="image/*" onchange="galPreviewFile(event)" style="padding:8px;"></div>
          <div id="gal-preview-wrap" style="display:none;margin-bottom:10px;">
            <div style="font-size:0.72rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">Click image to set focus point</div>
            <div id="gal-preview-box" style="position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;border-radius:6px;cursor:crosshair;border:1.5px solid #e8c4bc;background:#f5e8e0;" onclick="galSetPos(event,this,'gal-preview-img','gal-focus-dot','gal-pos-val',true)">
              <img id="gal-preview-img" style="width:100%;height:100%;object-fit:cover;object-position:center center;pointer-events:none;" alt="Preview">
              <div id="gal-focus-dot" style="position:absolute;width:14px;height:14px;background:rgba(201,169,110,0.9);border:2.5px solid #fff;border-radius:50%;transform:translate(-50%,-50%);left:50%;top:50%;pointer-events:none;box-shadow:0 0 0 3px rgba(0,0,0,0.2);"></div>
            </div>
            <div id="gal-pos-val" style="font-size:0.76rem;color:#9e7c4a;margin-top:5px;text-align:center;">Focus: center center</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:6px;">${posBtnsUpload}</div>
          </div>
          <div class="field"><label>Title</label><input type="text" id="gal-title" placeholder="e.g. Bridal Glam"></div>
        </div>
        <div>
          <div class="field"><label>Category</label><select id="gal-category" style="width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;"><option value="glam">Glam</option><option value="bridal">Bridal</option><option value="editorial">Editorial</option><option value="festival">Festival</option><option value="creative">Creative</option><option value="collab">Collab</option></select></div>
          <div class="field"><label>Description</label><textarea id="gal-desc" rows="3" placeholder="Short description..." style="min-height:75px;"></textarea></div>
          <button class="btn" id="gal-upload-btn" onclick="galUpload()">Upload Photo &#10022;</button>
          <div id="gal-upload-status" style="margin-top:10px;font-size:0.84rem;"></div>
        </div>
      </div>
    </div>
    <div class="card" style="padding:20px 24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #f0ddd8;">
        <h3 style="font-size:0.93rem;color:#2c1810;margin:0;">All Photos</h3>
        <span style="font-size:0.76rem;color:#9a7060;">Click a photo to edit</span>
      </div>
      <div id="gal-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;"></div>
      <div id="gal-empty" style="color:#9e7c4a;font-size:0.85rem;padding:20px 0;display:none;">No photos yet. Upload your first photo above!</div>
    </div>
  </div>
  <div id="gal-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;align-items:center;justify-content:center;padding:16px;">
    <div style="background:#fff;border-radius:12px;max-width:640px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.22);">
      <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:18px 24px;border-radius:12px 12px 0 0;"><h3 style="color:#fff;margin:0;font-size:1.05rem;">&#9999; Edit Photo</h3></div>
      <div style="padding:20px 24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:16px;">
          <div>
            <div style="font-size:0.72rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">Click to recenter image</div>
            <div id="gal-edit-pbox" style="position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;border-radius:6px;cursor:crosshair;border:1.5px solid #e8c4bc;background:#f5e8e0;" onclick="galSetPos(event,this,'gal-edit-img','gal-edit-dot','gal-edit-pos-val',false)">
              <img id="gal-edit-img" style="width:100%;height:100%;object-fit:cover;object-position:center center;pointer-events:none;" alt="">
              <div id="gal-edit-dot" style="position:absolute;width:14px;height:14px;background:rgba(201,169,110,0.9);border:2.5px solid #fff;border-radius:50%;transform:translate(-50%,-50%);left:50%;top:50%;pointer-events:none;box-shadow:0 0 0 3px rgba(0,0,0,0.2);"></div>
            </div>
            <div id="gal-edit-pos-val" style="font-size:0.76rem;color:#9e7c4a;margin-top:5px;text-align:center;">Focus: center center</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:6px;">${posBtnsEdit}</div>
          </div>
          <div>
            <div class="field"><label>Title</label><input type="text" id="gal-edit-title"></div>
            <div class="field"><label>Category</label><select id="gal-edit-cat" style="width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;"><option value="glam">Glam</option><option value="bridal">Bridal</option><option value="editorial">Editorial</option><option value="festival">Festival</option><option value="creative">Creative</option><option value="collab">Collab</option></select></div>
            <div class="field"><label>Description</label><textarea id="gal-edit-desc" rows="3" style="min-height:70px;"></textarea></div>
          </div>
        </div>
        <div id="gal-edit-err" style="background:#fff0f0;border:1px solid #f5c0c0;color:#c62828;padding:10px 14px;border-radius:4px;font-size:0.85rem;margin-bottom:12px;display:none;"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn" style="flex:1;min-width:110px;" id="gal-save-btn" onclick="galEditSave()">Save &#10022;</button>
          <button id="gal-feat-btn" onclick="galToggleFeatured()" style="flex:1;min-width:110px;padding:13px 16px;border:1.5px solid #c9a96e;border-radius:8px;background:#fff;color:#9e7c4a;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:inherit;">&#11088; Feature</button>
          <button onclick="galDelete()" style="padding:13px 16px;border:1.5px solid #f5c0c0;border-radius:8px;background:#fff;color:#c0392b;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:inherit;">&#128465; Delete</button>
          <button onclick="galCloseModal()" style="padding:13px 16px;border:1.5px solid #e0c8c0;border-radius:8px;background:#fff;color:#6b3d2e;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:inherit;">Cancel</button>
        </div>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">&#127991; Promo Codes</div>
    <div class="card" style="padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:0.93rem;color:#2c1810;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #f0ddd8;">Add New Promo Code</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;align-items:end;flex-wrap:wrap;">
        <div class="field" style="margin:0;"><label>Code</label><input type="text" id="cp-code" placeholder="e.g. SAVE20" style="text-transform:uppercase;"></div>
        <div class="field" style="margin:0;"><label>Type</label><select id="cp-type" style="width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;"><option value="percent">Percent (%)</option><option value="fixed">Fixed (A$)</option></select></div>
        <div class="field" style="margin:0;"><label>Value</label><input type="number" id="cp-value" placeholder="e.g. 20" min="0" step="0.01"></div>
        <div class="field" style="margin:0;"><label>Description</label><input type="text" id="cp-desc" placeholder="e.g. 20% off for crew"></div>
      </div>
      <div style="margin-top:12px;display:flex;align-items:center;gap:12px;">
        <button class="btn" onclick="cpAdd()" id="cp-add-btn" style="padding:10px 22px;font-size:0.88rem;">Add Code &#10022;</button>
        <span id="cp-add-status" style="font-size:0.83rem;"></span>
      </div>
    </div>
    <div class="card" style="padding:20px 24px;">
      <h3 style="font-size:0.93rem;color:#2c1810;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #f0ddd8;">All Promo Codes</h3>
      <div id="cp-list"><p style="color:#9e7c4a;font-size:0.85rem;">Loading...</p></div>
    </div>
  </div>
  <div id="cp-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;padding:16px;">
    <div style="background:#fff;border-radius:12px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
      <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:18px 24px;border-radius:12px 12px 0 0;"><h3 style="color:#fff;margin:0;font-size:1.05rem;">&#9999; Edit Promo Code</h3></div>
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
          <button class="btn" style="flex:1;" onclick="cpEditSave()">Save &#10022;</button>
          <button onclick="cpEditDelete()" style="padding:13px 16px;border:1.5px solid #f5c0c0;border-radius:8px;background:#fff;color:#c0392b;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:inherit;">&#128465; Delete</button>
          <button onclick="cpCloseModal()" style="padding:13px 16px;border:1.5px solid #e0c8c0;border-radius:8px;background:#fff;color:#6b3d2e;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:inherit;">Cancel</button>
        </div>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">&#128279; Admin Link</div>
    <div class="card" style="padding:20px 24px;">
      <p style="font-size:0.88rem;color:#4a2e22;margin-bottom:14px;">Regenerate your admin link (a new one will be emailed to you and this link will stop working).</p>
      <button class="btn" style="padding:9px 20px;font-size:0.85rem;" id="regen-btn" onclick="regenToken()">Regenerate Admin Link</button>
      <span id="regen-status" style="margin-left:12px;font-size:0.83rem;color:#9e7c4a;"></span>
    </div>
  </div>
</div>
<div id="message-modal" style="display:none;position:fixed;inset:0;background:rgba(44,24,16,0.55);z-index:9999;align-items:center;justify-content:center;padding:20px;">
  <div style="background:#fff;border-radius:12px;max-width:500px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
    <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:16px 22px;border-radius:12px 12px 0 0;"><h3 style="color:#fff;margin:0;font-size:1rem;" id="modal-title">Client Message</h3></div>
    <div style="padding:20px 22px;">
      <textarea id="modal-textarea" placeholder="e.g. Please arrive with a clean face. Park on the street." style="width:100%;padding:10px 13px;border:1.5px solid #e0c8c0;border-radius:6px;font-size:0.92rem;color:#2c1810;background:#fff;font-family:inherit;outline:none;resize:vertical;min-height:120px;box-sizing:border-box;"></textarea>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;gap:10px;flex-wrap:wrap;">
        <span id="modal-save-status" style="font-size:0.82rem;"></span>
        <div style="display:flex;gap:8px;">
          <button onclick="closeMessageModal()" style="background:none;border:1.5px solid #c9a96e;color:#9e7c4a;padding:8px 18px;border-radius:6px;font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit;">Cancel</button>
          <button id="modal-save-btn" onclick="saveClientMessage()" style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);border:none;color:#fff;padding:8px 20px;border-radius:6px;font-size:0.88rem;font-weight:700;cursor:pointer;font-family:inherit;">Save Message</button>
        </div>
      </div>
    </div>
  </div>
</div>
<script>
var TOKEN=${JSON.stringify(token)};
var CLOUD_NAME=${JSON.stringify(cloudName)};
var _galPhotos=[];
var _galEditFilename='';
var _galEditPos='center center';
var _galUploadPos='center center';
var _cpCoupons=[];
var _modalBookingId=null;
var _modalBookingIdx=null;
function toggleDetails(idx){var d=document.getElementById('detail-'+idx);if(d)d.style.display=d.style.display==='none'?'table-row':'none';}
function filterTable(){
  var q=document.getElementById('search-input').value.toLowerCase();
  var rows=document.querySelectorAll('#bookings-tbody .brow');
  var details=document.querySelectorAll('.brow-detail');
  var shown=0;
  rows.forEach(function(r,i){var txt=r.textContent.toLowerCase();var show=!q||txt.indexOf(q)>=0;r.style.display=show?'':'none';if(details[i])details[i].style.display='none';if(show)shown++;});
  document.getElementById('no-results').style.display=shown===0&&q?'block':'none';
}
function prefillEmail(email){document.getElementById('e-to').value=email;document.getElementById('e-to').scrollIntoView({behavior:'smooth'});}
function exportCSV(){
  var rows=document.querySelectorAll('#bookings-table tr');
  var lines=[];
  rows.forEach(function(r){lines.push(Array.from(r.querySelectorAll('th,td')).map(function(c){return '"'+c.textContent.trim().replace(/"/g,'""')+'"';}).join(','));});
  var csv=lines.join(String.fromCharCode(10));
  var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='bookings.csv';a.click();
}
function openMessageModal(id,idx,e){
  if(e)e.stopPropagation();
  _modalBookingId=id;_modalBookingIdx=idx;
  var preview=document.getElementById('msg-preview-'+idx);
  document.getElementById('modal-textarea').value=preview&&preview.style.display!=='none'?preview.textContent:'';
  document.getElementById('modal-save-status').textContent='';
  document.getElementById('message-modal').style.display='flex';
}
function closeMessageModal(){document.getElementById('message-modal').style.display='none';}
async function saveClientMessage(){
  var btn=document.getElementById('modal-save-btn');
  var status=document.getElementById('modal-save-status');
  var msg=document.getElementById('modal-textarea').value.trim();
  btn.disabled=true;btn.textContent='Saving...';status.textContent='';
  try{
    var r=await fetch('/api/admin/save-client-message?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId:_modalBookingId,message:msg})});
    var j=await r.json();if(!r.ok)throw new Error(j.error||'Failed');
    status.textContent='Saved!';status.style.color='#2c6e3f';
    var preview=document.getElementById('msg-preview-'+_modalBookingIdx);
    if(preview){preview.textContent=msg;preview.style.display=msg?'block':'none';}
    setTimeout(function(){closeMessageModal();},800);
  }catch(e){status.textContent='Error: '+e.message;status.style.color='#c0392b';}
  btn.disabled=false;btn.textContent='Save Message';
}
async function sendEmail(){
  var to=document.getElementById('e-to').value.trim();
  var subject=document.getElementById('e-subject').value.trim();
  var body=document.getElementById('e-body').value.trim();
  var succ=document.getElementById('email-success');var err=document.getElementById('email-error');
  succ.style.display='none';err.style.display='none';
  if(!to||!subject||!body){err.textContent='Please fill in all fields.';err.style.display='block';return;}
  try{
    var r=await fetch('/api/admin-send-email?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to,subject,body})});
    var j=await r.json();if(!r.ok)throw new Error(j.error||'Failed');
    succ.textContent='Email sent to '+to+'!';succ.style.display='block';
    document.getElementById('e-to').value='';document.getElementById('e-subject').value='';document.getElementById('e-body').value='';
  }catch(e){err.textContent='Could not send email. Please try again.';err.style.display='block';}
}
async function regenToken(){
  var btn=document.getElementById('regen-btn'),status=document.getElementById('regen-status');
  btn.disabled=true;status.textContent='Regenerating...';
  try{
    var r=await fetch('/api/admin?token='+encodeURIComponent(TOKEN),{method:'POST'});
    var j=await r.json();if(!r.ok)throw new Error(j.error||'Failed');
    status.textContent='New link sent to your email!';btn.style.display='none';
  }catch(e){status.textContent='Failed. Try again.';btn.disabled=false;}
}
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
  var parts=pos.split(' ');
  var py=parts[0]||'center';var px=parts[1]||'center';
  var xMap={left:'0%',center:'50%',right:'100%'};
  var yMap={top:'0%',center:'50%',bottom:'100%'};
  document.getElementById(dotId).style.left=xMap[px]||'50%';
  document.getElementById(dotId).style.top=yMap[py]||'50%';
  document.getElementById(valId).textContent='Focus: '+pos;
  if(isUpload){_galUploadPos=pos;}else{_galEditPos=pos;}
}
function galApplyUploadPos(pos){galApplyPreset(pos,'gal-preview-img','gal-focus-dot','gal-pos-val',true);}
function galEditApplyPos(pos){galApplyPreset(pos,'gal-edit-img','gal-edit-dot','gal-edit-pos-val',false);}
function galPreviewFile(e){
  var file=e.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(ev){document.getElementById('gal-preview-img').src=ev.target.result;document.getElementById('gal-preview-wrap').style.display='block';};
  reader.readAsDataURL(file);
  _galUploadPos='center center';
  document.getElementById('gal-focus-dot').style.left='50%';
  document.getElementById('gal-focus-dot').style.top='50%';
  document.getElementById('gal-pos-val').textContent='Focus: center center';
}
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
  if(!_galPhotos||!_galPhotos.length){grid.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  grid.innerHTML=_galPhotos.map(function(p){
    var imgUrl=p.url||('/gallery/'+p.filename);
    var pos=p.objectPosition||p.object_position||'center center';
    var fn=p.filename.replace(/'/g,"\\'");
    return '<div draggable="true" ondragstart="galDragStart(event,\''+fn+'\')" ondragover="galDragOver(event)" ondrop="galDrop(event,\''+fn+'\')" style="position:relative;aspect-ratio:1;overflow:hidden;border-radius:8px;border:1.5px solid #e8c4bc;cursor:pointer;background:#f5e8e0;" onclick="galOpenEdit(\''+fn+'\')">'+
      (p.featured?'<div style="position:absolute;top:5px;left:5px;z-index:2;background:rgba(201,169,110,0.95);border-radius:4px;padding:2px 7px;font-size:0.66rem;color:#fff;font-weight:700;pointer-events:none;">Featured</div>':'')+
      '<img src="'+imgUrl+'" style="width:100%;height:100%;object-fit:cover;object-position:'+pos+';display:block;pointer-events:none;" alt="'+(p.title||'')+'">'+
      '<div style="position:absolute;bottom:0;left:0;right:0;padding:7px 8px;color:#fff;font-size:0.7rem;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.7);pointer-events:none;background:linear-gradient(transparent,rgba(0,0,0,0.55));">'+(p.title||'')+'</div>'+
      '</div>';
  }).join('');
}
var _galDragSrc='';
function galDragStart(e,fn){_galDragSrc=fn;e.dataTransfer.effectAllowed='move';}
function galDragOver(e){e.preventDefault();e.dataTransfer.dropEffect='move';}
async function galDrop(e,targetFn){
  e.preventDefault();if(_galDragSrc===targetFn)return;
  var si=_galPhotos.findIndex(function(p){return p.filename===_galDragSrc;});
  var ti=_galPhotos.findIndex(function(p){return p.filename===targetFn;});
  if(si===-1||ti===-1)return;
  var moved=_galPhotos.splice(si,1)[0];_galPhotos.splice(ti,0,moved);
  renderGallery();
  try{await fetch('/api/admin/gallery/reorder?token='+encodeURIComponent(TOKEN),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({filenames:_galPhotos.map(function(p){return p.filename;})})});}catch(e){console.error('Reorder failed',e);}
}
async function galUpload(){
  var fileInput=document.getElementById('gal-file');
  var file=fileInput.files[0];if(!file){alert('Please select a photo first.');return;}
  var title=document.getElementById('gal-title').value.trim();
  var category=document.getElementById('gal-category').value;
  var desc=document.getElementById('gal-desc').value.trim();
  var btn=document.getElementById('gal-upload-btn');
  var status=document.getElementById('gal-upload-status');
  btn.disabled=true;btn.textContent='Uploading...';status.textContent='Uploading...';
  try{
    var fd=new FormData();
    fd.append('photo',file);
    fd.append('title',title||file.name.replace(/\.[^.]+$/,''));
    fd.append('category',category);
    fd.append('desc',desc);
    fd.append('objectPosition',_galUploadPos);
    var sr=await fetch('/api/admin/upload-gallery?token='+encodeURIComponent(TOKEN),{method:'POST',body:fd});
    if(!sr.ok){var se=await sr.json().catch(function(){return{};});throw new Error(se.error||'Upload failed');}
    status.innerHTML='<span style="color:#2e7d32;">Photo uploaded successfully!</span>';
    fileInput.value='';
    document.getElementById('gal-preview-wrap').style.display='none';
    document.getElementById('gal-title').value='';
    document.getElementById('gal-desc').value='';
    _galUploadPos='center center';
    await loadGallery();
  }catch(e){status.innerHTML='<span style="color:#c0392b;">'+e.message+'</span>';}
  btn.disabled=false;btn.textContent='Upload Photo';
}
function galOpenEdit(filename){
  var p=_galPhotos.find(function(x){return x.filename===filename;});if(!p)return;
  _galEditFilename=filename;
  _galEditPos=p.objectPosition||p.object_position||'center center';
  var img=document.getElementById('gal-edit-img');
  img.src=p.url||('/gallery/'+p.filename);
  img.style.objectPosition=_galEditPos;
  document.getElementById('gal-edit-dot').style.left='50%';
  document.getElementById('gal-edit-dot').style.top='50%';
  document.getElementById('gal-edit-pos-val').textContent='Focus: '+_galEditPos;
  document.getElementById('gal-edit-title').value=p.title||'';
  document.getElementById('gal-edit-cat').value=p.category||'glam';
  document.getElementById('gal-edit-desc').value=p.desc||p.description||'';
  document.getElementById('gal-edit-err').style.display='none';
  document.getElementById('gal-feat-btn').textContent=p.featured?'Unfeature':'Feature';
  document.getElementById('gal-modal').style.display='flex';
}
function galCloseModal(){document.getElementById('gal-modal').style.display='none';}
async function galEditSave(){
  var btn=document.getElementById('gal-save-btn');var err=document.getElementById('gal-edit-err');
  var title=document.getElementById('gal-edit-title').value.trim();
  var category=document.getElementById('gal-edit-cat').value;
  var desc=document.getElementById('gal-edit-desc').value.trim();
  btn.disabled=true;btn.textContent='Saving...';err.style.display='none';
  try{
    var r=await fetch('/api/admin/gallery/'+encodeURIComponent(_galEditFilename)+'/meta?token='+encodeURIComponent(TOKEN),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,category,desc,objectPosition:_galEditPos})});
    if(!r.ok)throw new Error('Failed to save');
    galCloseModal();await loadGallery();
  }catch(e){err.textContent=e.message;err.style.display='block';}
  btn.disabled=false;btn.textContent='Save';
}
async function galToggleFeatured(){
  var r=await fetch('/api/admin/gallery/'+encodeURIComponent(_galEditFilename)+'/featured?token='+encodeURIComponent(TOKEN),{method:'PUT'});
  if(r.ok){galCloseModal();await loadGallery();}else alert('Failed to update featured status.');
}
async function galDelete(){
  if(!confirm('Delete this photo permanently?'))return;
  var r=await fetch('/api/admin/gallery/'+encodeURIComponent(_galEditFilename)+'?token='+encodeURIComponent(TOKEN),{method:'DELETE'});
  if(r.ok){galCloseModal();await loadGallery();}else alert('Delete failed. Please try again.');
}
async function loadCoupons(){
  try{
    var r=await fetch('/api/admin/coupons?token='+encodeURIComponent(TOKEN));
    _cpCoupons=await r.json();
    renderCoupons();
  }catch(e){document.getElementById('cp-list').innerHTML='<p style="color:#c0392b;font-size:0.85rem;">Failed to load coupons.</p>';}
}
function renderCoupons(){
  var el=document.getElementById('cp-list');
  if(!_cpCoupons||!_cpCoupons.length){el.innerHTML='<p style="color:#9e7c4a;font-size:0.85rem;">No promo codes yet.</p>';return;}
  el.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:0.88rem;"><thead><tr>'+
    '<th style="padding:8px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;background:#fdf5f0;border-bottom:1px solid #e8c4bc;">Code</th>'+
    '<th style="padding:8px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;background:#fdf5f0;border-bottom:1px solid #e8c4bc;">Discount</th>'+
    '<th style="padding:8px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;background:#fdf5f0;border-bottom:1px solid #e8c4bc;">Description</th>'+
    '<th style="padding:8px 12px;text-align:left;font-size:0.75rem;font-weight:700;color:#6b3d2e;text-transform:uppercase;background:#fdf5f0;border-bottom:1px solid #e8c4bc;">Status</th>'+
    '<th style="padding:8px 12px;background:#fdf5f0;border-bottom:1px solid #e8c4bc;"></th>'+
    '</tr></thead><tbody>'+
    _cpCoupons.map(function(c){
      var dt=c.discount_type||c.discountType||'percent';
      var dv=Number(c.discount_value||c.discountValue||0);
      var disc=dt==='fixed'?'A$'+dv.toFixed(2)+' off':dv+'% off';
      var isValid=c.valid!==undefined?c.valid:(c.active==='true');
      var badge=isValid?'<span style="background:#e8f4e8;color:#2c6e3f;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Active</span>':
                       '<span style="background:#f5e8e8;color:#c0392b;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">Inactive</span>';
      return '<tr style="border-bottom:1px solid #f0ddd6;">'+
        '<td style="padding:10px 12px;font-weight:700;font-family:monospace;font-size:0.9rem;">'+c.code+'</td>'+
        '<td style="padding:10px 12px;">'+disc+'</td>'+
        '<td style="padding:10px 12px;color:#6b3d2e;font-size:0.85rem;">'+(c.description||'&mdash;')+'</td>'+
        '<td style="padding:10px 12px;">'+badge+'</td>'+
        '<td style="padding:10px 12px;"><button onclick="cpOpenEdit('+c.id+')" style="padding:5px 12px;border:1.5px solid #c9a96e;border-radius:6px;background:#fff;color:#9e7c4a;font-weight:700;font-size:0.8rem;cursor:pointer;font-family:inherit;">Edit</button></td>'+
        '</tr>';
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
  btn.disabled=true;btn.textContent='Adding...';status.textContent='';
  try{
    var r=await fetch('/api/admin/coupons?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,discount_type:type,discount_value:parseFloat(value),description:desc})});
    var j=await r.json();if(!r.ok)throw new Error(j.error||'Failed');
    status.innerHTML='<span style="color:#2c6e3f;">Code added!</span>';
    document.getElementById('cp-code').value='';document.getElementById('cp-value').value='';document.getElementById('cp-desc').value='';
    await loadCoupons();
  }catch(e){status.innerHTML='<span style="color:#c0392b;">'+e.message+'</span>';}
  btn.disabled=false;btn.textContent='Add Code';
}
function cpOpenEdit(id){
  var c=_cpCoupons.find(function(x){return x.id===id;});if(!c)return;
  document.getElementById('cp-edit-id').value=c.id;
  document.getElementById('cp-edit-code').value=c.code;
  document.getElementById('cp-edit-type').value=c.discount_type||c.discountType||'percent';
  document.getElementById('cp-edit-value').value=Number(c.discount_value||c.discountValue||0);
  document.getElementById('cp-edit-desc').value=c.description||'';
  document.getElementById('cp-edit-valid').checked=c.valid!==undefined?c.valid:(c.active==='true');
  document.getElementById('cp-edit-err').style.display='none';
  document.getElementById('cp-modal').style.display='flex';
}
function cpCloseModal(){document.getElementById('cp-modal').style.display='none';}
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
    var j=await r.json();if(!r.ok)throw new Error(j.error||'Failed');
    cpCloseModal();await loadCoupons();
  }catch(e){err.textContent=e.message;err.style.display='block';}
}
async function cpEditDelete(){
  var id=document.getElementById('cp-edit-id').value;
  var code=document.getElementById('cp-edit-code').value;
  if(!confirm('Delete promo code '+code+'?'))return;
  try{
    var r=await fetch('/api/admin/coupons/'+id+'?token='+encodeURIComponent(TOKEN),{method:'DELETE'});
    if(r.ok){cpCloseModal();await loadCoupons();}else alert('Delete failed.');
  }catch(e){alert('Delete failed.');}
}
(function(){
  var galM=document.getElementById('gal-modal');
  var cpM=document.getElementById('cp-modal');
  var msgM=document.getElementById('message-modal');
  if(galM)galM.addEventListener('click',function(e){if(e.target===this)galCloseModal();});
  if(cpM)cpM.addEventListener('click',function(e){if(e.target===this)cpCloseModal();});
  if(msgM)msgM.addEventListener('click',function(e){if(e.target===this)closeMessageModal();});
})();
loadGallery();
loadCoupons();
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

// ── GET /api/gallery/image/:filename — serve local gallery images ─
router.get("/gallery/image/:filename", (req, res) => {
  const { filename } = req.params;
  if (!filename || filename.includes("/") || filename.includes("..")) {
    res.status(400).send("Invalid filename"); return;
  }
  const filepath = path.join(GALLERY_DIR, filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).send("Image not found"); return;
  }
  const ext = path.extname(filename).toLowerCase();
  const mimes: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
  };
  res.setHeader("Content-Type", mimes[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=86400");
  fs.createReadStream(filepath).pipe(res);
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
  async (req, res) => {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const { title = "Untitled", category = "glam", desc = "" } = req.body as Record<string, string>;
    try {
      const { secure_url, public_id } = await uploadToCloudinary(req.file.buffer, "glam-by-ankita/gallery");
      const filename = `gallery-${Date.now()}${path.extname(req.file.originalname).toLowerCase() || ".jpg"}`;
      const meta = readGalleryMeta();
      meta.unshift({
        filename,
        title,
        category,
        desc,
        uploadedAt: new Date().toISOString(),
        url: secure_url,
        cloudinaryPublicId: public_id,
      });
      writeGalleryMeta(meta);
      res.json({ ok: true, filename, url: secure_url });
    } catch (e) {
      console.error("Cloudinary upload error:", e);
      res.status(500).json({ error: "Upload to Cloudinary failed." });
    }
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

  const meta = readGalleryMeta();
  const item = meta.find((p) => p.filename === filename);

  if (item?.cloudinaryPublicId) {
    await cloudinary.uploader.destroy(item.cloudinaryPublicId).catch((e) =>
      console.error("Cloudinary delete error:", e)
    );
  } else {
    const filepath = path.join(GALLERY_DIR, filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }

  writeGalleryMeta(meta.filter((p) => p.filename !== filename));
  res.json({ ok: true });
});

// ── GET /api/validate-coupon — public ────────────────────────────
router.get("/validate-coupon", async (req, res) => {
  const code = ((req.query.code as string) || "").trim().toUpperCase();
  if (!code) { res.status(400).json({ valid: false, error: "No code provided" }); return; }
  try {
    const rows = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
    if (!rows.length) { res.json({ valid: false, error: "Invalid promo code" }); return; }
    const c = rows[0];
    if (c.active !== "true") { res.json({ valid: false, error: "This promo code is no longer active" }); return; }
    if (c.expiresAt && new Date() > c.expiresAt) { res.json({ valid: false, error: "This promo code has expired" }); return; }
    if (c.maxUses && Number(c.usesCount) >= Number(c.maxUses)) { res.json({ valid: false, error: "This promo code has reached its usage limit" }); return; }
    res.json({ valid: true, code: c.code, discountType: c.discountType, discountValue: Number(c.discountValue), description: c.description || "" });
  } catch { res.status(500).json({ valid: false, error: "Could not validate code" }); }
});

// ── GET /api/admin/coupons ────────────────────────────────────────
router.get("/admin/coupons", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }
  try {
    const all = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
    res.json(all.map(c => ({
      id: c.id, code: c.code,
      discount_type: c.discountType, discount_value: c.discountValue,
      description: c.description || "",
      valid: c.active === "true",
      created_at: c.createdAt,
    })));
  } catch { res.status(500).json({ error: "Could not fetch coupons" }); }
});

// ── POST /api/admin/coupons ───────────────────────────────────────
router.post("/admin/coupons", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }
  const _b = req.body as any;
  const code = _b.code;
  const discountType = _b.discountType || _b.discount_type;
  const discountValue = _b.discountValue ?? _b.discount_value;
  const description = _b.description;
  if (!code || !discountType || discountValue == null) { res.status(400).json({ error: "Code, type, and value are required" }); return; }
  try {
    const [inserted] = await db.insert(coupons).values({
      code: String(code).trim().toUpperCase(),
      discountType: String(discountType),
      discountValue: String(discountValue),
      description: description || "",
      usesCount: "0",
      active: "true",
    }).returning();
    res.json({ ok: true, coupon: inserted });
  } catch (e: any) {
    if (e.code === "23505") { res.status(409).json({ error: "A coupon with that code already exists" }); }
    else { res.status(500).json({ error: "Could not create coupon" }); }
  }
});

// ── DELETE /api/admin/coupons/:id ─────────────────────────────────
router.delete("/admin/coupons/:id", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    await db.delete(coupons).where(eq(coupons.id, id));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not delete coupon" }); }
});

// ── PUT /api/admin/coupons/:id — edit ────────────────────────────
router.put("/admin/coupons/:id", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const _b2 = req.body as any;
  const code = _b2.code;
  const discountType = _b2.discountType || _b2.discount_type;
  const discountValue = _b2.discountValue ?? _b2.discount_value;
  const description = _b2.description;
  if (!code || !discountType || discountValue == null) { res.status(400).json({ error: "Code, type, and value are required" }); return; }
  const updateSet: Record<string, any> = {
    code: String(code).trim().toUpperCase(),
    discountType: String(discountType),
    discountValue: String(discountValue),
    description: description || "",
  };
  if (_b2.valid !== undefined) updateSet.active = _b2.valid ? "true" : "false";
  try {
    const rows = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Coupon not found" }); return; }
    await db.update(coupons).set(updateSet).where(eq(coupons.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === "23505") { res.status(409).json({ error: "A coupon with that code already exists" }); }
    else { res.status(500).json({ error: "Could not update coupon" }); }
  }
});

// ── PUT /api/admin/coupons/:id/toggle ────────────────────────────
router.put("/admin/coupons/:id/toggle", async (req, res) => {
  const token = req.query.token as string;
  const valid = await validateToken(token).catch(() => false);
  if (!valid) { res.status(403).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const rows = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const newActive = rows[0].active === "true" ? "false" : "true";
    await db.update(coupons).set({ active: newActive }).where(eq(coupons.id, id));
    res.json({ ok: true, active: newActive });
  } catch { res.status(500).json({ error: "Could not toggle coupon" }); }
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
