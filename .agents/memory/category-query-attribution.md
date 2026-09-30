---
name: Category routing and query attribution
description: How governed research passages and audit queries stay correctly attributable to categories.
---

Auditable category research must match an executed query to the category’s own planned primary or follow-up query. Shared evidence variables and overlapping terms can belong to multiple categories, but that overlap must not copy one observed query into unrelated category receipts.

Structured category analysis must also use only passages explicitly routed to that category or mapped to one of its evidence IDs. Unknown-routed and duplicate passages stay in the run’s source-access and audit records; filtering is only for provider input and must not change evidence eligibility.

**Why:** Broad keyword matching made a single electricity query appear to have executed for grid and other categories, which blurred requested work and observed retrieval.

**How to apply:** Keep requested and executed queries separate, use exact planned-query matching for category receipts, and reserve shared evidence-variable mappings for claim attribution rather than category execution state. Route prompt passages deterministically, but do not prune the underlying audit/source ledger.

Prompt-size telemetry should contain only bounded passage counts and request-body byte measures. Preserve those safe fields through client parsing so reviewers can see the reduction, but never copy raw passage text or provider request bodies into diagnostics.

**Why:** Raw research passages and provider payloads are not needed to explain request-size changes and would unnecessarily widen exposure.

**How to apply:** Keep telemetry numeric and bounded at the server boundary, explicitly parse its fields on the client, and render only counts and byte deltas in the audit UI.