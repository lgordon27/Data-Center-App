---
name: Single-shot live research
description: The live-validation request policy and why it is enforced at the user-facing boundary.
---

User-facing live research validation must make one browser request, one Gemini discovery request, no client timeout retry, no malformed-response corrective provider retry, and no OpenAI web-search fallback. Lower-level research helpers may retain opt-in fallback and repair behavior for offline fixtures and other explicitly authorized workflows.

**Why:** Changing lower-level defaults broke unrelated fixture contracts and obscured whether failures came from the validation policy or the research pipeline. Enforcing the policy at the HTTP boundary keeps the actual browser workflow strict while preserving explicit test coverage of fallback behavior.

**How to apply:** Keep the browser request marked as single-shot and have the request handler disable fallback and corrective retries for that request. Live acceptance defaults should also remain single-shot. Do not remove DNS pinning, SSRF checks, bounded document access, or retained partial results.

Diagnostic live canaries must bind offline gate results to both the committed revision and the working-tree content hash, and preserve the report before cleaning up isolated storage. A failed authorized invocation consumes its authorization; it must not be retried merely because no proposal was produced.

**Why:** A green baseline from different source content does not authorize the current pipeline, and a provider failure or legitimate zero-eligible outcome is still the result of the single authorized experiment.

**How to apply:** Finish source edits before recording gate identity; make no provider preflight calls. Keep generated gate files and reports outside the source tree, use fresh temporary cache/registry and test-only audit storage, and require new explicit authorization for a future live experiment.