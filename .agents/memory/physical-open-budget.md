---
name: Physical document-open budget
description: Research runs enforce a distinct physical document-fetch ceiling in addition to provider and candidate limits.
---

The research handoff must track physical document opens separately from returned candidates and provider requests. Canonical-document reuse does not replace the hard ceiling: once the ceiling is reached, later documents remain recorded as not attempted and later category work reports the budget skip truthfully.

**Why:** Candidate caps and URL reuse bound common cases but cannot guarantee a physical-fetch limit when a provider returns many distinct documents.

**How to apply:** Preserve physical-open usage, remaining capacity, ceiling state, reused receipts, and budget-limited categories through the server audit, client parser, handoff summary, and search audit.

Retained acceptance results must expose these diagnostics under an explicitly historical telemetry status, including the category-level reason a later document was not attempted.

**Why:** A failed refresh can successfully return older cached research; showing its open-budget counters as current-run telemetry would mislead reviewers about what the provider just did.

**How to apply:** Keep current-live and historical-retained audit fields separate in acceptance output and preserve both the budget counters and category skip reasons through cache and client parsing.

Concurrent in-flight receipt reuse should require an explicit provider canonical or resolved identity; a plain provider URL may still represent independent physical opportunities until a receipt is complete.

**Why:** Deduplicating plain URLs before any receipt exists can starve the shared physical-opportunity budget, while provider-declared canonical identity is sufficient to safely coalesce concurrent access.

**How to apply:** Mark explicit canonical identity during source normalization and use it only for pending-promise reuse; completed canonical receipts remain reusable for all normalized URLs.

Identity-discovery receipts must remain visible in the final category audit even though project identity has no modeled evidence slots. Receipt visibility is audit provenance and must not depend on model eligibility.

**Why:** Identity reads consume physical opportunities and explain later scope decisions; dropping them makes the run ledger incomplete even when evidence correctly remains ineligible.

**How to apply:** Match identity receipts by explicit identity role as well as category, preserve their access outcome and provenance, and never promote them into governed evidence solely because the receipt is visible.