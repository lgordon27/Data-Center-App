---
name: Compare e2e failures against a clean baseline
description: Compare SafeLoc browser failures against the maintained four-view contract before attributing them to a code change.
---

The maintained SafeLoc browser suite covers the four-view workbench across desktop and mobile; retired route and agent assertions should be rewritten to current user journeys rather than restored as compatibility UI.

**Why:** Route-level assertions can outlive the interface they describe, and adding obsolete compatibility surfaces would undermine the current product contract.

**How to apply:** When browser tests fail, compare them with the current route/view contract first, then preserve meaningful user-journey coverage while removing stale selectors and retired-page assumptions.
