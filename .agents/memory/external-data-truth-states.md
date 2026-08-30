---
name: External data truth states
description: Rules for keeping embedded case data distinct from provider freshness and fallback state.
---

Bundled case values must remain **Embedded**. A source becomes **Live** or **Cached** only when metadata identifies a real provider response and includes a parseable provider timestamp. Provider readiness is not actual evidence attribution.

**Why:** This client-only proof of concept must support future integrations without implying that a bundled estimate came from an API, a retained cache, or a query that never occurred.

**How to apply:** Keep evidence classification independent from feed freshness. Resolve provider state in this order: valid live response, valid timestamped retained response, then embedded baseline. A disconnected provider must not be named as the actual source of an embedded record. Browser invariants that compare model values across navigation should pin a deterministic provider fixture; asynchronous provider hydration can otherwise look like comparison contamination.