---
name: Deterministic navigation performance
description: How to keep navigation responsiveness checks meaningful and stable under parallel browser execution.
---

For navigation responsiveness, verify the workload boundary explicitly, time the synchronous route-dispatch operation against the fixed threshold, and separately assert that the destination becomes ready. Do not use two animation frames as a proxy for main-thread work when the browser projects run in parallel.

**Why:** Animation-frame delivery includes host scheduling and worker contention, so an unchanged route can intermittently exceed a wall-clock threshold even when dispatch is immediate and the destination renders correctly.

**How to apply:** Use this for browser checks that protect leaving a bounded list or stalled provider view. Keep the original threshold, assert the fixture size and rendered-page bound, measure route dispatch, then assert the destination UI.