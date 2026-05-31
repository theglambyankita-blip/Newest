---
name: Replit pnpm bootstrap SIGABRT fix
description: Why the `packageManager` field in root package.json causes workflow failures on Replit and how to fix it.
---

When a root `package.json` has `"packageManager": "pnpm@X.Y.Z"`, Replit intercepts every workflow start and runs `pnpm add pnpm@X.Y.Z` to enforce that version. This command can crash with SIGABRT (process abort) — typically a memory or binary compatibility issue in the Replit container — causing every workflow restart to fail immediately.

**Fix:** Remove the `packageManager` field from the root `package.json`. Replit will then use whatever version of pnpm is already installed on the system without attempting a reinstall.

**Why:** The `packageManager` field is a corepack hint. Replit's pre-workflow bootstrap reads it and tries to globally reinstall the specified pnpm version. If that installer crashes (SIGABRT), the workflow never starts. Removing the field is safe — pnpm still works, just without a pinned version.

**How to apply:** If workflows are failing immediately with a log line like `Command was killed with SIGABRT (Aborted): pnpm add pnpm@X.Y.Z`, remove `"packageManager"` from root `package.json`.
