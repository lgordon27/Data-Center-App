---
name: AI evidence downgrade signal
description: The service-to-UI contract for labeling AI evidence classification downgrades.
---

The AI evidence service returns an explicit downgrade boolean derived from the final classification after source-text safeguards. Evidence Room uses that boolean for its Accept label; reasoning text is explanatory, not a protocol field.

**Why:** Source-text safeguards can retain an existing sourced class or allow a citation-only transition from a user assumption. Inferring downgrade locally or relying on a reasoning prefix can disagree with the classification actually returned.

**How to apply:** When changing classification order or source-text safeguards, compute the signal from the safeguarded result and the submitted existing classification, validate it at the client boundary, and keep the UI label bound to that signal.