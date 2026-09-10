# Evidence Semantic Contract Report

## Canonical policy

The shared runtime policy is version `1` and defines exactly these 16 identifiers:

| ID | Canonical meaning | Dimension / unit | Model destination | Treatment |
| --- | --- | --- | --- | --- |
| `electricity_cost` | Named-facility delivered tariff or contract price | Currency / energy; `USD/MWh` | `electricityRate` | Material financial driver |
| `water_consumption` | Named-facility annual cooling water consumed or withdrawn | Volume / time; `Mgal/year` | `annualCoolingWaterMgal` | Material financial driver |
| `grid_interconnection` | Time to energized grid interconnection | Time; `months` | `gridInterconnectionMonths` | Material financial driver |
| `water_escalation` | Named-facility water-cost increase | Percentage; `%` | `waterEscalationRate` | Material financial driver |
| `community_risk` | Community, infrastructure, permitting, or opposition conditions | Qualitative context | None | Context-only |
| `renewable_percentage` | Renewable share delivered or contractually procured | Percentage; `%` | None | Context-only |
| `cooling_capex` | Cooling and heat-rejection capital cost | Currency; `USD millions` | `coolingCapex` | Material financial driver |
| `electricity_escalation` | Named-facility electricity-cost increase | Percentage; `%` | `electricityEscalationRate` | Material financial driver |
| `carbon_compliance` | Named-facility annual carbon/compliance cost | Currency / time; `USD millions/year` | `annualCarbonCompliance` | Material financial driver |
| `permitting_timeline` | Time from named-project permit/construction milestone to completion | Time; `months` | `permittingMonths` | Material financial driver |
| `customer_concentration` | Largest named-facility customer share of demand or revenue | Percentage; `%` | None | Decision gate |
| `water_rights` | Facility water entitlement, allocation, seniority, or curtailment rights | Qualitative context | None | Decision gate |
| `site_hazard_exposure` | Named-site hazard profile, distinct from county-wide context | Qualitative risk | `siteHazardExposure` | Material financial driver |
| `backup_power_capacity` | Backup generation/storage coverage | Time; `hours` | None | Decision gate |
| `water_source_resilience` | Diversification and backup resilience of facility water sources | Qualitative supply | None | Decision gate |
| `downtime_cost` | Daily operating loss from named-facility interruption/degraded service | Currency / time; `USD/day` | `downtimeCostPerDay` | Material financial driver |

Every definition also declares allowed source scope and source types, project-specificity requirements, plausible bounds, zero semantics, fallback policy, and mandatory human acceptance. Source classification remains separate from modeled treatment classification.

## Supported conversions

- Electricity: `cents/kWh × 10`, `USD/kWh × 1,000`, `USD/GWh ÷ 1,000` → `USD/MWh`.
- Water: `gallons/year ÷ 1,000,000`, `m3/year ÷ 3,785.411784` → `Mgal/year`.
- Percentages: fraction `× 100`, basis points `÷ 100` → `%`.
- Capital cost: `USD ÷ 1,000,000`, `USD thousands ÷ 1,000` → `USD millions`.
- Annual carbon cost: `USD/year ÷ 1,000,000`, `USD/month × 12 ÷ 1,000,000` → `USD millions/year`.
- Durations: days `÷ 30.4375`, weeks `÷ 4.348214`, years `× 12` → months; ISO date ranges derive elapsed months.
- Backup coverage: minutes `÷ 60`, days `× 24` → hours.
- Downtime: `USD/month × 12 ÷ 365` → `USD/day`.
- Qualitative values use canonical vocabularies only; they are not numerically converted.

## Quarantine rules

- Unknown IDs, unsupported dimensions, missing units, missing numeric values, invalid qualitative values, and unparseable date ranges remain unresolved/quarantined.
- Values outside declared plausible bounds are quarantined and never clipped.
- A recognized unit alias is accepted only when it belongs to that evidence definition's declared `allowedUnits`; cross-dimension values such as `USD/year` for electricity or `MW` for a duration/qualitative record are quarantined.
- Qualitative records require a declared qualitative/context unit as well as a canonical vocabulary value; numeric units cannot pass as qualitative evidence.
- Zero is accepted only when an exact-project source explicitly establishes zero.
- Electricity prices require facility/industrial/tariff/contract/project context; residential or household rates are quarantined.
- Context-only and decision-gate variables remain reviewable but cannot become cash-flow inputs.
- Research without the registry-required source specificity, supported source provenance, or an eligible source-backed classification cannot activate custom economics.
- `Model Inference` and `User Assumption` records remain separate from source-backed research and cannot silently activate researched custom economics.
- All proposals remain model-neutral until human acceptance. Same-value/same-classification actions are recorded as no-op acknowledgements and do not recalculate returns.
- Cached entries carry the semantic policy version. Legacy version 2 entries are retained only for revalidation; they are not served as fresh and unsafe records remain quarantined.
- Containment is idempotent: once raw value/unit fields exist, every later server, cache, client, or model-boundary pass re-normalizes from those immutable raw fields rather than from the canonical numeric value. Canonical numeric values therefore cannot be converted a second time.
- Source eligibility is registry-driven: each variable's allowed source types and `projectSpecificityRequired` flag are enforced at server, client, and model boundaries. Site hazard context can use an eligible geographic source without exact-project identity; exact-project variables cannot.

## Previously ambiguous model mappings resolved

- Grid and permitting values are durations in months, not MW/capacity.
- Facility electricity price is a project-level tariff/contract input, not a statewide or residential observation.
- Renewable procurement is contextual and does not change cash flow.
- Customer concentration, water rights, backup coverage, and water-source resilience are decision gates, not direct financial drivers.
- Site hazard exposure is the qualitative input to the existing hazard treatment; community risk remains contextual.
- Carbon compliance is annual cost in USD millions/year; downtime is a daily cost in USD/day.
- Synthetic fallbacks remain explicitly labeled and separate from public facts and accepted research.

## Changed files

- `src/data/evidenceSemanticPolicy.mjs` — authoritative 16-variable registry and deterministic normalizer.
- `src/data/evidenceSemanticPolicy.d.mts` — TypeScript declarations for the shared runtime module.
- `src/data/evidenceSemanticPolicy.test.ts` — table-driven policy, conversion, range, zero, context, and qualitative coverage.
- `server/researchProjectProxy.mjs` — server normalization, raw/proposed metadata, policy version, and semantic cache metadata.
- `server/researchProjectCache.mjs` — cache version 3, policy versioning, and legacy revalidation flag.
- `src/services/researchProjectService.ts` — client hydration/containment routed through the shared policy.
- `src/context/DiligenceContext.tsx` — semantic metadata propagation, guarded model snapshots, no-op review records, and session/model/history restoration.
- `src/model/cashFlowEngine.ts` — shared-policy model boundary and accepted-input-only normalization.
- Active evidence acceptance and decision-history persistence remain in `src/pages/EvidenceRoom.tsx`, `src/context/DiligenceContext.tsx`, and `src/services/sessionLog.ts`; the retired analyst-agent module is not part of the current architecture.
- `src/services/sessionLog.ts` — decision-history persistence after Evidence Room acceptance.
- Updated regression tests in `server/researchProjectProxy.test.mjs`, `src/data/evidenceSemanticPolicy.test.ts`, `src/model/cashFlowEngine.test.ts`, `src/services/researchProjectService.test.ts`, and `src/services/sessionLog.test.ts`, including repeated server/cache/client containment, cross-dimension rejection, and per-variable source rules.

## Verification

- Typecheck: passed.
- Full package test suite: passed, 185 tests.
- Focused semantic/server/model/client normalization suite: passed, 86 tests.
- Production entry-point test: passed.
- Production Vite build: passed; only the existing large-chunk warning remains.
- Browser verification: passed after workflow restart. Custom research remained quarantined and model-neutral; accepted evidence changed economics only after human acceptance; accepted classification, decision trail, and model IRR persisted across reload; reset returned canonical defaults.
- Browser logs contained known Vite development HMR websocket connection-refused noise during reload; no SafeLoc application or backend error was observed.