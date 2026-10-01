---
name: Public launch integration boundaries
description: Why retained research admission and public-review example eligibility need independent boundaries.
---

Do not release custom-research admission merely because an HTTP response has returned if that response reports a background refresh. Retain the conservative bounded lease until work can be known to have ended.

**Why:** A cached result can return before its provider refresh finishes. Releasing admission at the response boundary could allow overlapping live work even when foreground requests appear serialized.

**How to apply:** Preserve this distinction when integrating cache-refresh completion signals or changing server entry handling; never add provider retries or concurrency to compensate.

Admission regression fixtures must exercise the production handler's response lifecycle, not just a simplified framework-shaped fake.

**Why:** A unit fake can report the right refresh metadata through a different response-writing path and pass while the actual server releases capacity too early.

**How to apply:** Include a retained stale-cache response with held mocked background work and a rejected concurrent arrival at the real handler boundary. Keep all provider surfaces mocked.

Canonical source review is not public-showcase approval. Reviewed-example entry points must consume an explicitly approved cached catalog, not infer review eligibility from a seed dossier or an available illustrative model.

**Why:** Canonical cases can combine sourced facts with synthetic economics and lack the human-review attestation required for public examples.

**How to apply:** Keep reviewed-catalog routing separate from canonical workbench discovery. If no eligible snapshot is supplied, show an empty or unavailable state rather than starting research.