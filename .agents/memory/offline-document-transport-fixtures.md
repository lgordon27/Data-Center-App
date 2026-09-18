---
name: Offline document transport fixtures
description: Mocked document fetches must not bypass the public-address and redirect policy being tested.
---

Offline document-access tests need an explicit transport seam that receives the address validated for the current URL. The seam must resolve and validate every redirect hop before returning a fixture response; ordinary fetch mocks may remain lightweight only when the test is not exercising network safeguards.

**Why:** A fetch mock that bypasses the resolver cannot distinguish a real public-page access failure from a DNS classification, redirect, or rebinding failure, and can make SSRF regressions invisible.

**How to apply:** Keep production on the pinned Node transport, use controlled DNS plus the validated-address transport seam for offline security fixtures, and assert that private, mixed, reserved, and rebinding answers never reach the fixture transport.