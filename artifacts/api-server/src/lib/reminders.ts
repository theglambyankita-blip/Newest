import nodemailer from "nodemailer";
import { db, bookings } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger.js";

const remindedToday = new Set<number>();
let lastRemindDate = "";

function getMelbourneDateParts(): { dateStr: string; hour: number } {
  const now = new Date();
  const melb = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => melb.find((p) => p.type === t)?.value ?? "";
  return { dateStr: `${get("year")}-${get("month")}-${get("day")}`, hour: parseInt(get("hour"), 10) };
}

function getTomorrowMelbourneDate(): string {
  const now = new Date();
  const melb = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => melb.find((p) => p.type === t)?.value ?? "";
  const tomorrow = new Date(parseInt(get("year")), parseInt(get("month")) - 1, parseInt(get("day")) + 1);
  return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
}

async function sendReminders(): Promise<void> {
  const { dateStr, hour } = getMelbourneDateParts();
  if (hour !== 9) return;

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
          eq(bookings.status, "confirmed"),
          eq(bookings.reminderSent, "false")
        )
      );
  } catch (e) {
    logger.error({ e }, "Reminder: DB query failed");
    return;
  }

  if (!upcomingBookings.length) return;

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });

  for (const booking of upcomingBookings) {
    if (!booking.clientEmail || !booking.id) continue;
    if (remindedToday.has(booking.id)) continue;

    const clientName = booking.clientName || "there";
    const rowEntries: [string, string][] = [
      ["Date", tomorrow],
      ...(booking.bookingTime  ? [["Time",             booking.bookingTime ] as [string,string]] : []),
      ...(booking.service      ? [["Service",          booking.service     ] as [string,string]] : []),
      ...(booking.numPeople    ? [["Number of People", booking.numPeople   ] as [string,string]] : []),
      ...(booking.location     ? [["Location",         booking.location    ] as [string,string]] : []),
    ];
    const detailRows = rowEntries
      .map(([k, v]) => `<tr>
        <td style="padding:6px 14px;font-weight:600;color:#6b3d2e;background:#fdf0ee;white-space:nowrap;">${k}</td>
        <td style="padding:6px 14px;color:#2c1810;">${v}</td>
      </tr>`).join("");

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
        ${booking.sendReminder === "true" ? `
        <div style="padding:20px 32px 16px;background:#fff9f5;border-top:1px solid #f0ddd6;">
          <p style="font-size:0.88rem;color:#6b3d2e;line-height:1.7;margin:0;">
            💡 <strong>Quick tip:</strong> Please arrive/be ready with a clean, moisturised face and no eye makeup for the best results.
            If you have any questions, reply to this email or contact me directly.
          </p>
        </div>` : ""}
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
      await db.update(bookings).set({ reminderSent: "true" }).where(eq(bookings.id, booking.id));
      remindedToday.add(booking.id);
      logger.info({ bookingId: booking.id, clientEmail: booking.clientEmail }, "Reminder sent");
    } catch (e) {
      logger.error({ e, bookingId: booking.id }, "Reminder send failed");
    }
  }
}

export function startReminderScheduler(): void {
  logger.info("Appointment reminder scheduler started (checks hourly, sends at 9am Melbourne time, only for flagged bookings)");
  sendReminders().catch((e) => logger.error({ e }, "Initial reminder check failed"));
  setInterval(() => {
    sendReminders().catch((e) => logger.error({ e }, "Reminder check failed"));
  }, 60 * 60 * 1000);
}
