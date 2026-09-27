---
name: Rendered dashboard script validation
description: Server template builds do not validate the browser JavaScript they emit.
---
Validate the JavaScript extracted from the rendered admin HTML whenever editing its server-side template.

**Why:** A gallery handler quoting error prevented every dashboard handler from loading even though TypeScript and the server build passed. Testing the booking endpoint alone did not detect the broken UI.

**How to apply:** Compile the rendered inline scripts with `vm.Script` and check changed critical user flows. Do not treat a successful API response as evidence that the dashboard buttons work.

Trace the live deployment entrypoint before claiming a dashboard fix reaches production.

**Why:** Preview-only manual-booking changes passed local checks while the user's live dashboard still had no creation form. The preview and published app were running different backend implementations.

**How to apply:** Inspect the active host's deployment configuration and compare the live HTML with the changed implementation. Test the actual production handler in isolation without modifying real client data, and distinguish code readiness from a completed deployment.