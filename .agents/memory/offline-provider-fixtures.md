---
name: Offline provider fixtures
description: Keep research fixtures independent of workspace credentials and real provider pacing time.
---

Offline research fixtures must explicitly choose their provider adapters rather than inherit whichever provider credentials happen to be configured. Isolating a provider gate is not enough to make a multi-call fixture fast: it can still consume a full real token window within one run.

**Why:** Research fixtures run in an environment that can already contain provider credentials; implicit adapter selection makes their behavior environment-dependent. Fresh gates caused minute-long waits inside unrelated integration fixtures once conservative TPM accounting was introduced.

**How to apply:** Supply deterministic discovery and document transports, never live fallback. For tests unrelated to pacing, inject an accelerated gate clock/window and use the configured model's TPM ceiling: larger reasoning output reservations can otherwise be rejected before the mock transport runs. Keep dedicated pacing tests on explicit simulated production-sized windows and ceilings. Do not increase production limits to speed tests.