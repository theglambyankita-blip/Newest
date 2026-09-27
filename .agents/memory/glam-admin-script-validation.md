---
name: Rendered dashboard script validation
description: Server template builds do not validate the browser JavaScript they emit.
---
Validate the JavaScript extracted from the rendered admin HTML whenever editing its server-side template.

**Why:** A gallery handler quoting error prevented every dashboard handler from loading even though TypeScript and the server build passed. Testing the booking endpoint alone did not detect the broken UI.

**How to apply:** Compile the rendered inline scripts with `vm.Script` and check changed critical user flows. Do not treat a successful API response as evidence that the dashboard buttons work.