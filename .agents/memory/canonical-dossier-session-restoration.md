---
name: Canonical dossier session restoration
description: Preserve selected canonical dossier identity and immutable evidence baselines across reviewer reset and browser reload.
---

Persist the selected canonical dossier summary together with its evidence baseline and reviewer overrides. Restoring only classifications is insufficient when the route no longer carries a dossier slug.

**Why:** The SafeLoc reset flow can return to the generic analysis route. A later reload must still restore the previously selected dossier without writing to its canonical database record.

**How to apply:** Treat the persisted dossier summary as read-only session context, rebuild model evidence from the stored baseline plus overrides, and keep capacity eligibility controlled by the explicit approved-scenario list.