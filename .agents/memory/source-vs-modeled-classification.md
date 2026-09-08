---
name: Source vs modeled classification
description: Provenance rule for evidence items whose public fact is verified but underwriting treatment is inferred.
---

An evidence item's source classification and its modeled treatment classification are separate. A public source can verify the observed fact while the cash-flow model applies a conservative inference; any financial trace must show both.

**Why:** Conflating the two labels makes a material modeled sensitivity look like a direct public fact and breaks the evidence-to-return audit trail.

**How to apply:** Keep the human-approved source class unchanged, carry the effective/model class into attribution and drawer traces, and label any treatment driven by that model class wherever the financial effect is displayed. For marginal attribution, derive the baseline treatment from the same one-input repaired model used for the sensitivity, not from the all-verified portfolio.