---
name: Compare e2e failures against a clean baseline
description: The SafeLoc workbench Playwright suite is red at rest; diff failures against a clean tree before attributing them to your change.
---

The SafeLoc diligence workbench Playwright suite is not green at rest — some specs fail independent of any change.

**Why:** Without a baseline comparison, pre-existing failure noise both hides real regressions and gets mistaken for breakage your change caused.

**How to apply:** When a suite run after your change shows failures, first establish which of them fail on the clean tree, fix only the failures your change introduced, and report the rest as pre-existing.
