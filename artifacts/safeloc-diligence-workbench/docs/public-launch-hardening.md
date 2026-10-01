# SafeLoc public-launch hardening delivery

Date: 2026-10-01. This report covers Task #334, including its preserved earlier work and the resumed hardening. No acquisition, identity, eligibility, Expected Evidence, financial calculation, transmission policy or frozen proof schema was changed by this resumed work.

## Public states and recovery

The UI-only presentation adapter supports these exact labels:

- Researching
- Partial results available
- Search incomplete
- Source blocked
- Provider busy / rate-limited
- No qualifying evidence located
- Evidence likely non-public
- Research failed safely
- Research results available for completed, useful results

An unrun, failed, timed-out or unknown legacy category remains incomplete. Failure/access metadata outranks a recorded negative outcome. Non-public language requires an explicit canonical metadata code on a completed category; an empty result never establishes confidentiality.

Useful retained passages and source links remain visible after a failed explicit refresh. Missing dates and category details are explained rather than invented. Retained passages, unresolved proposals, accepted evidence and model inputs remain separate. Public errors and the technical disclosure use curated explanations, not raw provider bodies, stack traces, token counts, model names or JSON dumps. Existing audit access rules are unchanged.

Manual retry preserves the original request context. Active work and known bounded cooldowns suppress redundant starts. Bulk AI analysis stops at its first capacity/rate-limit rejection and names unprocessed items; it does not continue through the remaining items, add paid retries or increase polling.

## Admission and existing budgets

Custom research POSTs use a conservative, nonqueued PostgreSQL session advisory lock before entering the unchanged research handler. Concurrent arrivals, unavailable admission and uncertain acquisition timeouts fail closed without invoking research. Acquisition and release operations are bounded; uncertain sessions are destroyed rather than returned to the pool. Pre-work cancellation and handler errors release admission.

Cached GETs bypass both acquisition and initialization of admission controls. A cached POST that starts a background refresh retains a bounded, unreferenced lease rather than releasing admission at the HTTP response boundary. Release is idempotent.

Completion review found that the first safeguard observed only the framework JSON helper, while the real research handler writes serialized JSON directly through the response's `end` method. The server entry now observes both paths before forwarding output, preserves native response arguments and restores response methods afterward. The regression uses the real research handler, a stale retained cache and held mocked provider work; a concurrent arrival must be rejected without another handler/provider invocation, and admission remains held through the conservative lease boundary. No acquisition module or proof schema was changed to make this correction.

Existing request limits, provider gates, provider budgets and deadlines remain intact. The shared daily spend reservation applies to **AI evidence analysis**, not to custom research. Busy messages promise neither capacity nor a queue position.

The offline admission tests use an injected shared pool. Real cross-process PostgreSQL disconnect/worker-shutdown validation is a separate proposed follow-up; no live database admission canary was run here.

## Financial provenance

The standalone presentation helper exposes:

- **Sourced** for defensible dossier lineage or strictly accepted, eligible custom source lineage.
- **Derived from sourced evidence** for an explicitly sourced inference/calculation.
- **Illustrative assumption** for synthetic default inputs.
- **Unresolved** where accepted source lineage is absent.

Pending custom proposals do not become sourced model inputs merely because an AI source classification is verified. Accepted custom evidence is not automatically called synthetic. Explicitly derived accepted custom inputs retain their derived label.

Synthetic primary-case returns and optional provider sensitivities stay distinct. No new financial mappings, calculations, transmission controls or acceptance/history schema were introduced. A material-input coverage denominator was not reliably available, so no percentage, score or fabricated coverage count was added.

## Reviewed-example seam

`ReviewedShowcaseCatalog` is an explicitly supplied catalog/state/route-callback seam. Home never builds reviewed examples from the canonical seed list and never substitutes the canonical loader for a missing reviewed-catalog callback. No active Stargate or Red Oak showcase CTA is supplied by default.

Without eligible supplied snapshots, Home shows a local empty/loading/unavailable state alongside **Analyze Any Project — Beta**. Opening an unavailable example performs no research, refresh, canonical write or fallback acquisition. Canonical workbench discovery remains separate from public-review approval.

Task #333 integration must supply validated reviewed entries and a cached-detail routing callback. Its validator, catalog/store backend and public-review eligibility framework were not recreated here. No real example was fabricated, approved or published.

## Mobile and malformed-record behavior

The existing workbench layout is preserved. Public input, progress, retained results, source links and reviewer controls use wrapping/minimum-width safeguards and scoped recoverable boundaries. Empty arrays, absent categories/dates, unavailable storage and legacy missing presentation fields have safe defaults. Older retained findings without assessment/eligibility fields display ambiguous/unresolved presentation rather than throwing. Missing source links are explicitly unavailable.

Desktop and 402-pixel mobile mocked journeys cover empty/unavailable/seeded Home, busy manual retry, bulk capacity stops, retained sources after refresh failure, sparse older records and unresolved model-neutral custom projects. Mobile cases assert no horizontal page overflow.

## Files changed

All paths below are relative to `artifacts/safeloc-diligence-workbench`, except the memory notes.

### Resumed changes

- `server/index.ts`
- `server/publicLimits.ts`
- `server/researchAdmission.test.ts`
- `src/components/ResearchSearchAudit.tsx`
- `src/components/RetainedResearchFindings.tsx`
- `src/components/ReviewedShowcaseEntries.tsx`
- `src/components/error-boundary.tsx`
- `src/pages/Home.tsx`
- `src/model/financialInputProvenance.ts`
- `src/model/financialInputProvenance.test.ts`
- `src/services/publicResearchPresentation.ts`
- `src/services/publicResearchPresentation.test.ts`
- `src/services/publicPresentationRendering.test.ts`
- `src/services/clientCooldown.test.ts`
- `tests/ai-evidence.spec.ts`
- `tests/custom-project-research.spec.ts`
- `tests/custom-project-research-batch1.spec.ts`
- `tests/home-public-resilience.spec.ts`
- `tests/offline-provider-reads.ts`
- `tests/public-launch-regression.spec.ts`
- `docs/public-launch-hardening.md`
- Six PNG captures in `screenshots/public-launch/`
- `.agents/memory/MEMORY.md` and `.agents/memory/public-launch-boundaries.md` at workspace root

### Earlier Task #334 seams preserved

The resumed work preserves the earlier additive changes in `src/App.tsx`, `src/components/Shell.tsx`, `src/components/ResearchHandoffSummary.tsx`, `src/pages/EvidenceRoom.tsx`, `src/pages/FinancialMateriality.tsx`, `src/services/researchProjectService.ts`, `src/services/aiEvidenceService.ts`, `src/services/clientCooldown.ts`, their focused tests and the package test command.

The preexisting baseline commit also contains other tasks' Expected Evidence and financial-transmission implementations. Those changes are **not** claimed as Task #334 work.

## Offline verification

- Package typecheck: passed.
- Production build: passed; existing large-chunk warning remains.
- Focused unit/server/presentation/service tests: **68 passed, 0 failed**, rechecked after synchronization and the production response-boundary correction, including the real-handler stale-cache admission regression.
- Incoming main's Expected Evidence compatibility check after synchronization: **11 passed, 0 failed**.
- Focused Playwright selection before synchronization: **28 passed, 0 failed**, across desktop and mobile. The affected sparse/model-neutral journey was rechecked after synchronization on both viewports.
- `git diff --check`: passed.
- Provider-backed endpoints are mocked/blocked in the owned browser specs; scenario routes override safe defaults. New public specs intercept every API request.
- Capture runs mocked all APIs and blocked all external traffic.

Focused unit command:

```sh
pnpm --filter @workspace/safeloc-diligence-workbench exec tsx --test \
  src/services/publicResearchPresentation.test.ts \
  src/services/publicPresentationRendering.test.ts \
  src/services/clientCooldown.test.ts \
  src/model/financialInputProvenance.test.ts \
  src/services/aiEvidenceService.test.ts \
  server/publicLimits.test.ts server/researchAdmission.test.ts \
  src/services/researchProjectService.test.ts
```

Final browser selection:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:25519 \
pnpm --filter @workspace/safeloc-diligence-workbench exec playwright test \
  --config playwright.config.ts \
  tests/home-public-resilience.spec.ts tests/public-launch-regression.spec.ts \
  tests/custom-project-research.spec.ts tests/custom-project-research-batch1.spec.ts \
  tests/ai-evidence.spec.ts \
  --grep 'Home |busy research|bulk AI analysis|failed explicit refresh|sparse older research|handoff concise|provider timeout|technical limitation|same-project retry|cancels and closes|manual-review errors'
```

### Baseline failures and deliberately deferred checks

- The earlier full unit run had seven `expectedEvidence.test.ts` failures. All seven reproduce in an isolated archive of the pre-synchronization committed baseline, with `Stage profile provenance requires project scope.` The newer incoming main fixes these fixtures/contracts: its 11 Expected Evidence tests now pass. No Task #334 change was made to those owned files to bypass failures.
- The existing browser test `hands a handler-produced partial response to Project Reality and Advisor Brief` expects eight injected provider calls but observes zero. This also reproduces in the isolated committed baseline before browser navigation. No Task #332 acquisition module was changed.
- The existing `financial-impact-chain` origin assertion still expects `Sourced` / `Source classification` after a Missing Evidence override, while the current presentation is `Unresolved` / `Classification`. The financial-focused file was left untouched during this resumption for Task #331 reconciliation; this is not claimed to be a passing check or a proven unrelated calculation failure.
- The earlier full browser run exceeded its time budget. The full provider-free suite was deliberately **not** rerun after the user's instruction to defer it until the Expected Evidence / transmission branches are stable enough for attribution.
- The restarted development workflow serves successfully but reports missing proof-ledger columns on its current database. No migration or connection change was attempted here; Task #339 owns that reconciliation.

Synchronization conflicts were resolved by preserving incoming main's complete Expected Evidence and financial-model files, with no diff against main for those seven files. The package test command retains both main's financial decision-adapter check and this task's admission check. Launch-facing changes and captures were preserved.

No live/paid research calls, live acquisition canaries, deployment, Git pushes or production snapshot publication were performed.

## Captures

All captures are isolated fictitious offline fixtures, not public project results:

- `screenshots/public-launch/home-empty-desktop.png`
- `screenshots/public-launch/home-empty-mobile.png`
- `screenshots/public-launch/sparse-retained-desktop.png`
- `screenshots/public-launch/sparse-retained-mobile.png`
- `screenshots/public-launch/failed-refresh-retained-desktop.png`
- `screenshots/public-launch/failed-refresh-retained-mobile.png`

The saved Home mobile capture was also inspected through the running preview's static-image route, without bootstrapping a live-data session.

## File-level overlap and deferred integration

| Integration | Shared files / seams | Boundary and remaining work |
| --- | --- | --- |
| #329 Expected Evidence | `src/pages/EvidenceRoom.tsx`, `src/components/ResearchHandoffSummary.tsx`, `src/components/Shell.tsx`, `src/App.tsx`; category presentation consumes existing metadata | No Task #334 taxonomy/profile/evaluator changes. Incoming main fixes the older profile-fixture failures; all 11 focused compatibility tests pass after synchronization. Broader reviewer integration remains separate. |
| #330 financial transmission | `src/pages/FinancialMateriality.tsx`, `src/pages/EvidenceRoom.tsx`, `src/components/Shell.tsx`, `src/model/financialInputProvenance.ts` | Only presentation lineage is addressed. No edits during resumption to `FinancialMateriality.tsx`, `DiligenceContext.tsx`, `financialTransmission.ts`, `cashFlowEngine.ts`, `financialScenarioContract.ts` or frozen proof files. |
| #331 reviewer workflow proof | The preceding financial/reviewer UI files and `tests/financial-impact-chain.spec.ts`, `tests/batch-3-financial-transmission.spec.ts`, `tests/routing-history.spec.ts`, `tests/canonical-dossiers.spec.ts` | Integrate acceptance/history/expectation controls, reconcile changed labels and obsolete default-showcase CTA assumptions, then run the full provider-free suite. Preserve pending/no-op model neutrality and accepted-custom provenance. These financial-focused test files were not edited during resumption. |
| #333 showcase framework | `src/pages/Home.tsx`, `src/components/ReviewedShowcaseEntries.tsx`, `src/App.tsx`, canonical discovery/detail service boundaries | Supply validated catalog state and cached snapshot routing through the new optional hook. Do not use canonical seed membership as approval, and do not introduce research fallback. Backend/store/validator/public-review eligibility remain #333's work. |
| #332 acquisition | `server/index.ts` entry wrapper only | No acquisition-module edits, retries, spend/deadline/concurrency increases or scheduling changes. The baseline direct-handler fixture discrepancy remains separate. |
| #339 development ledger target | Existing startup/database boundary | Integrate that task's verified setup separately; no schema repair is bundled into this UI/admission delivery. |