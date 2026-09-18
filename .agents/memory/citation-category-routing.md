---
name: Citation category routing
description: Routing invariant for provider citations with missing, unknown, mixed, or recognized category metadata.
---

Missing, empty, unusable, or wholly unknown citation category metadata means relevance is unresolved, not that the retrieved passage should be excluded. Mixed recognized and unknown labels retain the recognized scope rather than broadening to every category. The same matcher must govern both passage availability and structured-analysis context.

**Why:** Separate gate and prompt filters caused physically retained unlabeled passages to pass one interpretation but disappear under another; mixed labels could also be admitted more broadly than the actual analysis input.

**How to apply:** Normalize provider labels without fabricating fields, preserve unknown labels for audit, and route unresolved citations for relevance assessment only. Never infer project identity, applicability, or evidence eligibility from routing.