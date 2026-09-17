---
name: Physical document-open budget
description: Research runs enforce a distinct physical document-fetch ceiling in addition to provider and candidate limits.
---

The research handoff must track physical document opens separately from returned candidates and provider requests. Canonical-document reuse does not replace the hard ceiling: once the ceiling is reached, later documents remain recorded as not attempted and later category work reports the budget skip truthfully.

**Why:** Candidate caps and URL reuse bound common cases but cannot guarantee a physical-fetch limit when a provider returns many distinct documents.

**How to apply:** Preserve physical-open usage, remaining capacity, ceiling state, reused receipts, and budget-limited categories through the server audit, client parser, handoff summary, and search audit.

Concurrent in-flight receipt reuse should require an explicit provider canonical or resolved identity; a plain provider URL may still represent independent physical opportunities until a receipt is complete.

**Why:** Deduplicating plain URLs before any receipt exists can starve the shared physical-opportunity budget, while provider-declared canonical identity is sufficient to safely coalesce concurrent access.

**How to apply:** Mark explicit canonical identity during source normalization and use it only for pending-promise reuse; completed canonical receipts remain reusable for all normalized URLs.