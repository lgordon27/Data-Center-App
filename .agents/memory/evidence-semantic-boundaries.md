---
name: Evidence semantic boundaries
description: Durable rules for keeping SafeLoc research, acceptance, modeling, and session history distinct.
---

The evidence pipeline must keep raw research, proposed normalized evidence, accepted evidence, and accepted model inputs as separate states. A semantically valid proposal is still model-neutral until a human accepts it; context-only and decision-gate records remain available for diligence but never enter cash-flow inputs. Model boundaries should require the explicit accepted research state and revalidate from raw value/unit data rather than trusting caller-supplied validation metadata. If physical source access happens after an initial category normalization, the final pass must revalidate the raw claim against the retained passage rather than carry forward the pre-access quarantine. When projecting session-specific financial changes into an evidence view, preserve the richer UI record fields—source role, impact role, citation, and provenance—instead of rendering a model-only snapshot.

**Why:** Unit conversions and source classifications alone do not protect economics from dimensional or context errors. A record can otherwise claim acceptance or current-policy validity without having passed the human acceptance transition or the current semantic policy. A prior persistence failure also showed that classification, model snapshots, and decision history can be written in different event orders. Source access can also turn a previously unresolved exact quotation into a valid mapping, so its earlier quarantine must not become authoritative. Financial projections can omit presentation-only fields; using one directly as a full evidence row can crash the view or hide source provenance.

**How to apply:** Route every ingestion and reviewer/agent transition through the shared semantic policy, carry policy-version metadata through cache records, and persist the model snapshot and decision history after the action that records the human decision—not only before it. Merge scenario outputs onto retained UI evidence before rendering, and show an explicit unavailable label when required presentation metadata is absent.

Retained attributed reporting may be worth reviewing even when it has no matching canonical evidence field. A missing field mapping is not missing source text, an unsupported quotation, or an invalid unit; those are separate reviewer distinctions. It must not imply a modeled claim or financial effect. A reviewed snapshot is not completed live research, and unevaluated financial readiness is “Not assessed,” not zero.

**Why:** The product's reviewer distinction explicitly requires these boundaries so results do not discard useful reporting or make unsupported financial/completeness claims.

**How to apply:** Keep attribution, exact passages, scope limitations and validation level reviewable together, while describing only the assessment or mapping receipt actually retained.