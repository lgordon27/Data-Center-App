---
name: Live research acceptance behavior
description: Live web-search acceptance runs can time out before category telemetry exists and must remain diagnostic.
---

When a live category-research provider run fails before returning an audit, report the configured provider/model, measured duration, all categories as provider-failure gaps, zero observed queries/sources, and the safe provider limitation. Do not infer execution from the planned query schedule. If a forced refresh returns HTTP 200 with stale retained data, label the old audit as historical rather than current-run telemetry.

**Why:** A refresh failure can return a successful HTTP status while carrying an older cached audit, so status code alone cannot establish that current provider telemetry exists.

**How to apply:** Keep timeout and partial-provider outcomes visible in acceptance reports, separate current and retained fields, and rely on the retained-cache path only for previously valid results.

An HTTP-successful provider run is still research-incomplete when it retains no attributable passage and establishes no eligible evidence. Quota failure before audit creation has no research run ID and must not inherit one from an earlier attempt.

**Why:** Bounded live runs can return HTTP 200 after issuing category requests while producing only blocked candidates, no passages, and unresolved inputs; later quota failures can stop before telemetry exists.

**How to apply:** Report useful completion separately from transport completion. Include the research run ID only when the provider audit returned one, and treat zero-passage or pre-audit quota outcomes as blockers rather than successful acceptance.

Browser recovery deadlines must be enforced by UI-owned wall-clock state, independent of fetch rejection and abort delivery. Network and server timeouts remain cleanup boundaries, not the trigger for showing recovery.

**Why:** Proxied requests can remain pending beyond fetch or server budgets, leaving users trapped in loading even when abort signals are expected to fire.

**How to apply:** At the visible deadline, disregard late results, attempt cancellation, and render recovery choices immediately; verify with a genuinely unresolved browser request and elapsed real time.