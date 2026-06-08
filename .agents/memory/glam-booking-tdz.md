---
name: Glam by Ankita — Booking Page TDZ Bug
description: Root cause of the "Loading your booking…" infinite hang on /p?t= links; how it was diagnosed and fixed.
---

# Booking Page Temporal Dead Zone Bug

## The Rule
In `index.html`, all `let` state variables used by async functions called from the IIFE **must be declared before the IIFE**, not after it.

**Why:** The page-routing IIFE (which fires on every direct URL visit to `/p?t=...`) calls `showSpecialPage('booking', token)` → `loadBookingPage(token)`. The very first statement of `loadBookingPage` was `_bookingToken = token`. If `let _bookingToken` is declared *after* the IIFE in the script, JavaScript's Temporal Dead Zone rules throw a `ReferenceError` at that assignment. Because `loadBookingPage` is `async`, the error is silently swallowed as a rejected Promise — no console output, no visible error, page stuck on "Loading your booking…" forever.

## How to Apply
Keep this block **before** the IIFE comment `// Navigate to correct page on direct URL visit`:
```javascript
// ── State variables (declared before IIFE to avoid Temporal Dead Zone) ──
let _reviewToken = null;
let _reviewBookingData = null;
let _stripe = null, _stripeElements = null, _bookingToken = null;
```
Never move these declarations below the IIFE, even when reorganising the booking/review sections.

## Diagnosis method
Added `console.log` inside `showSpecialPage` (before and after the `loadBookingPage` call) and inside `loadBookingPage` (first statement). The outer logs appeared; the inner log never did — revealing the function body was exiting before the first line via a silently-caught async error.
