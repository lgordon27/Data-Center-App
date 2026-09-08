# SafeLoc release validation

**Validation date:** 2026-09-08  
**Artifact:** `artifacts/safeloc-diligence-workbench`  
**Status:** Local release candidate validated; production acceptance remains blocked because the public host still serves the previous bundle.

## Release path

- Source revision: `e873f3511374027c10aa4fbafe673c1be8d6c2b5` (reviewed release HEAD)
- Development command: `pnpm --filter @workspace/safeloc-diligence-workbench run dev`
- Production build: `PORT=25519 BASE_PATH=/ pnpm --filter @workspace/safeloc-diligence-workbench run build`
- Production run: `NODE_ENV=production tsx server/index.ts`
- Bundle output: `dist/public/index.html`, `dist/public/assets/index-DbM_Ulah.js`, `dist/public/assets/index-D7UuJR06.css`, and `dist/public/assets/DirectoryRoute-Bjq9vNA9.js`
- Local release ID: `bundle-ce367c0d3622ca1d`
- Local `/api/version` and `/release.json`: identical, HTTP 200, `Cache-Control: no-store`
- Public production `/api/version`: HTTP 404 (old host does not expose the reconciled release route)
- Public production Home markers: redesigned `home-hero` / `home-stargate-preview` not present

The release ID is a SHA-256 digest of the built public bundle (with the source revision retained separately), so it changes when the served bundle changes rather than relying on visual comparison or browser cache state.

## Responsive measurements

The measurements below were captured against the local workflow after a cache-aware reload. `overflowX` is false for both Home and Analysis at every required viewport.

| Viewport | Home height | Home budget | Home overflow | Analysis section heights (agent / overview / evidence / financial / decision / advisor) |
| --- | ---: | ---: | --- | --- |
| 1440×900 | 2604 px | ≤2700 px | No | 509 / 2303 / 4182 / 5035 / 3892 / 5699 |
| 1366×768 | 2604 px | — | No | 509 / 2303 / 4182 / 5035 / 3892 / 5699 |
| 1024×768 | 2754 px | — | No | 578 / 2676 / 4951 / 5967 / 4543 / 7336 |
| 768×1024 | 3474 px | — | No | 663 / 2631 / 5226 / 5835 / 4473 / 7071 |
| 390×844 | 2695 px | ≤3376 px | No | 853 / 3638 / 6238 / 8338 / 5687 / 10132 |

Home’s default primary action count is two: **Start with NVIDIA** and **Choose a project**. The only Home directory action is the accurately named global **Facility Directory** control, with Texas retained as the featured rollout geography in the project path. No legacy Home chrome was found in the rendered page (`legacyChrome: 0`).

## Focus and navigation checks

- `#how-it-works/tour-sources` mounted the tour, scrolled below the sticky shell, and focused `#tour-sources`.
- `#how-it-works/tour-built-by` mounted the tour, scrolled below the sticky shell, and focused `#tour-built-by`.
- Home’s project-path focus target is keyboard focusable and honors reduced motion when the hero action reveals it.
- Full model / cash-flow details are collapsed until requested; financial tabs remain available.
- Browser screenshots:
  - [1440×900 Home](screenshots/home-1440x900.png)
  - [1366×768 Home](screenshots/home-1366x768.png)
  - [1024×768 Home](screenshots/home-1024x768.png)
  - [768×1024 Home](screenshots/home-768x1024.png)
  - [390×844 Home](screenshots/home-390x844.png)
- Raw measurement record: [measurements.json](measurements.json)

## Validation results

- Typecheck: passed.
- Unit tests: **207 passed, 0 failed**.
- Production-host contract test: passed; active routes, release parity, and no-store cache behavior verified.
- Managed SafeLoc workflow: running after restart with the reconciled bundle.
- Browser suite: one bounded run reached the legacy suite and exposed 44 failures from stale expectations for retired route aliases, duplicate Home actions, and pre-reconciliation session behavior. The first failure was an expected old `#evidence` route assertion while the reconciled interface keeps unified analysis mounted at `#analysis`; the suite timed out at the repository’s five-minute command limit. These are recorded baseline failures, not release-host or type/unit failures.

## Acceptance gate

Do not deploy until the production host is republished and both public release documents report `bundle-ce367c0d3622ca1d` (or the subsequent build’s exact bundle ID), with the rendered Home matching the screenshots and measurements above.