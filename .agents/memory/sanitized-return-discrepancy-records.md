---
name: Sanitized return discrepancy records
description: Durable boundary for reproducing SafeLoc return differences without exporting sensitive browser or provider data.
---

Reconciliation captures should include the complete normalized model state, all evidence classifications, provider status/timestamps, storage schema summaries, cash-flow schedules, debt and terminal treatment, and release identity fingerprints. They should not include raw provider payloads, arbitrary browser storage values, authorization material, cookies, or source text.

**Why:** Return differences need an exact, replayable input record, but the browser and provider responses can contain sensitive or unstable data that is not required to reproduce the model.

**How to apply:** Expose the capture path only to development or maintainers, sort maps before fingerprinting, omit volatile capture timestamps, and test live, cached, and embedded provider states through the same normalized seam.