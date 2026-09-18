---
name: Bounded multi-pass research
description: Reliability boundary for retrieval plus optional targeted synthesis within one request deadline.
---

Bound every parallel retrieval call below the overall request deadline, and treat targeted re-retrieval and re-synthesis as optional once a valid first synthesis exists. If the optional pass exhausts the remaining budget, return the validated first result rather than converting useful work into an upstream failure.

**Why:** Live providers can complete initial synthesis near the total deadline; allowing a second pass to consume the remainder caused valid 16-item results to be discarded as timeout failures.

**How to apply:** Any added research phase must reserve enough time for synthesis, preserve the last validated result, and expose partial search coverage rather than failing the whole request.

Google-grounded discovery is one project-level request. After an explicit Google technical failure, the OpenAI web-search fallback is also one project-level request shared by category reconciliation; it must retain the project-wide response budget rather than a category-sized output limit.

**Why:** Treating the fallback as category work silently recreated the old provider-call fan-out and made the bounded Google-first contract impossible to verify.

**How to apply:** Count Google plus the single fallback in run-wide provider telemetry, keep grounded extraction web-disabled on success, and reuse the one fallback result across all category gates.