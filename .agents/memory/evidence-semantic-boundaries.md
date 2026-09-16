---
name: Evidence semantic boundaries
description: Durable rules for keeping SafeLoc research, acceptance, modeling, and session history distinct.
---

The evidence pipeline must keep raw research, proposed normalized evidence, accepted evidence, and accepted model inputs as separate states. A semantically valid proposal is still model-neutral until a human accepts it; context-only and decision-gate records remain available for diligence but never enter cash-flow inputs. Model boundaries should require the explicit accepted research state and revalidate from raw value/unit data rather than trusting caller-supplied validation metadata.

**Why:** Unit conversions and source classifications alone do not protect economics from dimensional or context errors. A record can otherwise claim acceptance or current-policy validity without having passed the human acceptance transition or the current semantic policy. A prior persistence failure also showed that classification, model snapshots, and decision history can be written in different event orders.

**How to apply:** Route every ingestion and reviewer/agent transition through the shared semantic policy, carry policy-version metadata through cache records, and persist the model snapshot and decision history after the action that records the human decision—not only before it.