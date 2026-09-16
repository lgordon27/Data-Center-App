# Stargate financial engine audit

**Audit scope:** SafeLoc Stargate Abilene project economics only  
**Audit date:** 2026-09-16  
**Publication status:** Local audit artifact only. Nothing was published or deployed.

## Architecture gate

**Initial recommendation: REVISE.** The engine is isolated behind the evidence
model boundary, but the requested audit could not be accepted on the existing
production tests alone because they delegated all arithmetic to the production
helper. The required independent contract fixture was added before any
production logic decision.

**Final recommendation: GO with a narrow containment repair.** The independent
fixture reconstructs the baseline and active stress schedules without calling
the production calculation helper. The production formula path is otherwise
unchanged. The only demonstrated defect was at the custom-research model
boundary: a record could claim `acceptedForModel: true` while carrying a
non-accepted research state, and a current-policy “valid” record could bypass
semantic revalidation. Both paths are now quarantined or revalidated.

The audit remained inside the Stargate financial engine, evidence containment,
and financial UI/audit language. It did not change research providers,
community-agreement logic, holdings relationships, Advisor or Asset Manager
outputs, AI Chain behavior, or deployment configuration.

## Reconciliation of the reported deployed 3.3% / -3.7% outputs

The supplied deployment observation was **3.3% baseline / -3.7% conservative
stress / -7.0 percentage points**. Those numbers are not produced by the
current source configuration, and they are not reproduced by any of the 26
local Git revisions that contain the financial engine. No deployment release
SHA or archived configuration for that observation was available in the
workspace, so the exact external bundle that produced 3.3% and -3.7% cannot be
identified from this repository. The report therefore does not silently
replace those observed values with current values or claim that they are
mathematically correct under today's configuration.

The local version trace establishes the following:

| Source configuration / revision | Baseline IRR | Stress IRR | Difference |
| --- | ---: | ---: | ---: |
| Historical precision version `47b4dd4` | 15.599% | 10.323% | -5.276 pts |
| Pre-recalibration policy `35a978f` | 14.807% | -1.793% | -16.600 pts |
| Intermediate policy `3045325` | 15.178% | 9.173% | -6.005 pts |
| Current audited source, `64094ac` | 13.343% | 9.087% | -4.256 pts |

The historical 3.3% / -3.7% pair is therefore classified as an
**unidentified deployed-bundle/configuration result**, not as a current engine
result and not as a proven formula defect. Under the accepted current
configuration, the independent fixture proves the 13.343% / 9.087% pair
mathematically correct. A future deployment audit would need the published
release document or exact bundle SHA to attribute the older pair further.

## Contract fixture

The independent fixture is in
`src/model/stargateFinancialAudit.test.ts`. It owns its arithmetic and does not
call `calculateCashFlowModel`, `calculateNPV`, or the production payback helper
while constructing or measuring either baseline/stress case. It uses its own
IRR implementation for those case metrics and separately invokes the exported
production IRR function only to verify the invalid-sign behavior contract. The
test compares its results to the production output only after the independent
calculation is complete. Its schedule comparison covers every numeric annual
field: active months, utilization, revenue, electricity MWh and OPEX, water
gallons and OPEX, maintenance, labor, insurance, carbon, climate disruption,
backup-power OPEX, total OPEX, NOI, beginning and ending debt, interest,
principal, terminal value, terminal debt repayment, equity cash flow, and
cumulative equity cash flow. It also compares every stress-minus-baseline
delta, each displayed treatment multiplier, all return metrics, and the
production IRR behavior for a cash-flow series without a sign change.

All schedule currency values below are **USD millions** unless a unit is shown.
The project is 1,200 MW. Revenue uses 185 USD/kW/month, a 60% customer
utilization factor, and the five-year utilization ramp 60%, 80%, 92%, 92%,
92%. Year 1 has zero operating months because the 14-month modeled delay is
before operations. Electricity OPEX uses 8,760 hours/year and the 9.45% power
cost differential. Water uses 23 Mgal/year in the baseline, a 1.5x water-rights
cost multiplier, and a 1.5x source-escalation multiplier.

### Sources and uses and debt

| Item | Baseline | Active stress |
| --- | ---: | ---: |
| Entry value | 4,800.0 | 4,800.0 |
| Cooling CAPEX | 450.0 | 450.0 |
| CAPEX contingency | 80.0 | 125.0 |
| Total uses / CAPEX | 5,330.0 | 5,375.0 |
| Debt draw (60% of entry value) | 2,880.0 | 2,880.0 |
| Initial equity | 2,450.0 | 2,495.0 |
| Annual principal payment | 288.0 | 288.0 |
| Interest rate | 7.5% | 7.5% |
| Year 5 ending debt / terminal repayment | 1,440.0 | 1,440.0 |

Debt is drawn against entry value only, while equity funds all remaining uses.
Interest is calculated on beginning debt, principal is straight-line over ten
years, and the remaining Year 5 balance is repaid once at exit.

### Independent annual schedule

| Year | Baseline revenue | Baseline OPEX | Baseline NOI | Baseline equity CF | Stress revenue | Stress OPEX | Stress NOI | Stress equity CF |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0.0 | 0.0 | 0.0 | -2,450.0 | 0.0 | 0.0 | 0.0 | -2,495.0 |
| 1 | 0.0 | 0.0 | 0.0 | -504.0 | 0.0 | 0.0 | 0.0 | -504.0 |
| 2 | 1,598.4 | 571.6 | 1,026.8 | 544.4 | 1,598.4 | 623.5 | 974.9 | 492.5 |
| 3 | 2,205.8 | 817.2 | 1,388.6 | 927.8 | 2,205.8 | 900.9 | 1,304.9 | 844.1 |
| 4 | 2,205.8 | 847.2 | 1,358.6 | 919.4 | 2,205.8 | 944.6 | 1,261.2 | 822.0 |
| 5 | 2,205.8 | 879.0 | 1,326.8 | 2,388.0 | 2,205.8 | 991.8 | 1,214.0 | 2,027.3 |

Year 5 equity cash flow is `NOI - interest - principal + terminal value -
terminal debt repayment`. Terminal value is `max(0, Year 5 NOI × 2.2)` and is
2,918.9 baseline / 2,670.9 stress. There is exactly one terminal value and one
terminal debt repayment in each series.

## Independent return reconciliation

Both return cases use the same six annual levered equity cash flows shown
above. NPV discounts at the displayed 10% rate. MOIC is positive post-close
distributions divided by total negative equity cash flows, and payback linearly
interpolates the first cumulative-equity breakeven.

| Metric | Baseline | Active stress |
| --- | ---: | ---: |
| Levered project IRR | 13.3432% | 9.0870% |
| NPV @ 10% | $349.5M | -$91.7M |
| MOIC | 1.6180x | 1.3958x |
| Payback | 4.2355 years | 4.4145 years |
| Displayed IRR difference | \- | -4.2562 percentage points |

The independent IRR routine explicitly returns no result when a cash-flow
series has no negative/positive sign change. No unlevered return is calculated,
claimed, or displayed; the UI labels the result as project IRR and repeatedly
states that the economics are synthetic project-scenario outputs.

## Driver and treatment reconciliation

The active stress is not a prediction. It is the output of the existing
classification policy applied to synthetic assumptions:

| Driver | Baseline → stress treatment | Model line |
| --- | --- | --- |
| Electricity cost | 42.0 → 44.1 USD/MWh | Electricity OPEX |
| Annual cooling water | 23.0 → 34.5 Mgal/year | Water OPEX |
| Water escalation | 10.5% → 15.0% annual modeled rate | Water OPEX |
| Cooling CAPEX | 80.0 → 125.0 M contingency effect | Close CAPEX |
| Electricity escalation | 6.0% → 8.0% | Electricity OPEX |
| Carbon compliance | 20.0 → 24.0 USD M/year | Carbon compliance OPEX |
| Hazard probability | 5.0% → 7.5% | Climate disruption OPEX |
| Downtime cost | 2.85 → 3.2775 USD M/day | Climate disruption OPEX |
| Grid interconnection | 14 → 14 months total delay | Revenue timing; no delta |
| Core permitting | 10 → 12 months, still below 14-month grid delay | Revenue timing; no delta |

The independent fixture verifies the climate line as
`downtime dollars/day × hazard probability × 365 × operating utilization /
1,000,000`, once per operating year. It verifies that terminal value uses
Year 5 NOI once, and that terminal debt repayment uses Year 5 ending debt once.
Existing model attribution separately excludes terminal value and debt
repayment from recurring annual effects. The displayed -4.2562 point IRR
difference is therefore the result of the complete interacting stress schedule,
not the additive sum of single-input waterfall sensitivities.

## Evidence containment result

The audit fixture proves that:

- pending, rejected, unresolved, source-free, and otherwise non-accepted custom
  research is quarantined and cannot change financial output;
- decision gates and context indicators remain model-neutral;
- accepted custom research must carry the accepted research state;
- accepted records are semantically revalidated from raw value/unit data rather
  than trusting caller-supplied current-policy validation metadata; and
- curated defaults and custom-project containment remain separate.

The containment repair does not change the canonical Stargate baseline or active
stress returns. There are no before/after financial metrics to report because
the repaired inputs are invalid research states, not accepted Stargate inputs.

## Root-cause and formula-change decision

**Root cause:** The formula path was mechanically correct for the audited
contract. The unattractive stress economics are driven by synthetic assumptions
and their predefined conservative treatments: power cost/escalation, water
volume/escalation, carbon cost, cooling contingency, hazard probability, and
downtime cost. The 14-month grid delay controls both cases, so the permitting
classification does not create an additional timing penalty.

**Formula-change decision:** No Stargate financial formula changed. One
model-boundary repair was made to prevent non-accepted research activation and
to force semantic revalidation. This is a containment correction, not return
calibration and not an attempt to target an IRR.

## Release checks and limitations

The independent audit test covers the complete schedule, sources and uses,
debt draw, interest, principal, terminal value, terminal debt, equity cash
flow, IRR, NPV, MOIC, payback, invalid-sign behavior, units, one-time versus
recurring treatment, driver-to-line mapping, and containment boundary.

Check totals: the focused audit fixture passed **3/3** tests; the complete
unit/server suite passed **253/253** tests; production server tests passed
**2/2**; and the relevant financial browser checks passed **18/18** across
desktop and mobile projects. Typecheck and production build passed. No checks
were removed, weakened, or skipped.

Remaining limitations are intentional: transaction terms, tariffs, water
consumption, water rights, downtime loss, exit multiple, discount rate, and
other underwriting inputs remain synthetic or unresolved as labeled. The
curated browser may apply a separately labeled EIA electricity overlay after
provider settlement; that does not turn the project economics into reported
Stargate transaction terms. These are project returns, not issuer or portfolio
returns, and accepted evidence remains separate from synthetic assumptions.

Files changed:

- `src/model/cashFlowEngine.ts`
- `src/model/stargateFinancialAudit.test.ts`
- `STARGATE_FINANCIAL_ENGINE_AUDIT.md`

No deployment, publication, merge, or production release was performed.