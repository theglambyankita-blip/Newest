---
name: Supabase → Replit DB fallback
description: DATABASE_URL secret was manually set to a deleted Supabase project; fix is in lib/db/src/index.ts to detect "supabase.co" and fall back to Replit PG* env vars.
---

# DATABASE_URL → Replit-native DB Fallback

## The Rule
`lib/db/src/index.ts` checks whether `DATABASE_URL` contains `"supabase.co"` and, if so, constructs the `Pool` using individual `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` env vars instead.

**Why:** The `DATABASE_URL` secret was manually set to a Supabase project that no longer exists (`ENOTFOUND`). The Replit-native Helium PostgreSQL DB (PGHOST starting with "helium") was already provisioned and all PG* vars were available as secrets.

**How to apply:** If DB connection issues arise again, check whether DATABASE_URL contains a dead hostname. The fallback logic in `lib/db/src/index.ts` means the Replit-native DB will be used automatically as long as PG* vars are set. Do not delete or update the DATABASE_URL secret manually — the code-level fallback handles it.

## Important: executeSql tool
The `executeSql()` code_execution callback still uses the old Supabase DATABASE_URL (it reads the secret directly). It will always fail. Use the API endpoints to verify DB state instead (e.g. `curl /api/admin/coupons?token=...`).

## Admin token
`ADMIN_TOKEN` env var = `c6dcc60c-72bd-4969-b8a8-9fa5098f6bcc` (prefix). Admin routes accept token as `?token=` query param (not Authorization header).
