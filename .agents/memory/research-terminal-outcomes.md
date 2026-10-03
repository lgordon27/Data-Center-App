---
name: Research terminal outcomes
description: Canonical outcome and scheduling rules for custom project research.
---

Every custom-research run must end in exactly one server-owned state: complete with eligible evidence, complete with no eligible evidence, or incomplete because of a technical limitation. A negative conclusion is valid only when required discovery completed without provider, access, timeout, or governed-budget blockers.

**Why:** Missing or rejected evidence is a valid research result, but provider and document-access failures cannot support a negative conclusion. Project identity also has no modeled evidence slots and must not be forced through the evidence response contract.

**How to apply:** Use a dedicated identity response contract, give identity the first physical-open opportunity without increasing the run-wide ceiling or deadline, preserve candidate lineage, and persist the canonical outcome unchanged through caches, registry records, acceptance reports, and handoff UI.

A technically incomplete run may still have reviewer-visible retained passages, but only when validated source lineage and an accessible passage survive into the retained-source ledger. A discovered URL, candidate excerpt, or successful fetch alone is not a retained finding, and a retained passage does not establish an unsupported metric.

**Why:** Partial research can otherwise look empty despite usable captured text, or overstate a claim merely because its source page loaded successfully.

**How to apply:** Test the incomplete outcome and retained-passage handoff separately. Keep claim classification and financial eligibility unresolved unless the retained passage supports the specific claim.

Retained sources and an empty modeled-evidence inventory must not override an assessment failure or prove category completeness. Keep successful acquisition separate from completed structured assessment; a provider-rejected request may be not analyzed even though a request was issued.

**Why:** Fixing an internal identity exception exposed a second failure: identity has no financial slots, so an “all slots eligible” check could mark it Complete even when every provider assessment failed. Existing failure/429 controls must remain stronger than that vacuous check.

**How to apply:** Give explicit technical failure precedence in category status and retain independent provider-failure and unissued-analysis regression controls.