---
name: Compare e2e failures against a clean baseline
description: The SafeLoc workbench Playwright suite is red at rest; diff failures against a clean tree before attributing them to your change.
---

The SafeLoc diligence workbench Playwright suite is not green at rest — some specs fail independent of any change.

**Why:** Without a baseline comparison, pre-existing failure noise both hides real regressions and gets mistaken for breakage your change caused.

**How to apply:** When a suite run after your change shows failures, first establish which of them fail on the clean tree, fix only the failures your change introduced, and report the rest as pre-existing.

Known-red as of 2026-09-09: the FULL suite is broadly red at rest — 117 failed / 103 passed / 22 skipped on a clean tree (both chromium projects), spanning fema-nri, eia-electricity, data-freshness, company-exposure, custom-project-research, routing-history, claim-provenance, community-agreements, advisor-material-gaps, ai-evidence, and workbench-refinement. The earlier belief that redness was limited to six workbench-refinement tests was wrong. Also: tests/custom-project-research-batch1.spec.ts "shows recovery within 46 seconds…" is load-flaky — it fails only under full-suite parallel load and passes in isolation; verify single-spec before attributing. A repair task exists in the project task list (currently scoped only to the workbench-refinement checks; it understates the true scope).
