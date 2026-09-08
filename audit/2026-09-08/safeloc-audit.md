# SafeLoc Diligence Workbench — read-only release audit

Audit date: September 8, 2026. Local source revision: `86e8d22365e2a6eea8e4b231390698c467da74b1`.

Published experience inspected: https://data-center-app.replit.app

No application source, tests, package dependencies, workflow configuration, or secrets were changed. Temporary scripts exercised existing functions and recorded public research results; browser interactions used disposable sessions. Build outputs, this report, and audit evidence are the only generated deliverables.

## 1. Executive verdict

**Do not release custom-project research as investment-grade, evidence-validated analysis in its current form.** The application compiles and serves pages, but a successful build is not evidence that its research-to-financial-model chain is valid.

The decisive defect is not simply “too few sources.” A real Lancium response supplied **1,200 MW as grid interconnection data**, and the model interpreted it as **1,200 months**, added two months for provenance uncertainty, and eliminated all five-year operating revenue. The same response supplied **7.3 cents/kWh**, which the model interpreted as **$7.3/MWh** rather than $73/MWh. Converting the unit would still not establish that a residential city rate is a valid facility tariff.

Two independently captured real Texas research runs each executed **one observed web search**, despite being given a 32-tool-call maximum and a category-specific search plan. The app retained only the first ten unique URLs. In the Meta run, the retained packet contained the relevant URLs with tracking parameters, but the evidence referenced versions without those parameters; exact-string matching discarded every evidence attachment.

The “validated sources” label overstates what the application checks. It usually establishes that a URL appeared in the provider packet, not that the page is reachable, belongs to the correct facility or phase, contains the asserted quotation, or supports the modeled variable. An isolated reproduction retained unrelated secondary reporting as **Verified Evidence**, with **related-context** relevance and support **38/100**.

The production homepage is **not the current local homepage**. The local redesign uses the hero’s right side and removes several legacy elements from the rendered page; production still serves the old header, launch-brief hierarchy, holding cards, and inline project form. This is observed release drift, not evidence that the new local implementation never happened.

The unit suite is green while the full browser suite is red: **171 unit/server tests passed; the production-entry test passed; 108 browser tests passed, 62 failed, and 18 were skipped.** Some failures are stale contracts, but newer Home, agent-review, and financial-trace tests also fail. It is not defensible to dismiss all 62 as legacy route failures.

### Severity rubric and evidence types

- **P0:** Invalid data, unsupported verification, or a broken core workflow, using the rubric in the supplied brief. This does not imply a cybersecurity incident.
- **P1:** Material product, governance, release, or credibility problem.
- **P2:** UX, comprehension, or observability problem.
- **P3:** Polish or developer-experience issue.
- **Live:** Actual provider response or browser observation.
- **Reproduction:** Existing application functions exercised with a captured response or controlled fixture; no source edits.
- **Code-confirmed:** A directly identifiable code path; not claimed to have occurred in either live search unless specified.
- **Unverified:** The evidence needed to decide was unavailable. Unknown is not reported as zero or as a pass.

## 2. Architecture map

All source references below are relative to `artifacts/safeloc-diligence-workbench/` unless otherwise stated.

| Layer | Current responsibility | Important boundary |
|---|---|---|
| Home / public routes | Holding selection, curated Stargate, custom research dialog, AI Chain, How It Works, directory | Holding relationships and directory metadata are discovery context, not facility evidence |
| Router / shell | Hash routing and legacy aliases into the unified analysis page | Analysis section selection does not always have a distinct history entry |
| Custom research client | POST request, 90-second deadline, one timeout retry, result parsing | Initial successful results become active evidence; focused refreshes are staged |
| Express server | Research, AI evidence, EIA, ERCOTQueue, and directory routes | Production uses `server/index.ts`; the old `server.mjs` is not the active entry point |
| OpenAI research | Responses API with `gpt-4o` and `web_search_preview`; one response for search and synthesis | A maximum tool budget is not a guarantee of category coverage |
| Source normalizer | Collect source metadata/annotations, deduplicate exact URLs, retain ten, match evidence URLs | URL packet membership is not claim verification |
| Research cache | Memory plus local files; fresh/recent/stale tiers; in-flight deduplication | Cached outputs can bypass newer validation rules |
| Diligence context | Curated/custom evidence, provider hydration, proposals, accepted state, scenarios, reset | Multiple persistence stores and initial-load/review paths |
| Financial engine | Evidence-class policy, numeric fallbacks, five-year cash flow, returns, attribution | Inputs are keyed by evidence ID, but their units/meaning are not adequately validated |
| Agent layer | Builds a review package over current context; applies eligible classification decisions | The displayed ten-stage sequence is not ten executed research operations |
| Review surfaces | Evidence, financial traces, decision, three investment lenses, community comparisons | Source fact, modeled treatment, relationship, and human disposition must remain separate |

Primary references: `src/App.tsx:27–45,95–153`; `src/components/Shell.tsx:364–371`; `server/index.ts:15–32`; `src/services/researchProjectService.ts:484–553`; `server/researchProjectProxy.mjs:769–839,953–1029`; `server/researchProjectCache.mjs:6–9,25–43,76–132`; `src/context/DiligenceContext.tsx:541–583,585–732,762–864`; `src/model/cashFlowEngine.ts:467–558,625–662,857–987`.

The other registered artifact is a component-preview sandbox, not a second production diligence service. The root workspace contains scripts and residual compiled shared-library output; the workbench’s actual package scripts were used for verification. This audit does not claim to have audited the internals of third-party dependencies or OpenAI’s search infrastructure.

## 3. Source-retrieval failure analysis

### R1 — Search planning is not search execution — P1, live

The request includes two search angles per modeled variable and permits 32 tool calls. Both captured runs returned exactly one `web_search_call`, directed at electricity pricing. There is no deterministic requirement that every category execute, and no post-retrieval coverage gate requiring follow-up searches before synthesis.

The only observed queries in the instrumented runs were:

1. `Lancium Clean Campus Abilene Texas utility tariff electricity rate power price $/MWh`
2. `Meta Temple Data Center Temple, Texas utility tariff electricity rate power price $/MWh`

The per-variable `searchTerms` often contain additional generated terms. These were labeled AI-reported, not tool-observed, and must not be counted as executed queries. Both runs had an empty `observedQueriesByEvidence` map. The exact-string query matcher did not map the observed variations back to the quoted planned strings.

References: `server/researchProjectProxy.mjs:273–325,650–680,769–795`; `src/components/ResearchSearchAudit.tsx:5–21`. Exact request prompts and response actions are included in the evidence package.

### R2 — First-ten truncation and exact-string URL identity lose sources — P1, live

| Instrumented run | Provider requests | Observed searches | Visible raw candidates | Valid URL candidate occurrences | Unique URLs before cap | Retained packet | Duplicate occurrences removed | Cap discards | Final unique evidence URLs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Lancium / Abilene | 1 | 1 | 19 | 19 | 12 | 10 | 7 | 2 | 2 |
| Meta / Temple | 1 | 1 | 13 | 13 | 12 | 10 | 1 | 2 | 0 |

“Visible raw candidates” counts returned `action.sources` entries plus URL annotations, including duplicates. It is **not** the search engine’s total result count. The provider does not expose that total. Both requests returned HTTP 200; neither timed out or retried in this instrumented pass.

Lancium’s six attached evidence records reuse only two URLs. Meta’s electricity and customer-concentration evidence referenced URL variants without `utm_source=openai`; the packet contained variants with that parameter. The application treats them as different sources, removes the attachments, and retains the unsupported non-Verified classifications.

The supplied evidence ledger lists every candidate and its observed local disposition. Results not referenced by any final evidence item are distinguished from results rejected during normalization; those are not the same event.

References: `server/researchProjectProxy.mjs:421–451,682–722`; captured response analysis in `provider-audit-analysis.json`.

### R3 — “Validated” is substantially weaker than the product term implies — P0 for Verified eligibility, P1 for counts

The app checks HTTP(S) URL syntax, then membership in the retained packet. It does not establish claim-level support before preserving a provider’s Verified classification. A controlled parser reproduction retained a deliberately unrelated secondary URL as **Verified Evidence**, with **related-context** relevance and support **38**. This is a demonstrated capability, not a claim that either live run returned Verified items; neither instrumented live run did.

Source metadata normally lacks the application-specific `exactProject` property. Normalization writes `false`, and the matching function immediately returns false before its token heuristic can run. This suppresses exact-project support but does not reliably prevent Verified classification.

References: `server/researchProjectProxy.mjs:184–195,333–375,448–487,700–714`; reproduction output in `pipeline-repro-output.json`.

### Direct answers to the remaining retrieval questions

| Question | Finding |
|---|---|
| Actual provider | Direct OpenAI Responses API, `https://api.openai.com/v1/responses`, configured `gpt-4o`; captured response model `gpt-4o-2024-08-06` |
| Live retrieval or model knowledge? | Live web search is actually invoked, but the prompt also permits unverified model knowledge and the parser retains some unsupported classifications |
| Queries tailored by category? | Yes in the plan; execution coverage is not enforced |
| Domain restrictions? | No app-enforced domain allowlist; `searchedDomains: ["web-search"]` is a channel label, not a list of publisher domains |
| Redirects followed? | No app-side source fetch/final-URL trace; provider behavior is not exposed |
| PDFs and government documents? | URLs can be returned and heuristically classified; no app-side document extraction, OCR, page verification, or quote validation |
| JavaScript-rendered pages? | No app-side rendering pipeline; provider support and actual page handling are unknown |
| Duplicate removal correct? | Exact URL duplicates are removed; canonical variants, tracking parameters, redirects, and syndicated content are not reliably reconciled |
| Can one source support multiple variables? | Yes; Lancium’s company page is attached to five variables, without distinct verified excerpts proving each one |
| Alternate names / campus / phase / roles? | No deterministic alias-and-role graph; operator hints affect queries, while entity matching remains weak and missing metadata is converted to false |
| Failures surfaced? | Client/API distinguish timeout, quota, authentication, malformed output, request limit, not configured, and upstream failures |
| Failures silently swallowed? | There is typed top-level error handling, but source drops have no per-result ledger in the product; logs retain only coarse failure/validation messages |
| Timeout / fallback behavior? | Client and server both use 90-second budgets; one client retry occurs only for timeout; non-timeout provider errors do not auto-retry |
| Cached failure behavior? | Fresh/recent cache may avoid a call; stale cache is returned during refresh and after refresh failure with metadata |
| Zero-source fail closed? | No for model eligibility: unsupported classes survive and affect synthetic fallback economics; recommendation gates still kept the tested cases BLOCKED |
| Unsupported summary prose? | Structurally valid generated descriptions enter active context without sentence-level support checks |
| Unsupported content become Verified? | No-URL Verified is downgraded, but an unrelated packet URL can preserve Verified; the isolated reproduction confirms this |

Relevant paths: `server/researchProjectProxy.mjs`; `server/researchProjectCache.mjs`; `src/services/researchProjectService.ts`; `src/pages/DirectoryRoute.tsx:145–152`; `src/pages/EvidenceRoom.tsx:1150–1205`.

### What was and was not captured

Two unmodified server-handler runs used isolated temporary caches and a recording fetch wrapper. It recorded outbound URL, method, JSON request body, response body, status, and timing, **not authorization headers or secrets**. Two separate browser submissions tested the same project names through the actual UI. Their results differ because they were separate live generations; their numbers must not be combined as one run.

The browser captured Meta’s application-level HTTP 200 response but missed Lancium’s response listener event; visible Lancium completion was recorded. The provider’s internal page requests, redirects, dropped search results, document processing, and hidden queries cannot be reconstructed from the available API output. No claim is made to possess those logs.

No live timeout, 429, or authentication failure occurred during the two instrumented research calls. Their behavior is covered by existing mocked tests and code analysis, not by intentionally exhausting quota or creating a production outage.

## 4. Evidence-processing failure analysis

### E1 — Numeric dimension and meaning are not enforced — P0, live plus reproduction

Server parsing accepts a finite number with an attached source; client parsing preserves the number and arbitrary unit string. The cash-flow engine then interprets the numeric value according to the evidence ID.

| Captured value | Model interpretation | Demonstrated consequence |
|---|---|---|
| Grid interconnection: 1,200 MW | 1,200 months + 2-month Management Assertion adder | 1,202-month revenue delay, zero five-year revenue, null baseline/stress IRR |
| Electricity: 7.3 cents/kWh | $7.3/MWh, then 1.15 inference multiplier | $8.395/MWh modeled rate instead of $83.95/MWh after conversion |

The unmodified captured Lancium case produces NPV **−$5,160.468 million**, no operating revenue, and no measurable IRR. Electricity cost is zero in that particular schedule because operations never start; therefore the electricity defect must not be claimed to cause an additional realized OPEX loss in that same run.

An isolated sensitivity reproduction removed only the invalid grid numeric, allowing the existing fallback timeline. Under that controlled scenario, changing 7.3 to 73 changes year-five electricity OPEX from **$134.897 million to $1,348.968 million**. Those are synthetic reproduction outputs, not estimates of Lancium’s actual economics. A residential rate is still ineligible as a confirmed project tariff after unit conversion.

References: `server/researchProjectProxy.mjs:545–555`; `src/services/researchProjectService.ts:329–330,354–355,386`; `src/model/cashFlowEngine.ts:503–504,523–532,625–634`; `financial-repro-results.json`.

### E2 — Unsourced generated classifications change the financial case — P0, reproduced; mitigated recommendation gate

Unsupported numeric and qualitative values are withheld, but unsupported Management Assertion, Model Inference, and User Assumption classes survive. Initial custom-project loading activates them without item-by-item acceptance. The model applies different fallback policies based on those classes.

At the same 1,200 MW capacity, with identical source-free, numeric-free records, a controlled reproduction produced:

| All 16 source-free records labeled | Synthetic stress IRR | Synthetic NPV, $M | Evidence confidence | Recommendation |
|---|---:|---:|---:|---|
| Missing Evidence | −16.685% | −2,022.469 | 0% | BLOCKED |
| Management Assertion | 5.863% | −408.737 | 60% | BLOCKED |
| Model Inference | −1.020% | −1,029.791 | 40% | BLOCKED |
| User Assumption | 2.489% | −756.612 | 20% | BLOCKED |

These are intentionally controlled fixtures, not four observed provider responses. They prove that warning copy and withheld numbers do not make model eligibility fail closed. They do **not** prove an unrestricted path to a READY recommendation: all four remained BLOCKED.

References: `server/researchProjectProxy.mjs:477–555`; `src/services/researchProjectService.ts:346–407`; `src/context/DiligenceContext.tsx:762–791`; `src/model/cashFlowEngine.ts:486–558`.

### E3 — Summary provenance and capacity are insufficiently separated — P1

The captured Lancium summary says on-site gas generation is “set for completion in 2025,” although this audit was run in September 2026. It also makes broad grid, water, and community claims. Meta’s summary includes current/future compute, power, cost, and chip assertions attributed inline to a directory page. The application does not verify each sentence against an exact passage or reconcile it to the modeled variables.

These statements are **not proven false merely because the application did not validate them**. They are unverified at the claim level. Linked prose should not be represented as independently checked facility evidence, and directory-reported capacity should not silently become a project-specific underwriting basis.

References: captured `projectSummary` objects; `server/researchProjectProxy.mjs:399–409`; `src/context/DiligenceContext.tsx:781–791`; `src/pages/CaseBrief.tsx:110`.

### E4 — The sixteen-item schema enforces shape, not semantics

Exactly sixteen IDs, valid class enums, finite numbers, and explicit-zero preservation are covered. Missing controls include canonical dimensions, plausible ranges per variable, project-versus-market scope, source type eligibility, quote fidelity, and immutable claim-to-source mapping. Increasing retrieval breadth without those controls would increase the amount of potentially misapplied data.

## 5. UX and content-density analysis

Detailed final measurements, route results, disclosure states, and interactive outcomes are included in the browser appendix.

Initial clean Home measurements:

| Surface | Viewport | Document height | Viewport lengths |
|---|---|---:|---:|
| Local Home | 1440 × 900 | 2,743 px | 3.05 |
| Local Home | 768 × 1024 | 3,574 px | 3.49 |
| Local Home | 390 × 844 | 4,752 px | 5.63 |
| Production Home | 1440 × 900 | 3,635 px | 4.04 |
| Production Home | 768 × 1024 | 3,716 px | 3.63 |
| Production Home | 390 × 844 | 5,246 px | 6.22 |

No horizontal overflow was observed at these six combinations. Lack of horizontal overflow does not establish good density, readable controls, or successful keyboard navigation.

The active Home repeats custom-project and Stargate entry actions in the hero and the two-path section. Directory entry appears in navigation, the project path, and the trust strip. Repetition is not automatically wrong, but two controls labeled Texas and nationwide currently resolve to the same `#directory` state; the label promises a distinction the navigation does not implement.

The five analysis subject areas and agent remain a continuous page. Expanded section wrappers are not the same as permanently expanded supporting details: current code does implement disclosures and conditional financial panels. The audit does not recommend reimplementing tabs that already work.

Recommended interaction pattern: retain one primary action for the current step; keep evidence in a compact table; put source passages, methodology, benchmark comparisons, and audit history in drawers or closed disclosures; use financial tabs for genuinely different panels; keep full cash-flow detail optional. Height budgets should be explicit acceptance criteria, not assumed from `overflow-x-hidden`.

References: `src/pages/Home.tsx:1235–1416`; `src/pages/AnalysisWorkbench.tsx:174–190,235–260`; `src/pages/FinancialMateriality.tsx:169–179,210–226,287–391`.

## 6. Homepage implementation gap analysis

### What a visitor can understand in ten seconds

On local desktop, the holding-to-infrastructure proposition, the NVIDIA and Stargate actions, and a context-backed example with synthetic returns are visible. The right side is used. On production, that product preview is absent and the older editorial hierarchy dominates. The ten-second assessment is an expert inspection, not a timed user study.

### Acceptance comparison

| Original requirement | Local implementation | Published experience / remaining gap |
|---|---|---|
| Compact public header; no workbench reset/session controls | Present | Production retains Reset to Default and older header actions |
| Two-column hero, explanation, governance line, three primary choices | Structurally present | Production retains legacy hero |
| Current-context preview including returns, confidence, gaps and relationship | Returns/confidence/gaps derive from context | Curated supplier label is literal “NVIDIA · reported”; preview does not expose a trace/as-of for that relation |
| Compact holding/project starting paths replacing oversized cards/forms | Active local page uses compact paths | Production still has six holding cards and inline form |
| NVIDIA reveals qualified existing exposure result and moves focus | Correct exposure/announcement implemented | Final scroll/focus behavior must be assessed after motion settles; see browser appendix |
| Distinct curated/custom/Texas/nationwide actions | Existing flows reused | Texas and nationwide both select the same directory route without scoped state |
| Non-mutating governed-AI example | Present and labeled illustrative | Production lacks the new composition |
| Concise sourced market context | Citation controls present | Dynamic editorial language still lacks a visible as-of qualification in the hero |
| Trust/methodology/builder links | Strip present | Methodology and builder/about both route to How It Works; separate anchor intent is not expressed |
| Remove duplicate and obsolete hierarchy | Active legacy hierarchy largely replaced | Some visible entry duplication remains; a complete unused `LegacyHome` remains in source |
| Five specified responsive sizes plus accessibility | Three requested audit sizes inspected | Original 1366×768 and 1024×768 acceptance sizes were not part of this audit’s browser matrix |
| Regression coverage including dynamic metrics, removal and responsive behavior | Tests exist | Presence/count tests are narrower than the stated acceptance; mobile dialog/focus test failed in the full suite |

### Why the old structure still appears

There are two distinct facts:

1. **Published release drift:** production demonstrably serves the old rendered hierarchy.
2. **Source retention:** the homepage change added **276 lines and removed 2**, leaving `LegacyHome` at `Home.tsx:874–1151` and the active `Home` at `1161–1425`.

The unused component does not add to rendered page height. It is a maintenance hazard, not proof that it is being rendered locally. The audit cannot infer the developer’s intent or why the newer source was not published; it can show the mismatch and the additive diff.

References: `src/pages/Home.tsx:874–1151,1161–1425`; `src/components/Shell.tsx:263–361`; `tests/home-redesign.spec.ts:4–49`; git numstat for the audited revision; browser production screenshots.

## 7. Financial and accepted-state consistency

### F1 — Initial intake and later review have different governance boundaries — P1

Initial research, including cache hits, loads provider classifications and numbers directly into active custom evidence. Focused Evidence Room re-research and background refresh results are staged for human acceptance. The consequential agent currently proposes a grid classification, not numeric/unit correction. It cannot repair the captured MW-to-months or tariff-unit defects.

A proposal that retains the same classification/value can be labeled consequential even when accepting it produces no change. The UI should distinguish a no-op acknowledgement from an applied model change.

References: `src/context/DiligenceContext.tsx:762–806`; `src/pages/EvidenceRoom.tsx:1079–1085,1177–1205`; `src/model/diligenceAgent.ts:419–451`.

### F2 — The ten displayed stages are presentation over existing context — P1

`runDiligenceAgent` advances definitions after 110-ms waits and builds a deterministic review package. It does not execute ten corresponding search, extraction, citation, or relationship services. “Stages: presentation only” is visible, but complete-stage labels such as Approved-source search and Citation validation can still imply work that did not happen.

This is not a claim that the separate custom research endpoint is fake; its OpenAI search calls were observed. The problem is the agent-stage contract.

References: `src/context/DiligenceContext.tsx:585–633`; `src/model/diligenceAgent.ts:3–14,413–542`; `src/pages/DiligenceAgentPanel.tsx:281–339`.

### F3 — Curated source counts and consequential eligibility are disconnected — P1

Curated records carry `claimIds`; the Evidence Room resolves their citations. The agent input mostly passes only `sourceUrl` and `sources`, dropping the claim-registry mapping. In the browser, the curated run displayed **0 retrieved sources and 3 validated sources**; the latter was a count of Verified-classified records, not independently validated URLs.

The curated grid proposal is consequently review-only. Review-only cards intentionally expose Reject and Leave Unresolved rather than Apply/Override. **The absence of Accept on those cards is not, by itself, a broken approval control.** Consequential custom proposals require a separate test.

References: `src/context/DiligenceContext.tsx:541–583`; `src/model/diligenceAgent.ts:416–471`; `src/pages/EvidenceRoom.tsx:357–407`; browser audit.

### F4 — Audit lineage and snapshot eligibility are incomplete — P1

Agent application writes to the in-memory session decision log, while reversal changes evidence and the persisted agent audit without an equivalent reversal event in that log. Evidence Room history can therefore differ from agent history; after reload the memory-only history disappears.

The agent snapshot key omits numeric/qualitative values, model classification, source-support confidence, and source relevance, although those can change cash flow or eligibility. A proposal’s displayed source/value payload is rebuilt on rerun while parts of its old disposition lineage remain.

References: `src/context/DiligenceContext.tsx:635–732,943–985`; `src/services/sessionLog.ts:29–99`; `src/model/diligenceAgent.ts:247–255,514–523`. These are code-confirmed risks; the browser appendix distinguishes executed persistence/reversal checks.

### F5 — Scenario comparisons cannot reproduce their full basis — P1

Saved scenarios retain classifications and selected metrics, not a complete versioned evidence/model/provider snapshot. Equal classifications can have different provider values or model versions, yet comparison lacks that explanation.

Automatically incorporating valid EIA data is not inherently an unauthorized AI action. The issue is unrecorded drift in the comparison basis and incomplete source/model snapshots. Similarly, keeping named scenarios and valid provider data on reset can be intentional; it should be communicated rather than treated as a bug by definition.

References: `src/context/DiligenceContext.tsx:818–864,888–941,1065–1085,1244–1279`; `src/pages/DecisionReview.tsx:382–471`.

### F6 — Synthetic counterfactuals need accurate names and derivations — P1/P2

The “All Inputs Verified” baseline force-applies a Verified class while retaining synthetic/undisclosed values and fixed assumptions. It is a policy counterfactual, not a newly verified factual case. The curated grid record also combines project and aggregate context with a 14-month modeled number whose inference needs its own trace.

County hazard classification is mapped to a fixed annual probability and synthetic daily loss; that modeling policy is not a FEMA project-loss probability. The marginal “Dollar effect” includes undiscounted equity cash-flow differences and exit effects, not simply annual OPEX or NPV.

These are labeling/derivation concerns, not proof that all synthetic modeling is invalid. The current recurring-versus-total attribution distinction should be preserved.

References: `src/model/cashFlowEngine.ts:339–349,437–448,543–558,904–913`; `src/context/DiligenceContext.tsx:196–264`; `src/pages/FinancialMateriality.tsx:230–264,295,419–423`.

## 8. Test-suite results and blind spots

| Check | Result |
|---|---|
| TypeScript typecheck | Passed |
| Production Vite build | Passed; non-blocking large-chunk warning |
| Unit/server suite | 171 passed, 0 failed |
| Production-entry test | 1 passed |
| Full Playwright suite, existing desktop and mobile projects | 108 passed, 62 failed, 18 skipped, 0 flaky |
| Browser-suite duration | Approximately 7 minutes 38 seconds |
| Current local workflow | Running |
| Published Home HTTP/render | HTTP 200; older UI than local |

Commands were the workbench’s existing `typecheck`, `build`, `test`, and `test:production` scripts, plus the existing Playwright configuration with four workers and the development proxy as base URL. No assertions were changed, retries added, or failures suppressed.

### Failure categories, not blanket “legacy failures”

- **Obsolete routes/copy:** tests expect `#brief` or `#evidence`, but current navigation returns `#analysis`; other assertions expect replaced instruction text.
- **Uncontrolled provider state:** freshness checks expect Embedded while actual EIA displays Live, showing dependence on the external environment.
- **Removed/moved controls:** queue snapshot, restored-session feedback, and old agent decisions are not found in some tests.
- **Current-flow failures:** mobile Home dialog/focus times out; current financial trace and guided approval tests time out.
- **Test fragility:** a scenario assertion calls `.toFixed` on null IRR and crashes. That is a test failure, not proof that the application itself crashes.

The complete per-file count table and failed-test messages are in the evidence appendix. No comparison against an earlier revision was run; this is a baseline audit of the current tree, not a claim about which merge introduced each failure.

### Passing tests that do not establish working user outcomes

- Source tests can pass while asserting an arbitrary ten-source cap instead of complete candidate accounting.
- Parser/confidence tests can pass with a Verified item assigned support 38 from non-exact secondary context.
- Home removal tests count one particular `data-testid`, not every semantically duplicate Stargate/custom CTA.
- The test titled “routes the two directory links” clicks only Texas and checks `#directory`; it does not establish a distinct nationwide path.
- Agent tests can validate a review-only package and unchanged evidence without testing consequential accept → numeric/classification eligibility → metric recalculation → reload → reversal.
- Production-entry testing establishes routing/JSON shapes and permits provider error states; it is not an end-to-end research correctness test.

References: `server/researchProjectProxy.test.mjs:327–335,462–515`; `tests/home-redesign.spec.ts:4–49`; `tests/diligence-agent.spec.ts:12–35`; `server/production.test.ts:59–100`.

### Required missing or insufficient regression coverage

| Requested test area | Current gap |
|---|---|
| Actual source counts | Raw/parsed/canonical/retained/mapped/rejected counts do not reconcile end to end |
| Retrieval failures | Unit mocks exist; real partial retrieval and category coverage are not acceptance gates |
| Zero-source fail closed | No invariant that unsupported generated classes cannot change fallback economics |
| URL validity | Syntax tested; reachability, redirects, canonical identity, and claim content not established |
| Source-to-project matching | No realistic missing-metadata / alternate campus / wrong-phase / role-collision gate |
| Exact quote vs generated summary | No page/section passage verification |
| Homepage removal / duplicates | Narrow selectors miss semantic duplication and production drift |
| Financial tabs | Current conditional rendering exists; keep behavior-based and keyboard assertions, not label-only tests |
| Default collapse | No reliable panel-by-panel default visibility budget |
| Height / density | No enforceable page/section viewport budget |
| Deep links / anchors | Old URL contracts and current scroll/focus behavior not reconciled |
| Dynamic metrics | Provider timing is not consistently controlled; snapshots omit the basis |
| Responsive / visual | Some coverage exists, but not the required complete stable viewport-and-state matrix |

## 9. Release blockers

1. **P0 — Incompatible units and concepts can enter active financial inputs.** Reject or quarantine dimensionally invalid numbers before modeling.
2. **P0 — Unsourced AI classifications alter the active fallback case.** Keep unaccepted, source-ineligible findings separate from accepted economics.
3. **P0 — A merely attached unrelated URL can preserve Verified Evidence.** Define and enforce claim/entity/provenance eligibility, not only packet membership.
4. **P1 — The displayed agent stages and source counts overstate executed/validated work.** Make completion states describe actual operations and actual artifacts.
5. **P1 — Published and local product acceptance differ.** Do not sign off the redesign based on a local-only review.
6. **P1 — The full browser suite is not a release gate today.** Classify and repair failing contracts and real workflows without deleting assertions to turn the suite green.
7. **P1 — Accepted-state lineage and scenario basis are incomplete.** Reproducible diligence requires evidence/model versions and coherent disposition history.

BLOCKED recommendation badges and synthetic-economics disclosures mitigate some misuse. They do not repair invalid numeric inputs or justify a Verified label.

## 10. Prioritized repair batches

These are proposed implementation boundaries, not changes made by this audit. Each batch has exact files and acceptance criteria below. The order deliberately fixes eligibility before increasing retrieval volume or adding more UI.

### Batch A — Enforce per-variable dimensions and modeling scope — P0

Files: `server/researchProjectProxy.mjs`; `src/services/researchProjectService.ts`; `src/model/cashFlowEngine.ts`; their existing test files.

Acceptance:
- Each of the sixteen variables defines canonical model meaning, unit, range, and allowed conversions.
- A 7.3 cents/kWh fixture converts to 73 $/MWh only when the underlying rate is eligible; residential context remains a lead unless explicitly accepted as an assumption.
- MW supplied for grid delay is quarantined and never creates a month value or a 1,202-month schedule.
- Preserve original value/unit/quote beside normalized value and rejection reason; no silent numeric fallback disguised as a sourced fact.

### Batch B — Separate research intake from accepted economics — P0

Files: `src/context/DiligenceContext.tsx`; `src/services/researchProjectService.ts`; `src/components/Shell.tsx`; `src/pages/DirectoryRoute.tsx`; `src/pages/EvidenceRoom.tsx`; corresponding tests.

Acceptance:
- Initial, cached, focused, and background research use the same model-eligibility rules.
- Zero eligible sources cannot change baseline assumptions, model policy, or accepted classifications through AI wording alone.
- Unsupported prose stays in an explicitly unverified lead area.
- Accepted model changes require a validated mapping and explicit disposition; same-value/same-class proposals are identified as no-ops.
- Tests compare source-free generated results against the documented default-assumptions case at equal capacity.

### Batch C — Enforce Verified claim and entity eligibility — P0

Files: `server/researchProjectProxy.mjs`; `src/model/diligenceAgent.ts`; `src/context/DiligenceContext.tsx`; `server/researchProjectProxy.test.mjs`; `src/model/diligenceAgent.test.ts`.

Acceptance:
- Unknown identity metadata remains unknown, not false.
- Project, campus, phase, developer, operator, tenant, and supplier are separately represented.
- A related-context or wrong-phase source cannot authorize facility-level Verified Evidence.
- Every accepted claim has a specific supporting passage and source provenance decision; quote and generated summary are distinct.
- The unrelated-secondary-URL reproduction must fail eligibility, not merely receive a lower confidence score.

### Batch D — Canonicalize source identity and retain a rejection ledger — P1

Files: `server/researchProjectProxy.mjs`; `src/services/researchProjectService.ts`; `src/components/ResearchSearchAudit.tsx`; corresponding tests.

Acceptance:
- Tracking/fragment variants resolve to one canonical identity without stripping identity-significant query parameters.
- Report raw occurrences, parsed candidates, unique canonical sources, retained sources, mapped sources, rejected sources, and reason codes separately.
- Every cap discard and evidence-reference mismatch has a ledger entry.
- Do not discard a source cited by an eligible variable simply because it arrived eleventh.
- Replaying both captures reconciles every candidate and every final evidence attachment.

### Batch E — Make bounded category retrieval executable — P1

Files: `server/researchProjectProxy.mjs`; `server/researchProjectCache.mjs`; `src/components/ResearchSearchAudit.tsx`; server/client research tests.

Acceptance:
- Define actual category coverage targets within a total time/tool budget, not a finding quota.
- Preserve planned queries and observed queries separately, including provider response IDs and timestamps.
- A one-query run is displayed as partial category coverage, never as completed searches for sixteen variables.
- Optional follow-up retrieval preserves valid earlier results and respects a shared deadline.
- Timeout and quota behavior remain distinct and tested.

### Batch F — Record access, document, and summary support — P1

Files: `server/researchProjectProxy.mjs`; `src/services/researchProjectService.ts`; `src/pages/CaseBrief.tsx`; source-trace components and focused tests.

Acceptance:
- Record source access status, resolved URL, content type, passage/page/section, and verification limits.
- Text PDFs and government documents have reproducible passage extraction; scanned/blocked/JS-only content fails explicitly or uses a documented supported path.
- Summary sentences are linked to eligible claims or visibly labeled unverified.
- Historical future-tense claims such as “completion in 2025” require freshness review before being presented as current.
- Network retrieval must include appropriate destination/redirect safety boundaries.

### Batch G — Make agent stages and counts truthful — P1

Files: `src/model/diligenceAgent.ts`; `src/context/DiligenceContext.tsx`; `src/pages/DiligenceAgentPanel.tsx`; `src/data/claimSources.ts`; agent tests.

Acceptance:
- A stage reaches complete only after its named operation produces a recorded artifact, or it is explicitly presented as an existing-evidence review step.
- Curated `claimIds` resolve into the same source contract as custom evidence.
- Retrieved, attached, accessible, and claim-validated counts are distinct; 0 retrieved / 3 classified records is not labeled 3 validated sources.
- Review-only and consequential controls are explicitly differentiated.
- Accept/Override/Unresolved/Reject/Reverse are tested on their eligible paths; no-op decisions are not presented as financial changes.

### Batch H — Unify audit lineage and version snapshots — P1

Files: `src/context/DiligenceContext.tsx`; `src/services/sessionLog.ts`; `src/model/diligenceAgent.ts`; `src/pages/DecisionReview.tsx`; persistence/scenario tests.

Acceptance:
- One persisted event chain records proposal, acceptance, override, rejection, unresolved disposition, and reversal.
- Before/after values, normalized units, classifications, source snapshot, and actor/time are reproducible.
- All model- and eligibility-affecting fields participate in stale-proposal checks.
- Reruns cannot rewrite the original accepted proposal.
- Scenarios include model/evidence/provider versions and disclose incomparable or stale bases.

### Batch I — Reconcile model naming and derivation traces — P1/P2

Files: `src/model/cashFlowEngine.ts`; `src/pages/FinancialMateriality.tsx`; `src/pages/DecisionReview.tsx`; `src/context/DiligenceContext.tsx`.

Acceptance:
- Rename the all-Verified comparator as an explicitly synthetic evidence-quality counterfactual unless its inputs are independently verified.
- Trace the curated 14-month assumption and hazard-to-loss policy separately from public source facts.
- Label total marginal dollar effect as undiscounted equity cash-flow change including exit, distinct from annual recurring effect and NPV.
- Background provider changes and scenario comparisons disclose their source/time basis.

### Batch J — Reconcile Home acceptance and published release — P1/P2

Files: `src/pages/Home.tsx`; `src/components/Shell.tsx`; `src/App.tsx`; `tests/home-redesign.spec.ts`; artifact release verification.

Acceptance:
- Publish only after the repaired build is approved; verify a release identifier on local and production.
- Production satisfies the same header, hero preview, compact paths, and legacy-removal assertions as local.
- Texas/nationwide either apply distinct scope or become one accurately named directory action.
- Derive supplier relationship from the exposure data and expose source/as-of context.
- Set explicit allowed CTA counts by semantic intent, not one test ID; remove unused legacy implementation without changing active behavior.

### Batch K — Enforce density, navigation, and focus budgets — P2

Files: `src/pages/AnalysisWorkbench.tsx`; `src/pages/Home.tsx`; `src/pages/CaseBrief.tsx`; `src/pages/EvidenceRoom.tsx`; `src/pages/FinancialMateriality.tsx`; `src/pages/DecisionReview.tsx`; `src/pages/AdvisorLens.tsx`; `src/index.css`.

Acceptance:
- Approve and enforce a default Home budget of no more than three desktop and four mobile viewport lengths; selected detail may expand deliberately.
- Default analysis sections expose a compact summary/action; supporting evidence, methods, and full models are closed or in drawers unless requested.
- Define per-section budgets after content prioritization and test them at all five original acceptance sizes.
- All route/section links place the requested heading visibly below sticky UI after motion settles.
- NVIDIA selection visibly reveals and focuses its result; financial tabs change panels and support keyboard operation.

### Batch L — Restore a meaningful release test gate — P1

Files: `playwright.config.ts`; all affected files in `tests/`; `server/researchProjectProxy.test.mjs`; `src/services/researchProjectService.test.ts`; `src/model/cashFlowEngine.test.ts`; `src/model/diligenceAgent.test.ts`.

Acceptance:
- Triage all 62 failures with an explicit reason: retired contract, actual regression, provider nondeterminism, or test defect.
- Update obsolete contracts without weakening the current user outcome.
- Capture-based unit/semantic, zero-source, canonical-source, and wrong-entity regressions fail before their fixes and pass afterward.
- Use stable provider fixtures for deterministic UI tests plus a separate bounded live-research acceptance check.
- Full suite has zero unexplained failures; intentional skips have reasons; responsive screenshots and release-parity checks cover critical states.

## 11. Relevant files for every repair

Every batch above names its implementation and test files. The highest-leverage boundaries are:

- **Research intake and eligibility:** `server/researchProjectProxy.mjs`, `src/services/researchProjectService.ts`, `src/context/DiligenceContext.tsx`.
- **Financial dimensions and policy:** `src/model/cashFlowEngine.ts`.
- **Consequential review and lineage:** `src/model/diligenceAgent.ts`, `src/pages/DiligenceAgentPanel.tsx`, `src/services/sessionLog.ts`.
- **Evidence and summary traces:** `src/pages/EvidenceRoom.tsx`, `src/pages/CaseBrief.tsx`, `src/data/claimSources.ts`.
- **Product density and entry paths:** `src/pages/Home.tsx`, `src/pages/AnalysisWorkbench.tsx`, `src/components/Shell.tsx`, `src/App.tsx`, `src/index.css`.
- **Regression evidence:** `tests/home-redesign.spec.ts`, `tests/diligence-agent.spec.ts`, `tests/workbench-refinement.spec.ts`, `tests/financial-impact-chain.spec.ts`, `tests/custom-project-research.spec.ts`, `tests/routing-history.spec.ts`, `tests/scenarios.spec.ts`, `tests/storage-and-reset.spec.ts`.

## 12. Exact release acceptance and audit limitations

Release acceptance is not “the build passes.” It requires:

1. The captured MW/month and cents/kWh defects are rejected or correctly normalized under an explicit eligibility policy.
2. Zero eligible sources cannot alter accepted model state through generated provenance labels.
3. Related-context packet URLs cannot authorize Verified facility claims.
4. Both Texas cases produce an auditable request → candidate → rejection/mapping → evidence → assumption chain, with unknowns explicitly unresolved.
5. Consequential accept/override/reverse and source-free recovery behave correctly through reload/reset.
6. Displayed stage completion, counts, confidence, baseline naming, and scenario basis describe what actually happened.
7. Local and published acceptance checks agree on the released product.
8. The full deterministic test suite has no unexplained failures.

This audit did not verify every factual statement on every external source page, independently validate the entire community-agreement corpus, inspect inaccessible provider-internal retrieval logs, or intentionally trigger paid-provider quota failures. Exact quote verification for those documents remains open; a link is not proof.

The two instrumented provider calls and two UI submissions are separate samples, not an exhaustive estimate of average retrieval performance. Temporary financial variations are diagnostic fixtures, not investment opinions or revised underwriting recommendations. No repairs were implemented.