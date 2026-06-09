---
name: Glam by Ankita — Clerk auth setup
description: How Clerk auth was integrated into the hybrid vanilla-JS + React app.
---

## Architecture

The main site is a vanilla JS SPA in `index.html`. React (via `src/main.tsx`) is mounted into `<div id="root">` at the top of `<body>`. The React module script is loaded at the end of `<body>`.

**Why:** The vanilla JS SPA and React coexist — vanilla JS handles the main site pages (home, about, gallery, etc.); React handles auth and account routes.

## Route Separation

In the vanilla JS IIFE (around line 1554 of index.html), paths `account`, `sign-in`, `sign-up` are detected early. When matched:
- `#root` is shown (`display: block`)
- `#sitenav` is hidden
- IIFE returns early (vanilla JS does nothing more)

For all other paths (home, about, gallery, contact, p, r): `#root` stays `display:none` and vanilla JS runs normally.

## React Routes

`App.tsx` wraps everything in `<WouterRouter base={basePath}> → <ClerkProvider>`. Routes:
- `/sign-in/*?` → `SignInPage` (Clerk's `<SignIn>` component)
- `/sign-up/*?` → `SignUpPage` (Clerk's `<SignUp>` component)
- `/account` → `AccountPage` (custom portal with booking list)
- catch-all → `null` (vanilla JS handles these pages)

## Account Page

`/api/my-bookings` (auth.ts route) requires Clerk session. Looks up bookings in DB by the user's primary email address from Clerk. Returns array ordered by `createdAt` desc.

## Key Files

- `src/App.tsx` — ClerkProvider, route definitions
- `src/pages/account.tsx` — account portal UI
- `artifacts/api-server/src/routes/auth.ts` — `/api/my-bookings` endpoint
- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` — Clerk proxy (prod only)
- `artifacts/api-server/src/app.ts` — `clerkMiddleware` mounted after body parsers

## CSS (Tailwind v4)

`src/index.css` has `@layer theme, base, clerk, components, utilities;` BEFORE `@import "tailwindcss"` and `@import "@clerk/themes/shadcn.css"` after.
`vite.config.ts` uses `tailwindcss({ optimize: false })` to prevent Clerk layer reordering in prod builds.

## Google Sign-In

Google is available as a login provider. User must enable it via the **Auth pane** in the Replit workspace toolbar (not via code).

**Why:** Replit-managed Clerk controls provider config through the Auth pane, not code.
