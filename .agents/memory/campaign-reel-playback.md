---
name: Campaign Reel playback
description: Prefer local browser-compatible video for campaign Reels that must play directly in the website.
---

When in-page Reel playback is required, use a local MP4 and native video controls instead of depending on the Instagram embed player.

**Why:** Instagram's embed script and Reel endpoints returned HTTP 429 and login redirects in the Replit preview, so the external player could not be verified there.

**How to apply:** Ask for the source clip, optimize it to H.264/AAC MP4, serve it from the website's deployable assets, and verify both the media URL and byte-range responses. Keep unrelated Instagram embeds unchanged unless the user asks to replace them.
