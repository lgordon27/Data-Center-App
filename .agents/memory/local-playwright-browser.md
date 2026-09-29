---
name: Local Playwright browser setup
description: Replit workspace behavior when package-scoped Playwright tests launch against managed Vite workflows.
---

Package-scoped Playwright commands can be installed correctly while the workspace browser cache is still empty.

**Why:** Focused repository specs have failed before launch because Chromium was absent or because a second Vite process tried to claim the managed workflow's HMR websocket port.

**How to apply:** If Chromium is missing, provision it through the SafeLoc package scope. If the managed app workflow is already running, set `PLAYWRIGHT_BASE_URL` to its local port so Playwright does not start a duplicate Vite server. The proxied preview also injects a development banner that can intercept clicks near the top of a mobile viewport; distinguish those overlay failures from app regressions and prefer an isolated test server when available.