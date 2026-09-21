---
name: Legacy booking schema migrations
description: Durable guidance for evolving the booking database used by the API server.
---

When extending the booking record, add an idempotent startup migration for every new or previously assumed column, because existing environments may predate the current Drizzle schema.

**Why:** The database can be older than the checked-in schema; inserts fail at runtime when a schema column exists only in code.

**How to apply:** Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in the API startup migration for booking fields and keep the migration safe to run repeatedly.