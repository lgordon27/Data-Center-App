---
name: Research run idempotency
description: Keep request identity distinct from cache identity, especially when stale reads start background work.
---

Treat a request ID as an idempotency token scoped to the canonical project, and keep the initiator and run ID attached to the execution owner. A stale-cache refresh started for a user request must alias that exact request to the background run before another delivery can arrive. An intentional retry uses a fresh request ID.

**Why:** A route can serve stale data while starting asynchronous refresh work. Without aliasing the original request to that shared refresh, duplicate delivery can start another run or overwrite audit ownership.

**How to apply:** When changing request replay or cache-refresh behavior, cover concurrent duplicates, stale-refresh duplicates, and explicit retries with offline production-path fixtures. Do not treat the cache key as the request identity.