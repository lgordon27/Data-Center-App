# Expected Evidence integration interface

## Boundary and versions

Import the public interface from `src/model/expectedEvidence.ts`. The evaluator consumes the frozen SafeLoc proof contract; it does not change that contract, append ledger events, retrieve sources, call providers, update financial inputs, or change the UI.

- `SAFELOC_EXPECTED_EVIDENCE_PROFILE_VERSION`: **1**, the input-profile schema.
- `SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION`: **2**, the assessment rules.
- `ExpectedEvidenceProfile`: scope-qualified project identity plus stage, scale, project type, jurisdiction, and cooling design.
- `ExpectedEvidenceEvaluation`: both versions, project/profile, one result for every canonical proof dimension, and two maturity results.
- `evaluateExpectedEvidence(profile, projection)`: synchronous, deterministic assessment.
- `validateExpectedEvidenceProfile(profile)`: runtime profile validation, also invoked by the evaluator.
- `expectedEvidenceApplicabilityStateKey(dimension)`: canonical consumer key for an explicit dimension-applicability state.

The assessment includes all twelve diligence dimensions and `project-identity`. Assessment versions are independent of the frozen ledger schema and event versions. Consumers should retain the profile and projection knowledge-time cutoff with the returned versions to reproduce an assessment.

## Inputs

Supply an `ExpectedEvidenceProfile` and a `ProofLedgerProjection` derived through the frozen contract's `deriveProofLedgerProjection`. Scope must match across the profile, each provenance record, observations, search assessments, states, and projection events. A different campus, phase, or facility is rejected, not silently combined.

Each profile signal explicitly declares `known` or `unknown`. Known signals require a valid value, dated scope-qualified provenance, a rationale, and a provenance kind of `sourced`, `derived`, or `illustrative`. Sourced and derived signals require source references. Unknown signals carry no value, source references, or as-of date. Illustrative profiles guide expectations only; they are not evidence.

```ts
import {
  evaluateExpectedEvidence,
  type ExpectedEvidenceProfile,
} from "../src/model/expectedEvidence.js";
import { type ProofLedgerProjection } from "../src/model/safelocProofContract.js";

export function assessForReview(
  profile: ExpectedEvidenceProfile,
  projection: ProofLedgerProjection,
) {
  return evaluateExpectedEvidence(profile, projection);
}
```

This seam requires no database or provider connection. The caller supplies the retained, historical projection; the evaluator does not load it.

## Reading dimension results

Keep these fields separate:

| Field | Meaning and consumer rule |
| --- | --- |
| `expectation`, `decisionReason`, `expectedClaims` | Profile-dependent `expected`, `not-expected`, or `unknown` decision, with its reason and claim requirements. Not a finding that a document exists. |
| `likelyPublicConfidential` | Typical disclosure posture, not access status or proof that a search failed. |
| `jurisdictionSourceGuidance` | Suggested authority levels and source kinds; never executed-query telemetry or proof of absence. |
| `ledgerApplicability`, `applicabilityState` | Explicit recorded applicability, distinct from a profile-derived expectation. Unknown is not Not Applicable. |
| `search`, `searchState` | Retained search assessment and completeness. No assessment yields consumer sentinel `not-run`; this does not introduce a new stored search state. Preserve blocked, failed, and partial states and their recorded reasons. |
| `evidenceResolution` | Consumer summary: `not-assessed`, `supported`, `searched-not-found`, `conflicting`, or `not-expected`. This is not a competing persisted ledger vocabulary. |
| Evidence collections | Retained observations separated into current non-conflicting `evidence`, `staleEvidence`, `futureEvidence`, `undatedEvidence`, `supersededEvidence`, `conflictingEvidence`, and `unsupportedEvidence`. Keep their source quality, eligibility reasons, passages, dates, and IDs available for inspection. |

Only a **complete** retained search explicitly resolving `searched-not-found` can produce that negative finding. Incomplete searches cannot. Stale, future, undated, superseded, or ineligible observations remain visible and prevent a bare negative finding from replacing unresolved retained evidence. A conflict remains distinct from missing evidence.

`supported` means the projection contains current eligible evidence for the dimension; it does **not** certify that every expected claim has been covered, quantify a model effect, or authorize a financial input. Later consumers must check claim-specific passage support, quantity, units, scope, and acceptance independently.

Freshness uses the observation's as-of date, falling back to its publication date, relative to the projection's `asOfRecordedAt`. Future as-of, publication, observation, or effective dates disqualify current support. Access time, publication time, claim-period scope, and knowledge time must not be substituted for one another.

## Limited maturity results

`maturity.facilityLifecycle` reads only `facility-lifecycle` state and supporting `construction-phasing` observations. `maturity.powerDelivery` reads only `power-delivery` state and supporting `power-grid-interconnection` observations. No maturity ladder is assigned to other dimensions.

A recognized recorded stage is not sufficient. Every referenced supporting observation must be present, correctly scoped and dimension-matched, eligible, current, actual, non-conflicting, non-superseded, and classified as `Verified Evidence` or `Management Assertion`. Its claim/value/qualifier/retained passage must affirm the recorded stage, rather than merely announce or forecast it. Source quality remains on the observation; maturity does not replace it.

Missing or unsupported state returns `unknown` with reasons. Explicit Not Applicable returns `not-applicable` without inventing an early stage. The evaluator assesses the projected state rather than choosing the highest historical stage, allowing recorded regression and supersession.

## Later review and transmission consumers

Review consumers may display these results with the original search and evidence records. Do not convert planned source guidance to executed searches, incomplete searches to absence, illustrative inputs to facts, or profile exclusions to recorded Not Applicable.

Transmission consumers may use the assessment to identify evidence requiring further qualification. Assessment output alone must not mutate accepted model inputs or returns. Proposal creation, reviewer decisions, financial mapping, and authenticated persistence belong to their separate downstream interfaces.

## Offline coverage

`server/fixtures/expected-evidence-cases.json` contains explicitly illustrative Red Oak, Stargate Abilene, non-Texas hyperscale, small colocation, and sparse-evidence profiles. `src/model/expectedEvidence.test.ts` builds retained-passage ledger fixtures and checks the full taxonomy, version/provenance validation, scope rejection, profile-dependent claims, confidentiality, incomplete/blocked search, insufficient/conflicting evidence, freshness, explicit Not Applicable, regression, and supersession.

Run without provider calls:

```sh
pnpm --filter @workspace/safeloc-diligence-workbench exec tsx --test src/model/expectedEvidence.test.ts
pnpm --filter @workspace/safeloc-diligence-workbench run typecheck
```