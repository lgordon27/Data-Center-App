---
name: Persisted UI state outlives contract changes
description: localStorage-persisted runs keep old behavioral contracts after upgrades; normalize fail-closed on read and revalidate at the mutation boundary.
---

Persisted UI state (e.g. localStorage agent runs in the SafeLoc workbench) silently preserves old behavioral contracts: a stored "actionable" proposal stays actionable even after the eligibility rules that produced it are removed.

**Why:** A corrective pass tightened eligibility but restored sessions still exposed Accept for now-prohibited proposals, and a refresh after accepting hid the reversal control because the regrouped finding lost its card treatment. Caught in code review, not by tests.

**How to apply:** When a persisted state's semantics change, (1) add a read-time normalizer that revalidates stored entities against the current contract and downgrades fail-closed while preserving audit/applied history, (2) re-check the contract at the mutation boundary as defense in depth (normalization is presentation-side; stored raw state must not be applicable), and (3) pin derived counters centrally (e.g. telemetry helpers) rather than trusting stored or caller-supplied values that contract changes have invalidated.
