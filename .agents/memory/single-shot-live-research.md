---
name: Single-shot live research
description: The live-validation request policy and why it is enforced at the user-facing boundary.
---

User-facing live research validation must make one browser request, one Gemini discovery request, no client timeout retry, no malformed-response corrective provider retry, and no OpenAI web-search fallback. Lower-level research helpers may retain opt-in fallback and repair behavior for offline fixtures and other explicitly authorized workflows.

**Why:** Changing lower-level defaults broke unrelated fixture contracts and obscured whether failures came from the validation policy or the research pipeline. Enforcing the policy at the HTTP boundary keeps the actual browser workflow strict while preserving explicit test coverage of fallback behavior.

**How to apply:** Keep the browser request marked as single-shot and have the request handler disable fallback and corrective retries for that request. Live acceptance defaults should also remain single-shot. Do not remove DNS pinning, SSRF checks, bounded document access, or retained partial results.