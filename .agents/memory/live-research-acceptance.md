---
name: Live research acceptance behavior
description: Live web-search acceptance runs can time out before category telemetry exists and must remain diagnostic.
---

When a live category-research provider run fails before returning an audit, report the configured provider/model, measured duration, all categories as provider-failure gaps, zero observed queries/sources, and the safe provider limitation. Do not infer execution from the planned query schedule. If a forced refresh returns HTTP 200 with stale retained data, label the old audit as historical rather than current-run telemetry.

**Why:** A refresh failure can return a successful HTTP status while carrying an older cached audit, so status code alone cannot establish that current provider telemetry exists.

**How to apply:** Keep timeout and partial-provider outcomes visible in acceptance reports, separate current and retained fields, and rely on the retained-cache path only for previously valid results.