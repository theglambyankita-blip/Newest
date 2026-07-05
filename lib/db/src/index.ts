import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const PGHOST = process.env.PGHOST;

if (!DATABASE_URL && !PGHOST) {
  throw new Error(
    "No database configuration found. Did you forget to provision a database?",
  );
}

// Prefer Replit-native PG* environment variables whenever they're available.
// DATABASE_URL has historically pointed to an external/deleted host (e.g. a
// stale or corrupted Supabase connection string), so we only fall back to it
// when the native vars aren't present at all.
const useNativeVars = Boolean(PGHOST);

export const pool = useNativeVars
  ? new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    })
  : new Pool({ connectionString: DATABASE_URL });

export const db = drizzle(pool, { schema });

export * from "./schema";
