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

Classify upstream HTTP 429 responses from allowlisted provider error code/type fields, not from status alone. Keep confirmed quota/billing limits, temporary provider rate limits, unknown 429s, and the app's own request limiter distinct. A low-cost probe can succeed immediately before a full bounded run consumes the available token-per-minute allowance, so probe success establishes access but not batch capacity.

**Why:** A direct OpenAI probe and several category requests succeeded, then the provider explicitly returned `rate_limit_exceeded` with zero remaining tokens and retry/reset indicators. Treating every 429 as quota exhaustion hid this distinction.

**How to apply:** Retain a bounded sanitized provider message, request ID, retry delay, and selected rate-limit headers. Redact credentials, organization identifiers, and email addresses. Stop later acceptance runs after a systemic provider failure rather than retrying the whole batch.