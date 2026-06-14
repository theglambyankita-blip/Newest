---
name: Glam Gallery GALLERY_DIR path
description: Why process.cwd() is wrong for locating the gallery folder from the API server, and how to fix it.
---

## Rule
In `artifacts/api-server/src/routes/admin.ts`, GALLERY_DIR must be derived using `import.meta.url`, NOT `process.cwd()`.

```typescript
import { fileURLToPath } from "url";
const _adminDir = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_DIR = path.join(_adminDir, "../../../artifacts/glam-by-ankita/public/gallery");
```

**Why:** When pnpm runs `--filter @workspace/api-server run dev`, the node process CWD is set to `artifacts/api-server/`. Using `process.cwd()` + `"artifacts/glam-by-ankita/public/gallery"` produces the wrong nested path `artifacts/api-server/artifacts/glam-by-ankita/public/gallery` which is a dead end. At runtime, `import.meta.url` points to `dist/index.mjs` inside `artifacts/api-server/dist/`, so 3 `..` traversals from there reliably reach the workspace root regardless of CWD.

**How to apply:** Any time a new file path relative to the glam-by-ankita artifact is needed from the API server, use the same `_adminDir + "../../../"` anchor. The gallery.json lives at `/home/runner/workspace/artifacts/glam-by-ankita/public/gallery/gallery.json`.
