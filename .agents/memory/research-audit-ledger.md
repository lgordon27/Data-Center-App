---
name: Research audit ledger
description: Durable rules for bounded research budgets and truthful category-stage telemetry.
---

The research run must check remaining shared tool budget before both primary and follow-up provider attempts, and clamp provider-reported usage to the governed run limit so telemetry cannot claim more budget than the run owns. Candidate caps must be enforced before document access, while the merged packet retains the full governed run set for later claim validation.

**Why:** A category follow-up can otherwise start after the primary consumes the final call, while cap-discarded sources can disappear from category audit counts even though their access receipts are valid. A supported claim also cannot rely on an accessible sibling source when the mapping names a blocked source.

**How to apply:** Keep the full normalized ledger for audit-stage counts and source receipts; use the merged run packet for evidence-to-claim resolution and the retained-candidate metric. Require every evidence category item to resolve before marking its category complete, and stream bounded document responses with complete non-public IP classification. Fetch a canonical document once across categories; later category uses must record a reused receipt, not a new open.

Every saved acceptance conclusion must be bound to its exact run ID, source revision, and configured budgets. Treat nearby canaries as separate comparison evidence unless the artifacts prove they are the same run.

**Why:** A prior canary can share the same project and failure pattern while having a different source revision, open limit, and candidate order. Using it as a substitute can create unsupported claims about which sources were discovered, opened, or blocked.

**How to apply:** Before diagnosing candidate order or budget use, match the run ID, source revision, and budget in the run-local receipt. If any link is absent, label candidate rank and per-run outcomes unavailable rather than inferring them from another canary.

A sanitized receipt's empty category array is not proof that the historical upstream source was unrouted. Admission repair must preserve the original requested identity and existing metadata; plausible content alone does not authorize inventing aliases or routes.

**Why:** Retained body hashes can verify passage bytes while occurrence-to-category/request links and upstream normalization input remain unavailable. Confusing those evidence levels would turn an uncertain historical cause into an unsupported production correction.

**How to apply:** Diagnose current replay separately from historical routing. Require the actual upstream and normalized records to demonstrate metadata loss; when no incorrect gate is reproduced, retain fail-closed admission and identify the minimum missing evidence.

Create the audit start inside the single-flight refresh owner immediately before provider work; that same owner alone completes the row. Audit persistence is bounded and best-effort, not an admission gate. Persist the result before sending it so the response can disclose persistence failures; record delivery timing separately after response finish or close.

**Why:** Starting outside the coalesced owner can create duplicate or phantom rows. The requested resilience policy prioritizes retaining a research result over audit availability, while preserving truthful delivery timing and an explicit persistence-incomplete response.

**How to apply:** Keep lifecycle ownership with the cache-runner callback and leave provider/admission controls unchanged. Retry connection-only audit failures once on a fresh connection, disclose exhausted writes without discarding results, and treat premature response close as a disconnect that aborts outstanding work.

In a concurrent category scheduler, reserve the pending primary slot before invoking retrieval code that can authorize a repair or follow-up. Promise callbacks may run synchronously up to their first `await`, so a later reservation can hide the current primary from the budget check.

**Why:** If the callback can authorize extra work before its own primary is visible as pending, multiple categories can spend the same remaining request capacity.

**How to apply:** Add the pending-primary reservation before calling retrieval, reconcile it to actual issued requests (including zero-call outcomes), and release only unused local reservations.