---
name: Research audit ledger
description: Durable rules for bounded research budgets and truthful category-stage telemetry.
---

The research run must check remaining shared tool budget before both primary and follow-up provider attempts, and clamp provider-reported usage to the governed run limit so telemetry cannot claim more budget than the run owns. Candidate caps must be enforced before document access, while the merged packet retains the full governed run set for later claim validation.

**Why:** A category follow-up can otherwise start after the primary consumes the final call, while cap-discarded sources can disappear from category audit counts even though their access receipts are valid. A supported claim also cannot rely on an accessible sibling source when the mapping names a blocked source.

**How to apply:** Keep the full normalized ledger for audit-stage counts and source receipts; use the merged run packet for evidence-to-claim resolution and the retained-candidate metric. Require every evidence category item to resolve before marking its category complete, and stream bounded document responses with complete non-public IP classification. Fetch a canonical document once across categories; later category uses must record a reused receipt, not a new open.