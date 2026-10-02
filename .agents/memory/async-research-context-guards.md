---
name: Async research context guards
description: Prevent delayed research callbacks from applying to a stale or superseded active project.
---

When validating async research completions, compare against a synchronously updated reference to the latest active project and request, not project state captured by a render closure.

**Why:** A research dialog can be closed or another project selected while a fetch is running. A callback captured before that change can discard a valid result or allow a stale one through.

**How to apply:** Update the current-context reference in the same path as project selection, research start/result, restore, and reset. Before applying a result, verify both its request identity and project identity. Keep server outcome distinct from the client lifecycle label.