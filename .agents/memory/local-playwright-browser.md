---
name: Local Playwright browser setup
description: Replit workspace behavior when package-scoped Playwright tests cannot find their Chromium executable.
---

Package-scoped Playwright commands can be installed correctly while the workspace browser cache is still empty.

**Why:** A focused repository spec failed before launch because the expected Chromium headless-shell executable was absent; the managed testing browser was unaffected.

**How to apply:** If a local Playwright command reports a missing executable, provision Chromium through the SafeLoc package scope before treating the failure as an application regression. A Vite HMR websocket port warning is nonfatal when the test server continues and tests execute.