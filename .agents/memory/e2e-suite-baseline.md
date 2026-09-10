---
name: Compare e2e failures against a clean baseline
description: Compare SafeLoc browser failures against the maintained four-view contract before attributing them to a code change.
---

The maintained SafeLoc browser suite covers the four-view workbench across desktop and mobile; retired route and agent assertions should be rewritten to current user journeys rather than restored as compatibility UI. Provider-state tests must intercept exact response envelopes, and long timeout tests should use the browser's controlled clock rather than wall-clock bounds.

**Why:** Route-level assertions can outlive the interface they describe, external provider state can change between runs, and browser scheduling overhead makes real-time timeout measurements flaky.

**How to apply:** When browser tests fail, compare them with the current route/view contract first; control provider responses and simulated time in the test while preserving exact state and recovery assertions.
