# Offline Validation and Reviewed Showcase

## What changed

The framework is deliberately separate from production research and the canonical dossier store:

- `server/fixtures/offline-validation-matrix.json` contains five scoped validation cases. It reuses retained repository passages where available and labels regression-only profiles illustrative.
- `server/offlineDossierValidation.ts` defines explicit saved-run and saved-dossier adapters, a validation-only assertion model, granular rule findings, deterministic reports, and provider-free matrix baselines.
- `server/offlineValidationCli.ts` runs the matrix or validates a supplied saved-run/saved-dossier envelope.
- `server/showcaseDossierStore.ts` reads a fail-closed reviewed-snapshot registry and has a separate explicit snapshot-replacement method. Reads never call that method.
- `server/showcaseDossierApi.ts` and `server/index.ts` expose GET-only catalog/detail routes at `/api/showcase` and `/api/showcase/:slug`.
- `server/showcase-registry.json` intentionally contains an empty catalog. Existing seed dossiers are not evidence of human review.
- `server/offlineDossierValidation.test.ts` and `server/showcaseDossierApi.test.ts` cover matrix and mutation cases, financial acceptance, incomplete searches, empty catalog reads, and test-fixture rejection.
- `package.json` adds `validate:offline` and `test:offline` and includes both focused suites in `test`.
- This document records fixture provenance, unknown facts, rules, commands, test results, showcase integration, and the file/interface comparison with Tasks #329–331.

No proof-contract schema, Expected Evidence policy, transmission mapping, research acquisition, canonical dossier, or reviewer UI was changed. No provider, network, deployment, publication, or canonical write is used by these commands or showcase reads.

## Matrix and provenance

| Case | Retained basis | Scope controls and intentionally unknown facts |
| --- | --- | --- |
| DataBank Red Oak / DFW10 | Retained secondary article in `server/fixtures/red-oak-retained.txt`, copied with source/passage IDs and attribution. | 480 MW is the planned eight-building campus; 180 MW is the first three buildings together; neither is DFW10-only capacity. The reported $301 million registered interior build-out cost is an estimate, not actual spend or whole-project capex. Current operating capacity, DFW10 MW, actual spend, and article publication/access dates are unknown. The existing Red Oak Expected Evidence profile, including its Abilene location and 500 MW value, is kept only as an illustrative regression input. |
| Stargate Abilene | Retained Crusoe passage and retained water-review note in `server/dossiers.seed.json`. | First-phase operating status is dated to the company announcement; eight buildings remain a planned campus scope. Exact current MW, facility water rights/allocation/consumption, expansion economics, contract economics, and tenant concentration are not asserted. The Expected Evidence profile is illustrative, not ground truth. |
| Microsoft El Mirage / non-Texas hyperscale | Retained 2019 municipal announcement plus the later regional Microsoft water note in `server/dossiers.seed.json`. | The 150 acres and 254,000 square feet are announced site/building areas, not IT capacity. Regional renewable, jobs, and water statements are not allocated to this campus. Present operating status and exact-campus power/water remain unknown. The Virginia/180 MW profile is illustrative and not an El Mirage fact. |
| Small colocation | Existing Expected Evidence regression profile only. | Identity, location, capacity, cost, dates, utility terms, leases, financing, and tenant details are not asserted. Its 8 MW/Seattle inputs remain test-only. |
| Sparse/unresolved | Synthetic empty-evidence case. | Identity, phase, power, water, capex, and every other unsupported dimension remain unknown. Empty evidence is not a completed search or a negative finding. |

The source `publishedAt` and `accessedAt` values in retained cases are distinct from matrix research-as-of dates and assertion dates. Where repository material has no article publication or access date, the fixture records `null`; it does not substitute the dossier date. Human review dates exist only in a future public showcase entry, not in these validation fixtures.

The fixture matrix covers the assertion kinds needed for identity, developer, capacity/area, dates, capex, phase, source retention, forbidden claims, unknown dimensions, scope traps, and estimate-versus-actual. Each assertion carries its scope, date, source/passage fixture path and attribution, tolerance where numeric, and severity. Unknown ground truth produces `NOT_ASSERTED`, never a factual correctness pass.

## Saved input format

The adapter accepts one of two explicit JSON envelopes. Both carry events in the unchanged frozen proof-contract shape:

- `adapter: "safeloc-offline-saved-run-v1"`
- `adapter: "safeloc-offline-saved-dossier-v1"`

Both require `schemaVersion: 1`, an explicit `origin` (`saved-live-run`, `retained-repository-fixture`, or `test-only-illustrative`), `runId` (nullable), `researchAsOfDate` (nullable), a canonical scope-qualified `project`, `proofEvents`, `userDecisions` (use `[]` when absent), and structured `claims`.

Each claim requires `claimId`, `target`, `kind`, `text`, `scope`, `asOfDate` (nullable), `sourceEvidenceIds`, and `retainedPassageIds`. Optional fields include `value`, `unit`, `valueStatus`, `dimension`, `attributed`, `illustrative`, `derived`, `derivationPolicy`, `searchResolution`, and `assertionRef`. Citations must resolve to proof events carrying retained passages and source IDs. This is an annotation adapter, not a new proof schema or an automatic natural-language parser.

Legacy dossier JSON is not guessed into proof events. Export it through an explicit adapter envelope first; malformed or noncanonical inputs fail with an error instead of receiving inferred facts. The validator consumes current proof policy/version interfaces and reports unsupported derived outputs because the frozen contract records descriptive proposals, not reproducible financial model results.

## Rules and report shape

Findings are individual rule results, sorted by `BLOCKER`, `MAJOR`, then `MINOR`, then stable rule/subject text. There is no aggregate score.

- `BLOCKER`: wrong identity, unsupported or materially promoted claim/number, missing source/passage, unsafe model-active input, or uncheckable known state.
- `MAJOR`: misleading scope, date, unit/value status, incomplete-search-as-not-found, conflicting search result, unexpected claim, or unverifiable proposal support.
- `MINOR`: presentation-level supporting detail.

The machine report includes all findings; critical assertion outcomes; not-asserted facts; unexpected claims; unsupported numbers; incomplete search dimensions; and every transmission proposal with its status, support level, and disposition. The readable checklist presents the same content with blockers first. `PASS`, `FAIL`, `REVIEW`, and `NOT_ASSERTED` remain distinct. Honest sparse Unknown cases pass applicable invariants; an unknown dimension does not validate any claim made about it.

The financial checks distinguish rejected/withdrawn proposals from model-active accepted inputs. An accepted input is a blocker unless it can be tied to a current-policy accepted proposal, same-scope actual verified eligible evidence with retained passage/source, matching value and unit, and an authenticated human acceptance decision targeting that proposal. Rejected unsupported proposals remain non-active. Missing support is reported as unverifiable, not silently accepted.

## Commands

Run the five-case matrix and print the readable checklist:

```sh
pnpm --filter @workspace/safeloc-diligence-workbench run validate:offline
```

Machine-readable matrix report:

```sh
pnpm --filter @workspace/safeloc-diligence-workbench run validate:offline --format json
```

Validate a saved run or dossier envelope, optionally against a named matrix case:

```sh
pnpm --filter @workspace/safeloc-diligence-workbench run validate:offline --input /path/to/saved-run.json --format json
pnpm --filter @workspace/safeloc-diligence-workbench run validate:offline --input /path/to/saved-run.json --case databank-red-oak-dfw10
```

Exit codes: `0` means no `FAIL` findings (review and not-asserted results may still be present); `1` means at least one failed invariant; `2` means malformed input, matrix, or invocation. Reports are written to standard output and are not registered as mutable Library artifacts.

Focused tests and full provider-free package checks:

```sh
pnpm --filter @workspace/safeloc-diligence-workbench run test:offline
pnpm --filter @workspace/safeloc-diligence-workbench run typecheck
pnpm --filter @workspace/safeloc-diligence-workbench run test
```

## Verification results

Final focused tests: 16 passed, 0 failed. Package typecheck passed. The five-case machine-readable command completed successfully.

The full package suite ran with `strace` blocking `connect`, `sendto`, and `sendmsg` syscalls. It completed 530 tests: 523 passed and 7 failed. All seven failures are in the existing, concurrently edited Expected Evidence suite (`src/model/expectedEvidence.test.ts`), outside this task's changed files: six fail with `Stage profile provenance requires project scope.` and one expected a different identity/scope error. These correspond to the pre-existing in-progress Expected Evidence work; they are not attributed to the offline validator or showcase changes. The worktree therefore remains not fully green.

An attempted network namespace (`unshare -n`) was unavailable in this container, so the full-suite run used syscall error injection instead. No provider-backed validation or live research was invoked.

The restarted development workflow is running and the home page loaded. Startup diagnostics still report missing proof-ledger/user-decision columns in the selected development database; this task made no schema or migration changes. The file-backed showcase endpoint remained available and returned HTTP 200 with the intentionally empty catalog.

## Showcase boundary and integration interface

The current registry is empty because no retained or seeded dossier has qualifying explicit human-review provenance. Test fixtures are marked `test-only-illustrative` and are refused by the production repository; they do not carry live research or provider-cache metadata.

- `GET /api/showcase` returns `{ "dossiers": [...] }` with slug, display name, canonical project ID and project scope, research-as-of date, explicit `reviewed` state and human review provenance/date, snapshot reference, origin, version, `illustrative: false`, and the `cached example` presentation label.
- `GET /api/showcase/:slug` returns `{ "dossier": { ...catalogEntry, "snapshot": ... } }`. The snapshot keeps source publication and access dates separate from research-as-of and review dates.
- Malformed slugs return `400`; absent, unreviewed, illustrative, provenance-deficient, or snapshot-missing slugs return `404`; an unavailable registry returns `503`.
- Only GET handlers are mounted. There is no research/refresh, provider, canonical write/import, or fallback path. Listing and opening read only the showcase registry and snapshot files.
- `FileShowcaseDossierRepository.replaceReviewedSnapshot` is a future explicit replacement seam. It checks review/provenance/scope/version metadata and atomically writes only showcase files. It is not an HTTP route and is never called by catalog/detail reads.

To validate later saved live output, export an explicit saved-run or saved-dossier envelope and run the `--input` command above. To publish a showcase example later, require a human review record and retained source passages first, then explicitly replace the snapshot through the showcase publisher seam. Neither step runs research as a side effect.

## Task integration and interface mismatches

| Related plan | File-level overlap and current interface |
| --- | --- |
| #329 — Build Full-Taxonomy Expected Evidence | None of this framework's edited files overlap the plan's listed files (`evidenceSemanticPolicy.mjs`, source-validation/claim-verification modules, research acceptance/registry, research service, or canary note). The current worktree separately has in-progress edits to `src/model/expectedEvidence.ts`, its test, and `server/fixtures/expected-evidence-cases.json`; this framework did not edit those files. It refers to the expected-evidence fixture path only as an illustrative regression provenance label, never as truth. The plan says twelve dimensions, but the frozen contract has thirteen including `project-identity`; this validator uses all thirteen. |
| #330 — Gate Evidence into Financial Returns | None of this framework's edited files overlap the plan's listed `cashFlowEngine.ts`, `financialScenarioContract.ts`, `evidenceSemanticPolicy.mjs`, or `DiligenceContext.tsx`. The current worktree separately has in-progress edits to the first two and to `financialTransmission.ts`/its tests. This framework reads `financialTransmission.ts` as the current target/formula/policy interface but does not edit it, change mapping rules, or calculate returns. The plan's first slice names three destinations; the current interface exposes eleven. Validation follows that current interface and does not narrow or expand it. |
| #331 — Prove the Reviewer Workflow | None of the plan's listed `EvidenceRoom.tsx`, `ResearchSearchAudit.tsx`, `researchProjectService.ts`, or `sessionLog.ts` files were edited. The adapter can consume frozen proof events and persisted user decisions when explicitly exported; it is not wired into the reviewer UI or a live-run exporter. The showcase API is not the reviewer workflow and never starts research. Its separate server route registration is in `server/index.ts`. The plan's five-archetype UI review-to-return matrix is broader than this backend validator matrix. |

The read-only shared dependencies are `safelocProofContract.ts` and the current `financialTransmission.ts` interface. No implementation file listed in #329–331 is changed by this framework; the noted concurrent Expected Evidence/financial files are preserved. To validate future live outputs, their producer path must explicitly emit the adapter envelope; do not silently treat matrix or test fixtures as production answers.

## Coverage limits

This is a deterministic saved-output validator, not source retrieval, a natural-language truth verifier, or a replacement for human diligence. A passage can support only its retained wording, attribution, date, and scope; the harness cannot independently authenticate publisher statements or acquire missing facts. Research completeness is only as good as the saved search assessments. It cannot reconstruct omitted events, external source redirects, or model results absent from the frozen contract.
