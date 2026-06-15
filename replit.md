# The Glam by Ankita

A professional makeup artist website for Ankita, a Melbourne-based MUA. Multi-page single-file site (HTML/CSS/JS) served via Vite, with a separate Express API server for contact form emails.

## Run & Operate

- `pnpm --filter @workspace/glam-by-ankita run dev` — Vite dev server for the website
- `pnpm --filter @workspace/api-server run dev` — Express API server (email endpoint)
- Required env: `GMAIL_USER`, `GMAIL_APP_PASSWORD` — Gmail App Password for nodemailer

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Website: single `index.html` (HTML/CSS/JS inline) served by Vite
- API: Express 5 + nodemailer + multer
- No database — stateless contact form emails only

## Where things live

- `artifacts/glam-by-ankita/index.html` — entire website (all HTML, CSS, JS inline)
- `artifacts/glam-by-ankita/public/` — static assets (logo, photos, favicon)
- `artifacts/api-server/src/routes/email.ts` — email sending endpoint (owner + client confirmation)

## User preferences

- **Preserve credits** — always keep the footer credits intact: `© 2026 The Glam by Ankita · Ankita Awasthi. All rights reserved.` and `Made with ♥ in Melbourne`. Never remove or alter these lines.
- **Thank you emails** — Ankita sends post-session thank-you emails manually by telling the agent the client's name and email. The agent runs the nodemailer script directly from `artifacts/api-server` using saved Gmail credentials. No public-facing send page (removed for security).
- **Test emails** — any test emails sent during development should go to nishankn.ankita@gmail.com.
- **Serverless function limit** — Hobby plan allows max 12 Serverless Functions per deployment. To deploy more, upgrade to a Team (Pro) plan. After any commit, remind the user to push their changes.
