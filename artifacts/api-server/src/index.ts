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
