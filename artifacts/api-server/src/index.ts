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
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS phone_number TEXT;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_token TEXT;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_message TEXT;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'deposit';
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS main_service_price NUMERIC(10,2);
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_notes TEXT;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS manual_booking TEXT DEFAULT 'false';
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_type TEXT DEFAULT 'website';
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_status TEXT DEFAULT 'upcoming';
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) DEFAULT 0;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_due NUMERIC(10,2);
      CREATE TABLE IF NOT EXISTS manual_booking_items (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payment_links (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        payment_option TEXT NOT NULL DEFAULT 'deposit',
        deposit_type TEXT DEFAULT 'fixed',
        deposit_value NUMERIC(10,2),
        amount_due NUMERIC(10,2) NOT NULL,
        remaining_payment_method TEXT DEFAULT 'cash_or_online',
        expires_at TIMESTAMP,
        disabled TEXT NOT NULL DEFAULT 'false',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        last_used_at TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS payment_records (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        method TEXT NOT NULL,
        paid_at TIMESTAMP DEFAULT NOW() NOT NULL,
        note TEXT,
        stripe_payment_intent_id TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
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
