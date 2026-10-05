---
name: Acceptance capture semantics
description: Keep exactness claims scoped to the captured representation and expose sanitization or bounds.
---

Exactness belongs to a recorded representation, not to the whole provider exchange. A provider-output text record can establish that the SDK-provided content string was preserved unchanged; it does not establish the original network bytes. A structured claim record is a JSON serialization of parsed output and must remain labeled as such. Redaction and truncation invalidate unchanged status and need explicit reasons.

**Why:** Acceptance evidence must distinguish the source or provider content from what was transformed for safe local storage; conflating these representations can overstate what the record proves.

**How to apply:** Keep raw text and parsed structured claims in separate bounded records, bind both to the same run and attempt, and report redaction, truncation, and dropped-record status independently.