---
name: Search indexing boundaries
description: Distinguish technical SEO delivery from Google indexing and rankings.
---
Public routes must identify themselves in their initial HTML, not only after client-side navigation.

**Why:** The live public routes previously returned the homepage canonical and metadata until JavaScript ran. Keyword additions and passing builds did not establish Google indexing or ranking success.

**How to apply:** Verify the published response for each public route after publishing. Use Search Console URL Inspection to establish Google's indexing and selected canonical; generic search results alone cannot prove exclusion. Never describe a development SEO fix as a confirmed live ranking improvement.

Check bare-domain DNS as well as the canonical www host before attributing poor visibility to page copy.

**Why:** A working www site and correct canonical tags previously concealed a bare domain with no address records. HTML changes cannot repair DNS or establish Google's indexing status.

**How to apply:** Check public DNS and both hosts independently, distinguish crawl accessibility from ranking, and obtain the hosting provider's actual DNS targets before changing records. Do not promise a rank improvement from a technical correction.