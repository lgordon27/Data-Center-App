---
name: Acceptance trace fidelity
description: Interpreting bounded research traces when public passage text is exact but nested identity metadata is depth-limited.
---

A trace's exact passage-body hash does not prove its nested identity, attribution, routing, or location metadata is complete. A bounded serializer can preserve an overall `ambiguous` verdict while replacing location match/conflict objects with a depth-limit marker; the verdict alone may not explain whether the source truly conflicts with the requested scope.

**Why:** A live custom-project run retained exact public passage bodies and source IDs, but its nested location match/conflict details were depth-limited. Declaring a genuine conflict or proposing a relaxed gate from the summary alone would overstate the evidence.

**How to apply:** Report passage fidelity separately from metadata completeness. State which fields were truncated, mark the conflict basis unknown, and do not reconstruct resolver matches from passage text or hashes.