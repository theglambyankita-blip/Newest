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

// If DATABASE_URL points to an unreachable external host (e.g. deleted Supabase project),
// fall back to Replit-native PG* environment variables automatically.
const useNativeVars = !DATABASE_URL || DATABASE_URL.includes("supabase.co");

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
