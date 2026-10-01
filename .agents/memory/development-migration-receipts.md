---
name: Development migration receipt provenance
description: What evidence is required before resolving a reported migration against a different or unverified development target.
---

A reported successful development migration is not a verified target unless
its execution receipt is tied to a database-instance identity. Database names
and hostname fingerprints alone cannot establish historical instance continuity.

**Why:** A prior completion assertion and a migration-verification commit title
provided no target receipt while the current development endpoint lacked the
expected objects. Selecting another attachment or replaying SQL would have
guessed at the cause and risked acting on the wrong target.

**How to apply:** When migration reports disagree with current catalog checks,
request sanitized execution and instance/attachment evidence. Keep the discrepancy
blocked until verified; distinguish endpoint fingerprints from platform instance
identity, and never infer that an absent schema authorizes migration replay.

An explicitly authorized new development baseline is distinct from recovering
historical provenance. If the owner declares that history unrecoverable and
authorizes the current target, stop reconstructing history; capture a new
preflight/commit/integrity receipt without claiming it proves the earlier run.

**Why:** The owner resolved an unavailable-history blocker by approving a new
verified baseline, not by identifying the old migration target.

**How to apply:** Preserve the historical uncertainty in reports, clearly mark
new authorization and target, and retain rollback attempts as well as the actual
successful COMMIT. Never replace missing historical evidence with a new success.