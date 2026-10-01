# Session-scoped evidence-to-return review

SafeLoc is intentionally open-use. No login, reviewer identity, authentication dependency, or authenticated review UI is required. Human financial choices belong only to the user's personal session scenario; canonical observations remain system-generated, append-only research records.

## Supported destinations

Only these existing cash-flow destinations may receive a session-reviewed value:

| Evidence ID | Destination | Canonical unit |
| --- | --- | --- |
| `electricity_cost` | Electricity rate | USD/MWh |
| `water_consumption` | Annual cooling water | Mgal/year, facility-absolute |
| `grid_interconnection` | Grid-interconnection duration | months |

Other findings remain evidence or context. Source quality is not a numeric model input, and accepting an observation does not verify synthetic transaction assumptions.

## Review path

The Financial Transmission view contains **My session financial review**. The user declares the facility and phase modeled in their personal scenario. This selection does not establish source identity or scope: retained sources must independently bind the project, facility, phase, quantity, unit, and financial measure.

Opening a proposal captures a model-neutral disclosure: raw and normalized values, source URL/date/class, retained passage, project/scope, policy/model versions, and before/after IRR, NPV, MOIC, and payback. The source candidate, baseline inputs, scope, and prior session decisions are bound to the preview. Changed inputs or edited disclosures require a fresh preview.

- **Accept into my scenario** applies only a currently eligible, explicitly disclosed value.
- **Reject** and **Keep evidence-only** do not activate a finding; either removes that target's earlier session acceptance and restores its baseline treatment.
- A no-op explicitly reports **No model change**.

Eligibility is fail-closed for unresolved identity, unsupported or inaccessible passages, missing/unknown dates, stale/future evidence, old policies, wrong units, contradictory or context-only claims, ambiguous quantities, and mismatched/unknown scope. Planned searches are never manufactured as executed search telemetry.

A passage must affirm one point value for the scoped financial measure, including its sentence prefix and modality. A denied proposition, hypothetical assumption, question, range, bound, general-market comparison, or competing quantity cannot become a financial point merely because it shares a sentence with the project name and matching unit. Unknown introductory prose stays evidence-only; an explicit forecast label is allowed only with independently qualified forecast-period disclosure. Stronger session policies invalidate decisions made under an older, weaker gate.

Accepted values receive a separate source-neutral point-value treatment for the three supported destinations, not an artificial source-quality upgrade. Existing confidence treatment is retained. Annual water is an absolute facility amount, not multiplied by synthetic capacity scaling.

## Session isolation and model basis

Decisions and immutable preview/model snapshots persist in this tab's `sessionStorage`, surviving same-tab reload. They are not written to the server, database, proof ledger, or canonical dossier history. Project changes, reset, and scope changes clear these personal choices. Replayed acceptance is revalidated against current candidates, baseline, policy, and time; invalid acceptance stays visible with an ignored reason but cannot alter the model.

The synthetic-current scenario remains the primary case. Its synthetic benchmark remains unchanged. EIA remains an optional statewide price sensitivity; session electricity acceptance never replaces the EIA price basis. Accepted water and interconnection inputs can affect that sensitivity without turning it into a project tariff.

Evidence Room's source/correction acceptance retains findings for review only; it is not financial acceptance. Legacy custom-research model-acceptance flags cannot bypass the separate session gate.

## Integration

- `src/model/sessionFinancialTransmission.ts`: pure preview, decision, restore, and replay interface.
- `src/context/DiligenceContext.tsx`: scoped history/storage and scenario overlay.
- `src/components/conference/SessionFinancialReview.tsx`: explicit user review/disclosure.

The legacy canonical financial decision adapter remains unwired. Do not satisfy its authenticated contract with a fabricated actor, and do not route session decisions into canonical history.

This deliberately replaces the originally planned durable canonical human decision path with session-only decisions, as explicitly directed by the user. The frozen proof contract, canonical ledger, retrieval behavior, and provider scenario basis are unchanged.