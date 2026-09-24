---
name: Local Playwright browser setup
description: Replit workspace behavior when package-scoped Playwright tests launch against managed Vite workflows.
---

Package-scoped Playwright commands can be installed correctly while the workspace browser cache is still empty.

**Why:** Focused repository specs have failed before launch because Chromium was absent or because a second Vite process tried to claim the managed workflow's HMR websocket port.

**How to apply:** If Chromium is missing, provision it through the SafeLoc package scope. If the managed app workflow is already running, set `PLAYWRIGHT_BASE_URL` to its local port so Playwright does not start a duplicate Vite server. Treat either launch failure as harness setup, not an application regression.