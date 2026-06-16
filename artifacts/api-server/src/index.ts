import app from "./app";
import { logger } from "./lib/logger";
import { startReminderScheduler } from "./lib/reminders.js";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runMigrations() {
  try {
    await pool.query(`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS send_reminder TEXT DEFAULT 'false';
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent TEXT DEFAULT 'false';
      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        discount_type TEXT NOT NULL DEFAULT 'percent',
        discount_value NUMERIC NOT NULL,
        description TEXT DEFAULT '',
        expires_at TIMESTAMP,
        max_uses NUMERIC,
        uses_count NUMERIC NOT NULL DEFAULT 0,
        active TEXT NOT NULL DEFAULT 'true',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS active TEXT DEFAULT 'true';
      INSERT INTO coupons (code, discount_type, discount_value, description, active)
        VALUES ('CONDITNCREW', 'percent', 30, '30% off — CONDITN crew discount', 'true')
        ON CONFLICT (code) DO NOTHING;
    `);
    logger.info("DB migrations applied");
  } catch (e) {
    logger.error({ e }, "DB migration failed (non-fatal)");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  runMigrations().then(() => startReminderScheduler());
});
