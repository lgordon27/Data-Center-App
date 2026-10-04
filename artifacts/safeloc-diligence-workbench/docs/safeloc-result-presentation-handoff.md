# SafeLoc result presentation handoff

## Source and scope

- Source revision at final verification: `e94fa666139973307c3203e30d8f39a950dc318a` plus the final presentation corrections. Original pre-presentation source: `eae94f5774297a44cc5a0e6dce143d92aebad995`.
- Reviewed baseline `f571e8e35837c41f76b796bc36477b708a684345` is an ancestor. Its merged history includes evidence-conversion instrumentation (#359), contextual identity repair (#366), and empty-category handling (#365). Later source changes were retained.
- Presentation-only implementation. No live research, paid provider calls, document refetches, deployment, push, database migration, research-service normalization, financial calculations, or eligibility-policy changes.

## Changes

- One compact, non-sticky project header and one authoritative research status; identities, telemetry, counters and model basis live in disclosures.
- Project Reality and Advisor Brief use the same display interpretation and shared result component: established structured evidence, retained reporting/context, unresolved assessment/applicability, and explicitly accepted financial inputs remain distinct.
- A retained passage without a matching canonical field is described as a mapping gap, separately from absent source text, unsupported quotation and invalid value/unit. Quotation receipt comparisons use the existing policy's collapsed whitespace/case semantics; null-quotation rejection receipts are preserved as missing admitted text, not discarded as missing fields. Generated source-free conflict prose is not promoted into an attributed finding.
- Supported text/excerpts are shortened only for display. Source, available publication date, scope and validation level remain reviewable. Exact stored passage bodies are available in native disclosures; nothing writes shortened text back to evidence or hashes.
- Initially three unresolved entries, expandable in recorded order without a materiality ranking. Missing assessment uses “Not established in this run,” including “Not assessed: no admitted passage text.” Expanded Community content uses the same known assessment state, not an unqualified documentation-absence heading. Reviewed snapshots are not completed live research; unevaluated financial readiness is “Not assessed.”
- Illustrative capacity and financial review remain behind opt-in. Partial runs can review actual candidates when a model and modeled scope are available. Unavailable models offer no financial preview/acceptance controls; earlier decisions and sources remain reviewable. Existing qualifying capacity acceptance can enable the synthetic model without a new eligibility rule.
- MW/GW capacity stored under the duration field is flagged as an underlying field mismatch, never converted or rebound. Repeated URL/normalized-passage ledger entries are not described as duplicate network fetches.

## Validation

- **44 focused tests passed**:
  `pnpm --filter @workspace/safeloc-diligence-workbench exec tsx --test src/model/researchResultPresentation.test.ts src/model/conferenceEvidence.test.ts src/model/conferencePresentation.test.ts src/model/sessionFinancialTransmission.test.ts`
- **Typecheck passed**:
  `pnpm --filter @workspace/safeloc-diligence-workbench run typecheck`
- **Build passed**:
  `pnpm --filter @workspace/safeloc-diligence-workbench run build`
  Existing large-bundle warning remains.
- **Six desktop/mobile browser cases covered successfully** in `tests/compact-results.spec.ts`: two reviewed-snapshot checks passed initially; four partial-results/financial checks passed after correcting a hash-only seed navigation to reload the saved session. No remaining application failure was reported.
- Exact passage expansion, unresolved-list expansion, vertical scrolling, horizontal-overflow checks, unavailable-model gating, valid partial candidate acceptance, and session-only history after reload checked in the actual managed preview.
- After completion-review corrections, the two partial-result desktop/mobile cases passed again with explicit assertions on expanded not-assessed Community content. New focused regressions cover multiline supported quotations and null-quotation rejection receipts.
- `git diff --check` passed. Workflow is running. Startup still warns about missing legacy database schema columns; unchanged and outside this task.

## Screenshots

Comparable before/after captures:

- [Desktop before](../../../screenshots/safeloc-results-before-desktop.jpg)
- [Desktop after](../../../screenshots/safeloc-results-after-desktop.jpg)
- [Mobile before](../../../screenshots/safeloc-results-before-mobile.jpg)
- [Mobile after](../../../screenshots/safeloc-results-after-mobile.jpg)

Saved partial result with exact source expansion:

- [Desktop expanded](../../../screenshots/safeloc-results-after-desktop-chromium-expanded.png)
- [Mobile expanded](../../../screenshots/safeloc-results-after-mobile-chromium-expanded.png)

## Shared-contract handoff

Task B is #368. Its plan was updated with the presentation boundary and exact existing receipts used by this work. No shared engine/service file or contract was edited here, so no shared-file serialization is outstanding.

Underlying conversion/admission fixes remain Task B's responsibility. This presentation deliberately leaves incorrectly typed records and unresolved mapping/evaluation receipts unchanged. If Task B changes category outcome/reason or mapping contracts, align the display helper and focused fixtures explicitly rather than inferring new support or readiness. There is no contract change required to complete this presentation task.