const { Pool } = require('pg');

let pool;

function getDbUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    null
  );
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getDbUrl(),
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function initDb() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS booking_sessions (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      booking_data JSONB NOT NULL DEFAULT '{}',
      client_name TEXT,
      client_email TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS booking_confirmations (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      session_id INTEGER REFERENCES booking_sessions(id),
      confirmed_data JSONB NOT NULL DEFAULT '{}',
      notes TEXT DEFAULT '',
      total_aud NUMERIC(10,2),
      deposit_aud NUMERIC(10,2),
      stripe_payment_intent_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

module.exports = { getPool, initDb, getDbUrl };
