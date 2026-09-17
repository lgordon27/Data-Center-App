---
name: IRR mathematical reason states
description: Stable semantics for explaining when a project IRR is not mathematically meaningful.
---

The return model should expose a nullable IRR value together with a stable status and reason. The reason describes the cash-flow mathematics—invalid input, no sign change, or multiple possible roots—not the confidence or quality of the underlying evidence.

**Why:** A bare N/M label is ambiguous to reviewers, and treating mathematical non-meaningfulness as an evidence-confidence problem can lead to the wrong review decision.

**How to apply:** Keep companion return measures such as NPV, MOIC, and payback visible. Use the typed reason in workbench, saved-scenario, and report surfaces, and explicitly label legacy records whose reason was not captured.