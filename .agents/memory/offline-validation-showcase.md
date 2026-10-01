---
name: Offline validation and showcase boundaries
description: Durable constraints for validating saved SafeLoc outputs and serving reviewed dossier examples.
---

Saved-run annotations belong in an explicit offline adapter, not in the frozen proof contract. Validation may consume contract events and human decisions but must not infer missing events, factual truth, or search completion. A showcase catalog is a separate read-only surface; only non-illustrative snapshots with explicit human-review provenance and retained-source provenance may be visible. Empty is safer than promoting seeded or test material.

**Why:** The proof ledger, reviewer annotations, research chronology, source chronology, and review chronology serve different purposes. Treating one as another can make a fixture look like verified evidence or make a display read trigger production research.

**How to apply:** When connecting offline validation or showcase reads to later live-output producers, export explicitly, keep all dates and provenance distinct, and fail closed on missing review/snapshot metadata. Never add live research or refresh as a read fallback.