---
name: Evidence semantic boundaries
description: Durable rules for keeping SafeLoc research, acceptance, modeling, and session history distinct.
---

The evidence pipeline must keep raw research, proposed normalized evidence, accepted evidence, and accepted model inputs as separate states. A semantically valid proposal is still model-neutral until an analyst accepts it; context-only and decision-gate records remain available for diligence but never enter cash-flow inputs. Audit lineage is append-only and persists independently from reset-cleared working state.

**Why:** Unit conversions and source classifications alone do not protect economics from dimensional or context errors. A prior persistence failure also showed that classification, model snapshots, and decision history can be written in different event orders.

**How to apply:** Route every ingestion and analyst/agent transition through the shared semantic policy, carry policy-version metadata through cache records, persist the model snapshot and decision history after the analyst action, and record resets or reversals as new lineage events rather than deleting history.