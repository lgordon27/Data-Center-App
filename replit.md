# SafeLoc Diligence Workbench

SafeLoc is an evidence-governed investment workbench for diligence on the Stargate Abilene AI-infrastructure project in Taylor County, Texas. It helps an analyst or investment committee connect public operating evidence to representative acquisition economics, see which uncertainties are financially material, and carry the open questions into an advisor handoff.

This guide documents the `artifacts/safeloc-diligence-workbench` web artifact. The sibling Canvas component preview is a separate artifact and is not part of SafeLoc's runtime.

## Purpose and scope

The workbench is a private working-paper proof of concept for an IC pre-read. Its central question is whether Stargate Abilene can deliver what a financial model assumes. It intentionally keeps two things distinct:

- **Public context:** reported Stargate, environmental, energy, water, climate, community, permitting, and infrastructure facts, events, assertions, and unresolved disclosures.
- **Synthetic economics:** representative acquisition and operating assumptions used to demonstrate sensitivity analysis. These are not disclosed project terms, reported returns, or a claim about Stargate's actual transaction economics.

The application uses an artifact-owned, same-origin `/api/ercot-queue` proxy for ERCOTQueue.com's documented public JSON datasets. A canonical client-safe source registry exposes provider identity, status, timestamps/version, data role, and fallback text. FEMA and EIA remain embedded by default and GridTracker MCP remains disconnected; the UI never invents a live response, named customer match, request count, cache, or timestamp.

## Stack and architecture

- pnpm workspace package: `@workspace/safeloc-diligence-workbench`
- React 19 and React DOM 19 with TypeScript
- Vite 7 for development and the production static build
- Tailwind CSS 4 through `@tailwindcss/vite`
- Lucide React for interface icons
- Hash routing implemented in `src/App.tsx`; no routing library
- Browser-only calculations in `src/model/cashFlowEngine.ts`
- Browser `localStorage` for the current evidence-classification session and named scenario snapshots
- One read-only SafeLoc proxy route for ERCOTQueue public data; no database, server-side calculation layer, or authentication dependency

The artifact is registered as a path-routed web artifact in `artifacts/safeloc-diligence-workbench/.replit-artifact/artifact.toml`. Its development service runs on the workflow-provided port and serves the artifact at `/`.

## Key files

- `artifacts/safeloc-diligence-workbench/.replit-artifact/artifact.toml` — artifact identity, `/` preview path, web service, development command, static production build, and `PORT`/`BASE_PATH` values.
- `artifacts/safeloc-diligence-workbench/package.json` — SafeLoc scripts for development, build, preview, typecheck, unit tests, and Playwright tests.
- `artifacts/safeloc-diligence-workbench/src/main.tsx` — React entrypoint; mounts `App` inside the error boundary and loads the global CSS.
- `artifacts/safeloc-diligence-workbench/src/App.tsx` — active shell, hash route handling, navigation, home page, five workbench screens, AI Chain view, scenario comparison, reset flow, and presentation components.
- `artifacts/safeloc-diligence-workbench/src/context/DiligenceContext.tsx` — canonical 16-item evidence set, classification state, localStorage hydration/persistence, calculated metrics access, and saved-scenario state.
- `artifacts/safeloc-diligence-workbench/src/model/cashFlowEngine.ts` — browser cash-flow model, provenance quality policy, five-year schedule, IRR/NPV/payback and other metrics, recommendation state, and verified baseline comparison.
- `artifacts/safeloc-diligence-workbench/src/data/sources.ts` — canonical source identities, provider status contract, timestamp/version formatting, fallback explanation, and electricity-cost attribution.
- `artifacts/safeloc-diligence-workbench/src/components/DataSources.tsx` — compact workbench source bar and expandable attribution panel.
- `artifacts/safeloc-diligence-workbench/src/model/advisorLens.ts` — advisor questions, provenance strength ordering, risk tiers, evidence-gap presentation, and governance IRR-gap helpers.
- `artifacts/safeloc-diligence-workbench/src/HowItWorksTour.tsx` — the product tour's workflow, evidence-tier, source/method, and handoff content.
- `artifacts/safeloc-diligence-workbench/src/model/*.test.ts` — model and advisor-lens unit tests.
- `artifacts/safeloc-diligence-workbench/tests/*.spec.ts` — browser regression coverage for routing, storage/reset behavior, and scenarios.
- `artifacts/safeloc-diligence-workbench/vite.config.ts` — Vite/Tailwind setup, aliases, required environment validation, host/port configuration, development proxy middleware, and output path.
- `artifacts/safeloc-diligence-workbench/server.mjs` and `server/ercotProxy.mjs` — artifact-owned production static server and bounded public ERCOTQueue proxy.
- `artifacts/safeloc-diligence-workbench/src/services/ercotService.ts` — client validation, aggregate calculations, named-record matching, COD-slip normalization, and embedded fallback.

## Routes and user flow

The app uses hash routes and falls back to `#home` for an empty or unknown hash:

- `#home` — landing page that frames the product and opens the workbench, AI Chain, or tour.
- `#brief` — **Case Brief**, which frames the Stargate Abilene opportunity, location, public operating story, and synthetic transaction boundary.
- `#evidence` — **Evidence Room**, where the 16 inputs, citations, descriptions, and provenance classifications can be reviewed and changed.
- `#materiality` — **Financial Materiality**, which shows the current model, verified baseline, evidence-to-return bridge, assumptions, and five-year cash-flow schedule.
- `#decision` — **Decision Review**, which combines recommendation status, material gaps, underwriting gates, and optional named scenario capture/comparison.
- `#advisor` — **Advisor Lens**, which prioritizes questions and translates unresolved evidence into advisor-ready context.
- `#value-chain` — **The AI Chain**, a separate view connecting infrastructure diligence to the broader AI value chain; it can return to the workbench.
- `#how-it-works` — the long-form **How It Works** product tour. The tour can jump directly to any of the five workbench screens.

The five numbered screens are the core workbench progression: frame, source, model, decide, and transmit. Header, progress navigation, mobile navigation, and previous/continue controls all change the hash rather than maintaining a second routing system.

## Evidence governance and model behavior

The default case contains exactly 16 evidence inputs:

1. Electricity Cost / MWh (`electricity_cost`)
2. Annual Cooling Water (`water_consumption`)
3. Grid Interconnection Timeline (`grid_interconnection`)
4. 5-Yr Water Cost Escalation (`water_escalation`)
5. Community Infrastructure Strain (`community_risk`)
6. Renewable Procurement (`renewable_percentage`)
7. Cooling Infrastructure CAPEX (`cooling_capex`)
8. 5-Yr Electricity Price Increase (`electricity_escalation`)
9. Carbon Compliance Cost (`carbon_compliance`)
10. Core Build Timeline (`permitting_timeline`)
11. Customer Terms & Concentration (`customer_concentration`)
12. Local Water Rights & Allocation (`water_rights`)
13. Site Hazard Exposure Profile (`site_hazard_exposure`)
14. Backup Power Capacity (`backup_power_capacity`)
15. Water Source Resilience (`water_source_resilience`)
16. Estimated Downtime Cost (`downtime_cost`)

Each item has a value, unit, citation, description, and one of five provenance classes:

- **Verified Evidence** — a public record or dependable source directly supports the input.
- **Management Assertion** — the project or its representatives state the input, but independent proof is limited.
- **Model Inference** — the tool derives an estimate from related public facts.
- **User Assumption** — an analyst-selected value is used where the project-specific fact is not established.
- **Missing Evidence** — the needed information has not been found or disclosed.

Changing a classification is not just a label change. The cash-flow engine applies the classification-specific quality policy to the affected driver. Depending on the input, that can change underwritten power or water cost, escalation, renewable coverage, customer utilization, delay timing, contingency CAPEX, climate disruption cost, backup-power treatment, water-rights cost, and related operating assumptions. The model then recalculates in the browser. The UI shows the current return, a verified-evidence baseline, the IRR change from the latest reclassification, evidence confidence, and the affected model line items.

The reported model outputs include project IRR, MOIC, NPV, cash-on-cash, payback, confidence score, revenue delay, incremental CAPEX, OPEX change, material evidence-gap counts, total distributions, equity invested, terminal value, assumptions, line items, and a five-year schedule. A low-confidence warning is shown for sensitivity analysis when the evidence base is insufficient; at zero confidence, the engine also marks the output as mechanical.

Recommendation status is governed by material evidence, not return alone:

- **BLOCKED** when any material input is classified as Missing Evidence.
- **CONDITIONAL** when no material input is missing but one or more material inputs are Model Inference or User Assumption.
- **READY FOR REVIEW** when no material input is missing or classified as Model Inference/User Assumption. A Management Assertion is not treated as verified evidence, but it does not by itself prevent this status.

## Persistence and saved scenarios

SafeLoc is client-only and persistence is local to the browser:

- The current session saves the 16 classifications in `localStorage`. A valid saved session is restored on load and briefly surfaced as “Session restored.”
- Reset to Default restores the canonical evidence classifications and clears the current session. It does not delete named scenarios.
- The Decision Review screen can save a named snapshot containing all classifications and the calculated metrics. Names must be non-empty and unique (case-insensitive), and at most five scenarios are kept.
- Saved scenarios are independent snapshots: later changes to the live workbench do not mutate them. With at least two snapshots, the UI can compare their IRR, MOIC, NPV, cash-on-cash, payback, and confidence values.
- Storage is optional defensive persistence. Invalid or unavailable browser storage falls back to the default in-memory case rather than making the workbench unusable.

## Run and operate locally

Run commands from the repository root with pnpm. The remaining workspace packages are SafeLoc, the mockup sandbox, and repository scripts. There is no root `pnpm dev` script for SafeLoc; use the artifact filter:

```bash
# Replit workflow command
pnpm --filter @workspace/safeloc-diligence-workbench run dev
```

The repository-wide checks cover the remaining artifacts and scripts:

```bash
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/mockup-sandbox run typecheck
pnpm --filter @workspace/mockup-sandbox run build
```

The Vite configuration requires both `PORT` and `BASE_PATH` for every Vite command (`dev`, `build`, and `serve`). The registered artifact supplies `PORT=25519` and `BASE_PATH=/`; when running the package outside the managed workflow, provide them explicitly:

```bash
PORT=25519 BASE_PATH=/ pnpm --filter @workspace/safeloc-diligence-workbench run dev
```

Other package scripts are:

```bash
PORT=25519 BASE_PATH=/ pnpm --filter @workspace/safeloc-diligence-workbench run build
PORT=25519 BASE_PATH=/ pnpm --filter @workspace/safeloc-diligence-workbench run serve
pnpm --filter @workspace/safeloc-diligence-workbench run typecheck
pnpm --filter @workspace/safeloc-diligence-workbench run test
pnpm --filter @workspace/safeloc-diligence-workbench run test:e2e
```

The production build is a Vite output under `artifacts/safeloc-diligence-workbench/dist/public`. The artifact-owned Node process serves those files and the `/api/ercot-queue` route; the app itself still resolves its internal views from the hash.

For Playwright tests, `playwright.config.ts` starts the SafeLoc dev server on port `4173` with `PORT=4173 BASE_PATH=/` unless `PLAYWRIGHT_BASE_URL` is provided. If a custom base URL is used, start a compatible SafeLoc server yourself and set `PLAYWRIGHT_BASE_URL` to it.

## Data boundary

The case's citations and descriptions represent public-source context already encoded in the application, including Stargate/Oracle/OpenAI/Crusoe/Lancium reporting, ERCOT and utility context, water and climate records, community reporting, and related environmental/infrastructure evidence. “Not disclosed” values remain unresolved rather than being silently filled with facts.

The ERCOT proxy fetches only documented, unauthenticated resources: generation `projects.json`, `cod_history.json`, large-load `load/load_queue_summary.json`, and `site_freshness.json`. It applies bounded timeouts and validates upstream status, content type, and minimum payload shape. Successful snapshots are retained in-process for a cached response if a later refresh fails; otherwise the browser service uses a clearly labeled embedded aggregate baseline. The large-load source publishes aggregate MW and sector share but currently reports null project counts, so SafeLoc displays “Not published” rather than deriving or fabricating a customer count. Generation records only become named Stargate/Oracle evidence when those names are actually present in the public project record.

The financial engine uses explicit representative assumptions scaled to the modeled 1.2 GW target, including entry value, lease rate, cooling CAPEX, utilization ramp, debt, discount rate, exit multiple, downtime cost, and other costs. These are synthetic underwriting inputs for a demonstration of evidence-governed sensitivity; they are not disclosed Stargate acquisition terms, actual project cash flows, or public facts about the project. Preserve that distinction when changing the UI or adding case inputs.

### External-data freshness boundary

Evidence records can identify the source and data role that support them without changing their evidence classification. API-backed records show the shared source status (live or cached); records without a provider-backed source remain explicitly embedded. The financial model keeps its numeric inputs unchanged and derives electricity-cost attribution from the shared EIA state: a live provider response includes its observed date, while the bundled case continues to read “embedded estimate.”

The client-safe provider boundary accepts separate live and retained-cache metadata. It validates provider origin and timestamps, chooses a valid live response first, automatically uses the timestamped retained response when live metadata is unavailable or invalid, and returns to the embedded baseline when neither exists. This is the mechanism behind the required demonstration rule: **All external feeds automatically fall back to cached values during an unavailable live demonstration.** The current proof-of-concept supplies no provider payload, so its visible defaults remain embedded rather than cached.
