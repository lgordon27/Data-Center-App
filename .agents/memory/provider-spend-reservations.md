---
name: Conservative provider spend reservations
description: Why paid evidence calls hold daily capacity before usage can be settled
---

Reserve an upper bound on provider spend atomically before each paid request. Release it only for failures known to happen before send or an explicit provider HTTP error; settle valid successful usage at actual cost, and charge the full ceiling for ambiguous outcomes or unusable usage. If settlement fails, keep the capacity reserved and log only a safe event label.

**Why:** A network timeout can occur after the provider has accepted and billed a request. Releasing on an ambiguous failure or charging less than the reservation when usage is missing could let concurrent workers exceed the daily cap without realizing it; retaining capacity after a database error is the conservative fallback.

**How to apply:** Any later shared spend guard or research-route integration should distinguish pre-send setup, explicit HTTP rejections, ambiguous transport outcomes, and successful responses with valid usage. If adding a recovery mechanism, reconcile against authoritative provider usage rather than automatically expiring same-day reservations.