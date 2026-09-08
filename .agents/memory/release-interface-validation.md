---
name: Release interface validation
description: SafeLoc release checks need bundle identity, cache headers, and production comparison before acceptance.
---

SafeLoc release acceptance treats the built public bundle as the release artifact: `/api/version` and `/release.json` must return the same content-hash release ID with `Cache-Control: no-store`, and the public host must be compared against those exact documents before deployment.

**Why:** The local redesigned Home and the public deployment can drift while both appear healthy; visual checks alone cannot distinguish a stale cached bundle or an obsolete production entry point.

**How to apply:** Run the production contract test and a cache-aware local/production release comparison after every release-interface change. Keep deployment blocked when the public host does not expose the release documents or renders the old Home markers.