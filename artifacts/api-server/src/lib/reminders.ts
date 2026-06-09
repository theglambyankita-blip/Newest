import nodemailer from "nodemailer";
import { db, bookings } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger.js";

const SITE_URL = "https://www.theglambyankita.com";

// Track which booking IDs we've reminded today (reset on server restart — fine
// because we only send inside a 9-10 am window so restarts won't double-send)
const remindedToday = new Set<number>();
let lastRemindDate = "";

function getMelbourneDateParts(): { dateStr: string; hour: number } {
  const now = new Date();
  const melb = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => melb.find((p) => p.type === t)?.value ?? "";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = parseInt(get("hour"), 10);
  return { dateStr, hour };
}

function getTomorrowMelbourneDate(): string {
  const now = new Date();
  const melb = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => melb.find((p) => p.type === t)?.value ?? "";
  const y = parseInt(get("year"), 10);
  const m = parseInt(get("month"), 10) - 1;
  const d = parseInt(get("day"), 10);
  const tomorrow = new Date(y, m, d + 1);
  const ty = tomorrow.getFullYear();
  const tm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const td = String(tomorrow.getDate()).padStart(2, "0");
  return `${ty}-${tm}-${td}`;
}

async function sendReminders(): Promise<void> {
  const { dateStr, hour } = getMelbourneDateParts();

  // Only send in the 9am hour Melbourne time
  if (hour !== 9) return;

  // Reset tracker each new day
  if (lastRemindDate !== dateStr) {
    remindedToday.clear();
    lastRemindDate = dateStr;
  }

  const gmailUser = process.env["GMAIL_USER"];
  const gmailPass = process.env["GMAIL_APP_PASSWORD"];
  if (!gmailUser || !gmailPass) return;

  const tomorrow = getTomorrowMelbourneDate();

  let upcomingBookings: typeof bookings.$inferSelect[];
  try {
    upcomingBookings = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingDate, tomorrow),
          eq(bookings.status, "confirmed")
        )
      );
  } catch (e) {
    logger.error({ e }, "Reminder: DB query failed");
    return;
  }

  if (!upcomingBookings.length) return;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  for (const booking of upcomingBookings) {
    if (!booking.clientEmail || !booking.id) continue;
    if (remindedToday.has(booking.id)) continue;

    const clientName = booking.clientName || "there";
    const time     = booking.bookingTime  || "";
    const service  = booking.service      || "your appointment";
    const location = booking.location     || "";
    const people   = booking.numPeople    || "";

    const rowEntries: [string, string][] = [
      ["Date",    tomorrow],
      ...(time     ? [["Time",             time    ] as [string,string]] : []),
      ...(service  ? [["Service",          service ] as [string,string]] : []),
      ...(people   ? [["Number of People", people  ] as [string,string]] : []),
      ...(location ? [["Location",         location] as [string,string]] : []),
    ];
    const detailRows = rowEntries
      .map(([k, v]) => `<tr>
        <td style="padding:6px 14px;font-weight:600;color:#6b3d2e;background:#fdf0ee;white-space:nowrap;">${k}</td>
        <td style="padding:6px 14px;color:#2c1810;">${v}</td>
      </tr>`)
      .join("");

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
          <h2 style="margin:0;color:#fff;font-size:1.3rem;">💄 Reminder — Your appointment is tomorrow!</h2>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">The Glam by Ankita</p>
        </div>
        <div style="padding:28px 32px 16px;">
          <p style="font-size:1rem;color:#2c1810;margin:0 0 12px;">Hi ${clientName},</p>
          <p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 16px;">
            Just a friendly reminder that your appointment is <strong>tomorrow</strong>! I'm so excited to glam you up ✨
          </p>
          <p style="font-size:0.9rem;color:#6b3d2e;line-height:1.7;margin:0 0 4px;">Here are your booking details:</p>
        </div>
        ${detailRows ? `<table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-top:4px;">${detailRows}</table>` : ""}
        <div style="padding:20px 32px 16px;">
          <p style="font-size:0.88rem;color:#6b3d2e;line-height:1.7;margin:0;">
            💡 <strong>Quick tips:</strong> Please arrive/be ready with a clean, moisturised face and no eye makeup for the best results.
            If you have any questions or need to make changes, reply to this email or contact me directly.
          </p>
        </div>
        <div style="padding:18px 32px;background:#f7e9d0;border-top:1px solid #e8c4bc;">
          <p style="font-size:0.9rem;color:#6b3d2e;margin:0;">
            See you tomorrow! 🌸<br>
            <strong>Ankita</strong><br>
            The Glam by Ankita ✦<br>
            <a href="mailto:theglambyankita@gmail.com" style="color:#9e7c4a;font-size:0.85rem;">theglambyankita@gmail.com</a>
          </p>
        </div>
      </div>`;

    try {
      await transporter.sendMail({
        from:    `"The Glam by Ankita" <${gmailUser}>`,
        to:      booking.clientEmail,
        subject: `💄 Reminder — your appointment is tomorrow! | The Glam by Ankita`,
        html,
      });
      remindedToday.add(booking.id);
      logger.info({ bookingId: booking.id, clientEmail: booking.clientEmail }, "Reminder sent");
    } catch (e) {
      logger.error({ e, bookingId: booking.id }, "Reminder send failed");
    }
  }
}

export function startReminderScheduler(): void {
  // Check every hour
  const INTERVAL_MS = 60 * 60 * 1000;
  logger.info("Appointment reminder scheduler started (checks hourly, sends at 9am Melbourne time)");
  // Run immediately on startup in case the server restarted during the 9am window
  sendReminders().catch((e) => logger.error({ e }, "Initial reminder check failed"));
  setInterval(() => {
    sendReminders().catch((e) => logger.error({ e }, "Reminder check failed"));
  }, INTERVAL_MS);
}
