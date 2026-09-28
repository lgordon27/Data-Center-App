---
name: Conservative provider spend reservations
description: Why paid evidence calls hold daily capacity before usage can be settled
---

Reserve an upper bound on provider spend atomically before each paid request, then settle against provider-reported token counts when a successful response contains valid usage. If transport fails or usage cannot be verified, leave the reservation charged against the day's capacity rather than assuming the provider did not bill.

**Why:** A network timeout can occur after the provider has accepted and billed a request. Releasing the capacity on an ambiguous failure would let concurrent workers exceed the daily cap without realizing it.

**How to apply:** Any later shared spend guard or research-route integration should treat ambiguous responses conservatively. If adding a recovery mechanism, reconcile against authoritative provider usage rather than automatically expiring same-day reservations.