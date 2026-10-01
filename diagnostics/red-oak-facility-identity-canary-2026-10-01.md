# Red Oak Facility Identity — bounded canary report

- **Outcome:** bounded-canary-finished-identity-unresolved; final identity gate is unresolved.
- **Source revision:** e6cbf4374ee8ef333bfbaf678411922bb66546fe
- **Offline gates:** package tests 481/481; standalone data tests 35/35; typecheck and production build passed.
- **Canary limits:** 1/1 discovery requests; 7/8 physical opens; 0/1 structured calls; no retries or follow-up discovery.

## Executed queries

These six terms were issued within one bounded discovery request. Candidate-to-query attribution is unavailable from provider telemetry.

1. `Red Oak Campus DataBank Red Oak Campus DataBank Red Oak, Ellis County, Texas data center financing construction loan development announcement`
2. `\"Red Oak Campus\" DataBank DFW9 DFW10 DFW11 Red Oak, Ellis County, Texas facility building campus data center`
3. `\"Red Oak Campus\" DataBank Red Oak Campus DataBank Red Oak Campus Red Oak, Ellis County, Texas project campus data center`
4. `Red Oak Campus DataBank Red Oak Campus DataBank Red Oak, Ellis County, Texas project-specific permits TDLR TABS zoning building records site:tdlr.texas.gov`
5. `Red Oak Campus DataBank Red Oak Campus DataBank DFW9 DFW10 DFW11 Red Oak, Ellis County, Texas data center electric power utility grid substation interconnection`
6. `Red Oak Campus DataBank Red Oak Campus DataBank Red Oak, Ellis County, Texas data center trade reporting local news community financing construction`

## Candidates and facility identifiers

- Provider discovery recorded **20 candidate records** across these returned title/domain labels: databank.com (9), datacentermap.com (1), baxtel.com (1), checkmarkpro.com (1), jrh-construction.com (1), davispolk.com (1), theaiconsultingnetwork.com (1), r-o.com (1), bisnow.com (1), therealdeal.com (1), dallasinnovates.com (1), youtube.com (1).
- The normalized list contained 2 records but only 1 unique URL: https://baxtel.com/data-center/databank-red-oak-dfw9. One record was retained and one was rejected as a duplicate.
- Candidate attribution to individual query terms: unavailable; no mapping is inferred.
- Facility IDs in retained passage text: DFW9. DFW9 found: yes; DFW10: no; DFW11: no.
- DFW15 appeared only in a candidate URL that returned HTTP 429; it was not retained evidence. Candidate-title facility hints: none.

## Physical opens and retained evidence

- **1.** databank.com — https://www.databank.com/data-centers/dallas/red-oak-campus/: blocked; private-destination.
- **2.** datacentermap.com — https://www.datacentermap.com/usa/texas/dallas/databank-dfw15-red-oak/: blocked (HTTP 429); http-429.
- **3.** databank.com — https://www.databank.com/resources/news/dallas-based-firm-lands-2-billion-construction-loan-for-data-center-campus/: blocked; private-destination.
- **4.** databank.com — https://www.databank.com/resources/blogs/building-the-future-inside-databanks-red-oak-campus-construction/: blocked; private-destination.
- **5.** databank.com — https://www.databank.com/resources/videos/inside-databanks-red-oak-campus-data-centers/: blocked; private-destination.
- **6.** databank.com — https://www.databank.com/resources/news/inside-databanks-multibillion-dollar-red-oak-data-center-campus/: blocked; private-destination.
- **7.** baxtel.com — https://baxtel.com/data-center/databank-red-oak-dfw9: accessible (HTTP 200); 4000 characters extracted; retrieved.

One usable passage was retained (1500 characters in the normalized retained excerpt); it contained DFW9 but did not establish exact-campus or related-facility identity. Exact-campus passages: 0; related-facility passages: 0.

## Identity and structured analysis

- **Identity outcome:** unresolved (unresolved).
- **Structured analysis:** not issued; provider response ID: none.
- **Final blocker:** Project identity remains unresolved: one usable passage was retained, but it established neither exact campus nor a specifically related facility.

No further discovery, retries, provider calls, code changes, or deployment were performed after this canary.

Sanitized JSON detail: `diagnostics/red-oak-facility-identity-canary-2026-10-01.json`
