---
name: Generated validation exports
description: Prevent asset rehydration from corrupting mutable deterministic validation outputs.
---

Mutable validation exports that are regenerated in place must not also remain registered as Library output assets.

**Why:** The asset rehydration process can restore registered content after an atomic rename, producing duplicated top-level JSON documents even when the generator itself uses replacement writes.

**How to apply:** Keep deterministic validation outputs under source control and regenerate them atomically, but remove stale output-asset registrations for those paths. Verify parsing again after workflow restart.