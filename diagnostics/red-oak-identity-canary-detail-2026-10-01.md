# Red Oak identity and broadened discovery canary

Diagnostic only; not evidence, accepted research, a dossier change, or a model input.
The single authorized invocation is consumed, including a failed or incomplete result. No retries or further live work were performed.

## Prior blocker and repair

The unchanged saved 1,500-character announcement excerpt reproduced ambiguous identity because DataBank's comma-separated company description before “announced the development of” was not recognized as attribution. A narrow same-fragment development-announcement rule now recognizes that connected wording. Explicit conflicts still fail closed. The missing historical 4,000-character passage remainder was not reconstructed or re-fetched.

See [offline identity trace](red-oak-identity-trace-offline-2026-10-01.md) and [baseline discovery audit](red-oak-discovery-coverage-baseline-2026-10-01.md).

## Before/after query coverage

The previous dedicated prompt excluded financing, construction, permitting, and community. Its ordinary production counterpart mentioned broad categories but had no deterministic query set.
Previous provider-observed queries:
- DataBank Red Oak campus Texas electric power substation Oncor ERCOT
- DataBank Red Oak data center campus electric grid utility power

New requested query plan (not proof of execution):
- "Red Oak Campus" DataBank Red Oak Campus DataBank Red Oak Campus Red Oak, Ellis County, Texas project campus data center
- "Red Oak Campus" DataBank DFW9 DFW10 DFW11 Red Oak, Ellis County, Texas facility building campus data center
- Red Oak Campus DataBank Red Oak Campus DataBank Red Oak, Ellis County, Texas project-specific permits TDLR TABS zoning building records site:tdlr.texas.gov
- Red Oak Campus DataBank Red Oak Campus DataBank Red Oak, Ellis County, Texas data center financing construction loan development announcement
- Red Oak Campus DataBank Red Oak Campus DataBank DFW9 DFW10 DFW11 Red Oak, Ellis County, Texas data center electric power utility grid substation interconnection
- Red Oak Campus DataBank Red Oak Campus DataBank Red Oak, Ellis County, Texas data center trade reporting local news community financing construction

New provider-observed executed queries (only search-call receipts):
- Red Oak Campus DataBank Red Oak Campus DataBank Red Oak Ellis County Texas project specific permits TDLR TABS zoning building records site tdlr texas gov
- Red Oak Campus DataBank Red Oak Campus DataBank Red Oak Campus Red Oak Ellis County Texas project campus data center
- Red Oak Campus DataBank DFW9 DFW10 DFW11 Red Oak Ellis County Texas facility building campus data center
- Red Oak Campus DataBank Red Oak Campus DataBank DFW9 DFW10 DFW11 Red Oak Ellis County Texas data center electric power utility grid substation interconnection
- Red Oak Campus DataBank Red Oak Campus DataBank Red Oak Ellis County Texas data center trade reporting local news community financing construction
- Red Oak Campus DataBank Red Oak Campus DataBank Red Oak Ellis County Texas data center financing construction loan development announcement

## Run outcome and limits
```json
{
  "run": {
    "status": "incomplete-technical-limitation",
    "telemetryStatus": "current-live",
    "runId": "93e00b8e-6179-49ef-aa41-765ee3c3a3c5",
    "researchStatus": "partial",
    "researchOutcome": "incomplete-technical-limitation",
    "intentionalRetrievalOnlyStop": false,
    "httpStatus": 200,
    "provider": "google-gemini-grounding",
    "model": "gemini-3.8-flash",
    "discovery": {
      "provider": "google-gemini-grounding",
      "model": "gemini-3.8-flash",
      "status": "completed",
      "state": "usable-citations",
      "queries": [
        "Red Oak Campus DataBank Red Oak Campus DataBank Red Oak Ellis County Texas project specific permits TDLR TABS zoning building records site tdlr texas gov",
        "Red Oak Campus DataBank Red Oak Campus DataBank Red Oak Campus Red Oak Ellis County Texas project campus data center",
        "Red Oak Campus DataBank DFW9 DFW10 DFW11 Red Oak Ellis County Texas facility building campus data center",
        "Red Oak Campus DataBank Red Oak Campus DataBank DFW9 DFW10 DFW11 Red Oak Ellis County Texas data center electric power utility grid substation interconnection",
        "Red Oak Campus DataBank Red Oak Campus DataBank Red Oak Ellis County Texas data center trade reporting local news community financing construction",
        "Red Oak Campus DataBank Red Oak Campus DataBank Red Oak Ellis County Texas data center financing construction loan development announcement"
      ],
      "requestedQueryPlan": [
        "\"Red Oak Campus\" DataBank Red Oak Campus DataBank Red Oak Campus Red Oak, Ellis County, Texas project campus data center",
        "\"Red Oak Campus\" DataBank DFW9 DFW10 DFW11 Red Oak, Ellis County, Texas facility building campus data center",
        "Red Oak Campus DataBank Red Oak Campus DataBank Red Oak, Ellis County, Texas project-specific permits TDLR TABS zoning building records site:tdlr.texas.gov",
        "Red Oak Campus DataBank Red Oak Campus DataBank Red Oak, Ellis County, Texas data center financing construction loan development announcement",
        "Red Oak Campus DataBank Red Oak Campus DataBank DFW9 DFW10 DFW11 Red Oak, Ellis County, Texas data center electric power utility grid substation interconnection",
        "Red Oak Campus DataBank Red Oak Campus DataBank Red Oak, Ellis County, Texas data center trade reporting local news community financing construction"
      ],
      "candidateCount": 20,
      "annotationCount": 50,
      "fallbackProvider": null,
      "fallbackReason": null,
      "fallbackRequestCount": 0,
      "providerRequestCount": 1,
      "rawAnnotationSummariesAvailability": "reported",
      "rawAnnotationSummariesSource": "researchAudit.discovery",
      "acceptedCitationUrlsAvailability": "reported",
      "acceptedCitationUrlsSource": "researchAudit.discovery",
      "rejectedCitationUrlsAvailability": "reported",
      "rejectedCitationUrlsSource": "researchAudit.discovery",
      "rawAnnotationSummaries": [
        {
          "discoveryRank": 1,
          "type": "url_citation",
          "title": "datacentermap.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 2,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 3,
          "type": "url_citation",
          "title": "texas.gov",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 4,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 5,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 6,
          "type": "url_citation",
          "title": "datacentermap.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 7,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 8,
          "type": "url_citation",
          "title": "youtube.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 9,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 10,
          "type": "url_citation",
          "title": "bisnow.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 11,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 12,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 13,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 14,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 15,
          "type": "url_citation",
          "title": "youtube.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 16,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 17,
          "type": "url_citation",
          "title": "youtube.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 18,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 19,
          "type": "url_citation",
          "title": "youtube.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 20,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 21,
          "type": "url_citation",
          "title": "youtube.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 22,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 23,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 24,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 25,
          "type": "url_citation",
          "title": "jrh-construction.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 26,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 27,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 28,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 29,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 30,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 31,
          "type": "url_citation",
          "title": "texas.gov",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 32,
          "type": "url_citation",
          "title": "texas.gov",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 33,
          "type": "url_citation",
          "title": "zabalist.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 34,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 35,
          "type": "url_citation",
          "title": "r-o.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 36,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 37,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 38,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 39,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 40,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 41,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 42,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 43,
          "type": "url_citation",
          "title": "databank.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 44,
          "type": "url_citation",
          "title": "theaiconsultingnetwork.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 45,
          "type": "url_citation",
          "title": "dallasinnovates.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 46,
          "type": "url_citation",
          "title": "facebook.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
          "accepted": true,
          "rejectionReason": null
        },
        {
          "discoveryRank": 47,
          "type": "url_citation",
          "title": "dallasinnovates.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 48,
          "type": "url_citation",
          "title": "jrh-construction.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 49,
          "type": "url_citation",
          "title": "facebook.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
          "accepted": false,
          "rejectionReason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 50,
          "type": "url_citation",
          "title": "youtube.com",
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615",
          "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615",
          "accepted": true,
          "rejectionReason": null
        }
      ],
      "acceptedCitationUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615"
      ],
      "rejectedCitationUrls": [
        {
          "discoveryRank": 6,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 11,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 14,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 15,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 16,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 17,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 18,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 19,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 20,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 21,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 22,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 23,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 24,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 26,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 27,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 28,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 29,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 30,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 32,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 34,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 36,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 37,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 38,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 40,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 41,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 42,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 43,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 47,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 48,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
          "reason": "duplicate-canonical-url"
        },
        {
          "discoveryRank": 49,
          "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
          "reason": "duplicate-canonical-url"
        }
      ]
    },
    "providerResponseIds": [
      "v1_ChdLckM5YXJXYkxzdWlxdHNQODY3ZDJBTRIXS3JDOWFyV2JMc3VpcXRzUDg2N2QyQU0"
    ],
    "startedAt": "2026-10-01T00:58:18.526Z",
    "finishedAt": "2026-10-01T00:58:34.691Z",
    "elapsedMs": 16165,
    "wallClockElapsedMs": 16200,
    "phaseTiming": {
      "runStartedAt": "2026-10-01T00:58:18.526Z",
      "discoveryStartedAt": "2026-10-01T00:58:18.540Z",
      "discoveryFinishedAt": "2026-10-01T00:58:34.624Z",
      "orchestrationStartedAt": "2026-10-01T00:58:34.650Z",
      "orchestrationFinishedAt": "2026-10-01T00:58:34.684Z",
      "cancellationAt": null,
      "orchestrationBudgetMs": 58878,
      "discoveryElapsedMs": 16084,
      "orchestrationElapsedMs": 34,
      "providerQueueElapsedMs": 0,
      "analysisElapsedMs": 0,
      "retrievalElapsedMs": 641,
      "totalElapsedMs": 16159
    },
    "failureType": null,
    "failureMessage": null,
    "providerDiagnostic": null,
    "elapsedWithinDeadline": true,
    "providerRequestCount": 1,
    "providerAttempts": [
      {
        "provider": "google-gemini-grounding",
        "model": "gemini-3.8-flash",
        "providerResponseId": "v1_ChdLckM5YXJXYkxzdWlxdHNQODY3ZDJBTRIXS3JDOWFyV2JMc3VpcXRzUDg2N2QyQU0",
        "providerResponseIdAvailability": "provider-reported",
        "usageAvailability": "provider-reported",
        "requestCount": 1,
        "categoryId": null,
        "attemptType": null,
        "queuedAt": "2026-10-01T00:58:18.540Z",
        "issuedAt": "2026-10-01T00:58:18.540Z",
        "finishedAt": "2026-10-01T00:58:34.098Z",
        "queueWaitMs": 0,
        "elapsedMs": 15558,
        "status": 200,
        "requestState": "completed",
        "outcome": "completed",
        "failureClassification": null,
        "inFlightAnalysisCount": 0,
        "inFlightAnalysisCountAtIssue": 1,
        "providerDiagnostic": null,
        "requestedOutputTokens": null,
        "requestBodyBytes": 2125,
        "usage": {
          "inputTokens": null,
          "outputTokens": null,
          "totalTokens": 4103
        }
      }
    ],
    "inFlightAnalysisCount": 0,
    "toolCallCount": 0,
    "followUpCount": 0,
    "budget": {
      "deadlineMs": 75000,
      "maxProviderRequests": 2,
      "maxFollowUps": 0,
      "maxFollowUpsPerCategory": 0,
      "maxCandidatesPerCategory": 8,
      "maxTotalCandidates": 16,
      "maxToolCalls": 32,
      "maxPhysicalDocumentOpens": 8
    },
    "limitsObserved": {
      "providerRequestsWithinLimit": true,
      "followUpsWithinLimit": true,
      "toolCallsWithinLimit": true,
      "candidatesWithinTotalLimit": true,
      "candidatesByCategory": {
        "project-identity": 0,
        "grid": 1,
        "electricity": 0,
        "water": 0,
        "permitting-community": 0,
        "construction-capital": 0,
        "tenant-counterparty": 0,
        "climate-operational-hazard": 0
      },
      "candidateCategoryLimit": 8
    }
  },
  "scope": {
    "categories": [
      "grid"
    ],
    "discoveryRequestedCategories": [
      "exact-project-and-operator",
      "aliases-and-facility-identifiers",
      "official-and-government-records",
      "financing-and-construction",
      "power-and-grid",
      "trade-local-community-reporting"
    ],
    "identityGateRequired": true,
    "identityGateState": "unresolved",
    "retrievalOnly": false,
    "groundedDiscoveryRequests": 1,
    "structuredProviderCalls": 0,
    "totalProviderRequests": 1,
    "physicalDocumentOpens": 7,
    "limits": {
      "groundedDiscoveryRequests": 1,
      "structuredProviderCalls": 1,
      "totalProviderRequests": 2,
      "physicalDocumentOpens": 8,
      "followUps": 0,
      "openAIFallback": false,
      "correctiveRetries": false,
      "providerRetries": false,
      "secConnectorDefault": false,
      "failureRehearsal": false,
      "researchTimeoutMs": 75000,
      "invocationTimeoutMs": 90000
    }
  },
  "identityGate": {
    "required": true,
    "state": "unresolved",
    "usableRetainedPassageCount": 1,
    "exactProjectPassageCount": 0,
    "reason": "No successfully retrieved retained passage establishes the exact requested project identity."
  },
  "remainingBlockers": {
    "unresolvedCategories": [
      "project-identity"
    ],
    "canaryIdentityGateState": "unresolved",
    "identityEstablishedBeforeStructuredCall": false,
    "retainedUsablePassageButIdentityUnresolved": true,
    "noUsableGroundedPassageAvailableForAnalysis": false,
    "structuredProviderCalls": 0,
    "gridAnalysisPacketCount": 0,
    "gridAnalysisPassageCount": 0,
    "physicalOpenBudgetExhausted": false,
    "physicalOpensUsed": 7,
    "physicalOpenLimit": 8,
    "accessibleRetrievedSourcesNotSuppliedToGrid": {
      "candidateCount": 2,
      "officialDomains": [
        "www.tdlr.texas.gov"
      ],
      "note": "An accessible source is not evidence it was supplied to Grid analysis or supported a Grid claim."
    },
    "deadlineCauseAsserted": false
  },
  "isolation": {
    "storageMode": "isolated-temporary-cache-and-registry",
    "researchCacheReuse": "disabled-by-fresh-cache-and-force-refresh",
    "registryStorage": "isolated-temporary-directory",
    "auditStorage": "in-memory",
    "productionResearchStateRead": false,
    "productionResearchStateWritten": false
  },
  "totalRuntimeMs": 16310
}
```

## Candidate accounting

Deduplication is by discovery canonical URL, not domain. Opaque original redirects stay unknown before opening; destinations are classified only if a governed receipt exposes them. Repeated source-ledger rows are not additional discovery candidates. Annotation duplicates and reused receipts are reported separately.

Original order | Acquisition rank | Title | Original / destination | Selection / access outcome
--- | --- | --- | --- | ---
1 | 1 | datacentermap.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc | { "selection": { "decision": "selected", "selected": true, "reason": "Physical document open was attempted.", "physicalOpenPosition": 1 } }
2 | 2 | databank.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0 | { "selection": { "decision": "selected", "selected": true, "reason": "Physical document open was attempted.", "physicalOpenPosition": 2 } }
3 | 3 | texas.gov | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51 | { "selection": { "decision": "reused", "selected": false, "reason": "retrieved", "physicalOpenPosition": 3 } }
4 | 4 | databank.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f | { "selection": { "decision": "selected", "selected": true, "reason": "Physical document open was attempted.", "physicalOpenPosition": 4 } }
5 | 5 | databank.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f | { "selection": { "decision": "selected", "selected": true, "reason": "Physical document open was attempted.", "physicalOpenPosition": 5 } }
7 | 6 | databank.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c | { "selection": { "decision": "selected", "selected": true, "reason": "Physical document open was attempted.", "physicalOpenPosition": 6 } }
9 | 7 | databank.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45 | { "selection": { "decision": "selected", "selected": true, "reason": "Physical document open was attempted.", "physicalOpenPosition": 7 } }
10 | 8 | bisnow.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866 | { "selection": { "decision": "not-selected", "selected": false, "reason": "protected-opportunity", "physicalOpenPosition": null } }
12 | 9 | databank.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126 | { "selection": { "decision": "not-selected", "selected": false, "reason": "protected-opportunity", "physicalOpenPosition": null } }
13 | 10 | databank.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab | { "selection": { "decision": "not-selected", "selected": false, "reason": "protected-opportunity", "physicalOpenPosition": null } }
25 | 11 | jrh-construction.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22 | { "selection": { "decision": "not-selected", "selected": false, "reason": "protected-opportunity", "physicalOpenPosition": null } }
31 | 12 | texas.gov | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59 | { "selection": { "decision": "not-selected", "selected": false, "reason": "protected-opportunity", "physicalOpenPosition": null } }
33 | 13 | zabalist.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c | { "selection": { "decision": "not-selected", "selected": false, "reason": "protected-opportunity", "physicalOpenPosition": null } }
35 | 14 | r-o.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16 | { "selection": { "decision": "not-selected", "selected": false, "reason": "protected-opportunity", "physicalOpenPosition": null } }
39 | 15 | databank.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2 | { "selection": { "decision": "not-selected", "selected": false, "reason": "protected-opportunity", "physicalOpenPosition": null } }
44 | 16 | theaiconsultingnetwork.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8 | { "selection": { "decision": "not-selected", "selected": false, "reason": "protected-opportunity", "physicalOpenPosition": null } }
45 | 17 | dallasinnovates.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226 | { "selection": { "decision": "not-selected", "selected": false, "reason": "candidate-limit", "physicalOpenPosition": null } }
46 | 18 | facebook.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882 | { "selection": { "decision": "not-selected", "selected": false, "reason": "candidate-limit", "physicalOpenPosition": null } }
8 | 19 | youtube.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0 | { "selection": { "decision": "not-selected", "selected": false, "reason": "candidate-limit", "physicalOpenPosition": null } }
50 | 20 | youtube.com | https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615 / https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615 | { "selection": { "decision": "not-selected", "selected": false, "reason": "candidate-limit", "physicalOpenPosition": null } }

### Provider annotation accounting
```json
{
  "rawAnnotationSummaries": [
    {
      "discoveryRank": 1,
      "type": "url_citation",
      "title": "datacentermap.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 2,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 3,
      "type": "url_citation",
      "title": "texas.gov",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 4,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 5,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 6,
      "type": "url_citation",
      "title": "datacentermap.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 7,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 8,
      "type": "url_citation",
      "title": "youtube.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 9,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 10,
      "type": "url_citation",
      "title": "bisnow.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 11,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 12,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 13,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 14,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 15,
      "type": "url_citation",
      "title": "youtube.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 16,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 17,
      "type": "url_citation",
      "title": "youtube.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 18,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 19,
      "type": "url_citation",
      "title": "youtube.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 20,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 21,
      "type": "url_citation",
      "title": "youtube.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 22,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 23,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 24,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 25,
      "type": "url_citation",
      "title": "jrh-construction.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 26,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 27,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 28,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 29,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 30,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 31,
      "type": "url_citation",
      "title": "texas.gov",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 32,
      "type": "url_citation",
      "title": "texas.gov",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 33,
      "type": "url_citation",
      "title": "zabalist.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 34,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 35,
      "type": "url_citation",
      "title": "r-o.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 36,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 37,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 38,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 39,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 40,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 41,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 42,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 43,
      "type": "url_citation",
      "title": "databank.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 44,
      "type": "url_citation",
      "title": "theaiconsultingnetwork.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 45,
      "type": "url_citation",
      "title": "dallasinnovates.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 46,
      "type": "url_citation",
      "title": "facebook.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
      "accepted": true,
      "rejectionReason": null
    },
    {
      "discoveryRank": 47,
      "type": "url_citation",
      "title": "dallasinnovates.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 48,
      "type": "url_citation",
      "title": "jrh-construction.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 49,
      "type": "url_citation",
      "title": "facebook.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
      "accepted": false,
      "rejectionReason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 50,
      "type": "url_citation",
      "title": "youtube.com",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615",
      "accepted": true,
      "rejectionReason": null
    }
  ],
  "acceptedCitationUrls": [
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615"
  ],
  "rejectedCitationUrls": [
    {
      "discoveryRank": 6,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 11,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 14,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 15,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 16,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 17,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 18,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 19,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 20,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 21,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 22,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 23,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 24,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 26,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 27,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 28,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 29,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 30,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 32,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 34,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 36,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 37,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 38,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 40,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 41,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 42,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 43,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 47,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 48,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
      "reason": "duplicate-canonical-url"
    },
    {
      "discoveryRank": 49,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
      "reason": "duplicate-canonical-url"
    }
  ]
}
```

### Full request-local receipt and admission accounting
```json
{
  "captureStatus": "request-local-sanitized-bounded-passage-excerpts-no-full-document-payloads",
  "discoveryCandidateCount": 20,
  "discoveryCandidateSnapshotCount": 20,
  "discoveryCandidatesTruncated": false,
  "discoveryCandidates": [
    {
      "candidateId": "discovery-1",
      "candidateIndex": 1,
      "discoveryRank": 1,
      "acquisitionRank": 1,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
      "resolvedUrl": null,
      "title": "datacentermap.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": true,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "authorized",
      "selectedForOpening": true,
      "selectionDecision": {
        "decision": "selected",
        "selected": true,
        "reason": "Physical document open was attempted.",
        "physicalOpenPosition": 1
      },
      "physicalOpenPosition": 1
    },
    {
      "candidateId": "discovery-2",
      "candidateIndex": 2,
      "discoveryRank": 2,
      "acquisitionRank": 2,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "resolvedUrl": null,
      "title": "databank.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "operator-match",
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": true,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "authorized",
      "selectedForOpening": true,
      "selectionDecision": {
        "decision": "selected",
        "selected": true,
        "reason": "Physical document open was attempted.",
        "physicalOpenPosition": 2
      },
      "physicalOpenPosition": 2
    },
    {
      "candidateId": "discovery-3",
      "candidateIndex": 3,
      "discoveryRank": 3,
      "acquisitionRank": 3,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
      "resolvedUrl": null,
      "title": "texas.gov",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "reused-receipt",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "reused",
        "selected": false,
        "reason": "retrieved",
        "physicalOpenPosition": 3
      },
      "physicalOpenPosition": 3
    },
    {
      "candidateId": "discovery-4",
      "candidateIndex": 4,
      "discoveryRank": 4,
      "acquisitionRank": 4,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "resolvedUrl": null,
      "title": "databank.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "operator-match",
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": true,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "authorized",
      "selectedForOpening": true,
      "selectionDecision": {
        "decision": "selected",
        "selected": true,
        "reason": "Physical document open was attempted.",
        "physicalOpenPosition": 4
      },
      "physicalOpenPosition": 4
    },
    {
      "candidateId": "discovery-5",
      "candidateIndex": 5,
      "discoveryRank": 5,
      "acquisitionRank": 5,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "resolvedUrl": null,
      "title": "databank.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "operator-match",
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": true,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "authorized",
      "selectedForOpening": true,
      "selectionDecision": {
        "decision": "selected",
        "selected": true,
        "reason": "Physical document open was attempted.",
        "physicalOpenPosition": 5
      },
      "physicalOpenPosition": 5
    },
    {
      "candidateId": "discovery-7",
      "candidateIndex": 7,
      "discoveryRank": 7,
      "acquisitionRank": 6,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
      "resolvedUrl": null,
      "title": "databank.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "operator-match",
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": true,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "authorized",
      "selectedForOpening": true,
      "selectionDecision": {
        "decision": "selected",
        "selected": true,
        "reason": "Physical document open was attempted.",
        "physicalOpenPosition": 6
      },
      "physicalOpenPosition": 6
    },
    {
      "candidateId": "discovery-9",
      "candidateIndex": 9,
      "discoveryRank": 9,
      "acquisitionRank": 7,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "resolvedUrl": null,
      "title": "databank.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "operator-match",
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": true,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "authorized",
      "selectedForOpening": true,
      "selectionDecision": {
        "decision": "selected",
        "selected": true,
        "reason": "Physical document open was attempted.",
        "physicalOpenPosition": 7
      },
      "physicalOpenPosition": 7
    },
    {
      "candidateId": "discovery-10",
      "candidateIndex": 10,
      "discoveryRank": 10,
      "acquisitionRank": 8,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
      "resolvedUrl": null,
      "title": "bisnow.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "protected-opportunity",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "protected-opportunity",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-12",
      "candidateIndex": 12,
      "discoveryRank": 12,
      "acquisitionRank": 9,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "resolvedUrl": null,
      "title": "databank.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "operator-match",
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "protected-opportunity",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "protected-opportunity",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-13",
      "candidateIndex": 13,
      "discoveryRank": 13,
      "acquisitionRank": 10,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
      "resolvedUrl": null,
      "title": "databank.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "operator-match",
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "protected-opportunity",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "protected-opportunity",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-25",
      "candidateIndex": 25,
      "discoveryRank": 25,
      "acquisitionRank": 11,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
      "resolvedUrl": null,
      "title": "jrh-construction.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "project-record-source-type",
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "protected-opportunity",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "protected-opportunity",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-31",
      "candidateIndex": 31,
      "discoveryRank": 31,
      "acquisitionRank": 12,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
      "resolvedUrl": null,
      "title": "texas.gov",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "protected-opportunity",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "protected-opportunity",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-33",
      "candidateIndex": 33,
      "discoveryRank": 33,
      "acquisitionRank": 13,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
      "resolvedUrl": null,
      "title": "zabalist.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "protected-opportunity",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "protected-opportunity",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-35",
      "candidateIndex": 35,
      "discoveryRank": 35,
      "acquisitionRank": 14,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
      "resolvedUrl": null,
      "title": "r-o.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "protected-opportunity",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "protected-opportunity",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-39",
      "candidateIndex": 39,
      "discoveryRank": 39,
      "acquisitionRank": 15,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "resolvedUrl": null,
      "title": "databank.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "operator-match",
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "protected-opportunity",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "protected-opportunity",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-44",
      "candidateIndex": 44,
      "discoveryRank": 44,
      "acquisitionRank": 16,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
      "resolvedUrl": null,
      "title": "theaiconsultingnetwork.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": true,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "awaiting-physical-open-admission",
      "physicalOpenAdmission": "protected-opportunity",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "protected-opportunity",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-45",
      "candidateIndex": 45,
      "discoveryRank": 45,
      "acquisitionRank": 17,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
      "resolvedUrl": null,
      "title": "dallasinnovates.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": false,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "candidate-limit",
      "physicalOpenAdmission": "candidate-limit",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "candidate-limit",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-46",
      "candidateIndex": 46,
      "discoveryRank": 46,
      "acquisitionRank": 18,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
      "resolvedUrl": null,
      "title": "facebook.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 100,
      "acquisitionPriorityReasons": [
        "text-source",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": false,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "candidate-limit",
      "physicalOpenAdmission": "candidate-limit",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "candidate-limit",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-8",
      "candidateIndex": 8,
      "discoveryRank": 8,
      "acquisitionRank": 19,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "resolvedUrl": null,
      "title": "youtube.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 20,
      "acquisitionPriorityReasons": [
        "video-source-deprioritized",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": false,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "candidate-limit",
      "physicalOpenAdmission": "candidate-limit",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "candidate-limit",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    },
    {
      "candidateId": "discovery-50",
      "candidateIndex": 50,
      "discoveryRank": 50,
      "acquisitionRank": 20,
      "categoryId": null,
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615",
      "originalUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615",
      "resolvedUrl": null,
      "title": "youtube.com",
      "sourceChannel": "google-grounded-search",
      "searchDomain": null,
      "sourceType": null,
      "categoryIds": [],
      "sourceState": null,
      "exactProject": false,
      "identitySignals": [],
      "acquisitionPriority": 20,
      "acquisitionPriorityReasons": [
        "video-source-deprioritized",
        "no-exact-project-identity-signal"
      ],
      "candidateLimitSelected": false,
      "acquisitionSelected": false,
      "acquisitionSelectionReason": "candidate-limit",
      "physicalOpenAdmission": "candidate-limit",
      "selectedForOpening": false,
      "selectionDecision": {
        "decision": "not-selected",
        "selected": false,
        "reason": "candidate-limit",
        "physicalOpenPosition": null
      },
      "physicalOpenPosition": null
    }
  ],
  "physicalOpenAuthorizationCount": 7,
  "physicalOpenAuthorizations": [
    {
      "physicalOpenIndex": 1,
      "categoryId": "project-identity",
      "source": {
        "candidateId": "discovery-1",
        "candidateIndex": 1,
        "discoveryRank": 1,
        "acquisitionRank": 1,
        "categoryId": "project-identity",
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
        "originalUrl": null,
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
        "resolvedUrl": null,
        "title": "datacentermap.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      }
    },
    {
      "physicalOpenIndex": 2,
      "categoryId": "project-identity",
      "source": {
        "candidateId": "discovery-2",
        "candidateIndex": 2,
        "discoveryRank": 2,
        "acquisitionRank": 2,
        "categoryId": "project-identity",
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
        "originalUrl": null,
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
        "resolvedUrl": null,
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      }
    },
    {
      "physicalOpenIndex": 3,
      "categoryId": "project-identity",
      "source": {
        "candidateId": "discovery-3",
        "candidateIndex": 3,
        "discoveryRank": 3,
        "acquisitionRank": 3,
        "categoryId": "project-identity",
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
        "originalUrl": null,
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
        "resolvedUrl": null,
        "title": "texas.gov",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      }
    },
    {
      "physicalOpenIndex": 4,
      "categoryId": "project-identity",
      "source": {
        "candidateId": "discovery-4",
        "candidateIndex": 4,
        "discoveryRank": 4,
        "acquisitionRank": 4,
        "categoryId": "project-identity",
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
        "originalUrl": null,
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
        "resolvedUrl": null,
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      }
    },
    {
      "physicalOpenIndex": 5,
      "categoryId": "project-identity",
      "source": {
        "candidateId": "discovery-5",
        "candidateIndex": 5,
        "discoveryRank": 5,
        "acquisitionRank": 5,
        "categoryId": "project-identity",
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
        "originalUrl": null,
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
        "resolvedUrl": null,
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      }
    },
    {
      "physicalOpenIndex": 6,
      "categoryId": "project-identity",
      "source": {
        "candidateId": "discovery-7",
        "candidateIndex": 7,
        "discoveryRank": 7,
        "acquisitionRank": 6,
        "categoryId": "project-identity",
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
        "originalUrl": null,
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
        "resolvedUrl": null,
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      }
    },
    {
      "physicalOpenIndex": 7,
      "categoryId": "project-identity",
      "source": {
        "candidateId": "discovery-9",
        "candidateIndex": 9,
        "discoveryRank": 9,
        "acquisitionRank": 7,
        "categoryId": "project-identity",
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
        "originalUrl": null,
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
        "resolvedUrl": null,
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      }
    }
  ],
  "physicalReceiptObservedCount": 21,
  "physicalReceiptCount": 21,
  "physicalReceiptsTruncated": false,
  "physicalReceipts": [
    {
      "receiptId": "receipt-1",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-10",
        "candidateIndex": 10,
        "discoveryRank": 10,
        "acquisitionRank": 8,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
        "resolvedUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
        "title": "bisnow.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "protected-opportunity",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3f9b91f9eb204866"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-2",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-12",
        "candidateIndex": 12,
        "discoveryRank": 12,
        "acquisitionRank": 9,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
        "resolvedUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "protected-opportunity",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-c71bd15521f3e126"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-3",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-13",
        "candidateIndex": 13,
        "discoveryRank": 13,
        "acquisitionRank": 10,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
        "resolvedUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "protected-opportunity",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-4d682f4737765dab"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-4",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-25",
        "candidateIndex": 25,
        "discoveryRank": 25,
        "acquisitionRank": 11,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
        "resolvedUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
        "title": "jrh-construction.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "protected-opportunity",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3dad6434d97e9b22"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-5",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-31",
        "candidateIndex": 31,
        "discoveryRank": 31,
        "acquisitionRank": 12,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
        "resolvedUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
        "title": "texas.gov",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "protected-opportunity",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-3317b62d39db6c59"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-6",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-33",
        "candidateIndex": 33,
        "discoveryRank": 33,
        "acquisitionRank": 13,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
        "resolvedUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
        "title": "zabalist.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "protected-opportunity",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-fd25f4ac6b970b3c"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-7",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-35",
        "candidateIndex": 35,
        "discoveryRank": 35,
        "acquisitionRank": 14,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
        "resolvedUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
        "title": "r-o.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "protected-opportunity",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-a092f27850af4e16"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-8",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-39",
        "candidateIndex": 39,
        "discoveryRank": 39,
        "acquisitionRank": 15,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
        "resolvedUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "protected-opportunity",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f223ccfd5b728fe2"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-9",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-44",
        "candidateIndex": 44,
        "discoveryRank": 44,
        "acquisitionRank": 16,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
        "resolvedUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
        "title": "theaiconsultingnetwork.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "protected-opportunity",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-31247436594269b8"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-10",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-45",
        "candidateIndex": 45,
        "discoveryRank": 45,
        "acquisitionRank": 17,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
        "resolvedUrl": null,
        "title": "dallasinnovates.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "candidate-limit",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9f5b2b216da5d226"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-11",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-46",
        "candidateIndex": 46,
        "discoveryRank": 46,
        "acquisitionRank": 18,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
        "resolvedUrl": null,
        "title": "facebook.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "candidate-limit",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-1f3837516b4be882"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-12",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-8",
        "candidateIndex": 8,
        "discoveryRank": 8,
        "acquisitionRank": 19,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
        "resolvedUrl": null,
        "title": "youtube.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "candidate-limit",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-60e33269ff82e8e0"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-13",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-50",
        "candidateIndex": 50,
        "discoveryRank": 50,
        "acquisitionRank": 20,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615",
        "resolvedUrl": null,
        "title": "youtube.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": false,
      "state": "not-attempted",
      "reason": "candidate-limit",
      "physicalOpenIndexes": [],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615",
      "resolvedUrl": null,
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-495e5577e192d615"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": null
    },
    {
      "receiptId": "receipt-14",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-2",
        "candidateIndex": 2,
        "discoveryRank": 2,
        "acquisitionRank": 2,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
        "resolvedUrl": "https://www.databank.com/data-centers/dallas/red-oak-campus/",
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": true,
      "reused": false,
      "state": "blocked",
      "reason": "private-destination",
      "physicalOpenIndexes": [
        2
      ],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "resolvedUrl": "https://www.databank.com/data-centers/dallas/red-oak-campus/",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-75af82d5f5ffa6f0"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": {
        "stage": "dns-validation",
        "responseReceived": false,
        "httpStatus": null,
        "contentType": null,
        "redirectChain": [
          "https://www.databank.com/data-centers/dallas/red-oak-campus/"
        ],
        "addressValidationReason": "prohibited-address-class",
        "addressValidationCategory": "dns-answer-policy",
        "addressValidationRule": "ipv4-special-purpose",
        "addressValidationTelemetry": {
          "answerCount": 2,
          "addressFamilies": [
            4,
            6
          ],
          "addressFamilyCounts": {
            "ipv4": 1,
            "ipv6": 1,
            "other": 0
          },
          "publicAnswerCount": 1,
          "prohibitedAnswerCount": 1,
          "rejectingRules": [
            "ipv4-special-purpose"
          ]
        },
        "elapsedMs": 29
      }
    },
    {
      "receiptId": "receipt-15",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-4",
        "candidateIndex": 4,
        "discoveryRank": 4,
        "acquisitionRank": 4,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
        "resolvedUrl": "https://www.databank.com/resources/press-releases/databank-secures-2-0b-of-construction-financing-for-first-three-data-centers-on-new-south-dallas-campus/",
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": true,
      "reused": false,
      "state": "blocked",
      "reason": "private-destination",
      "physicalOpenIndexes": [
        4
      ],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "resolvedUrl": "https://www.databank.com/resources/press-releases/databank-secures-2-0b-of-construction-financing-for-first-three-data-centers-on-new-south-dallas-campus/",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-f6404d741d7f2f6f"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": {
        "stage": "dns-validation",
        "responseReceived": false,
        "httpStatus": null,
        "contentType": null,
        "redirectChain": [
          "https://www.databank.com/resources/press-releases/databank-secures-2-0b-of-construction-financing-for-first-three-data-centers-on-new-south-dallas-campus/"
        ],
        "addressValidationReason": "prohibited-address-class",
        "addressValidationCategory": "dns-answer-policy",
        "addressValidationRule": "ipv4-special-purpose",
        "addressValidationTelemetry": {
          "answerCount": 2,
          "addressFamilies": [
            4,
            6
          ],
          "addressFamilyCounts": {
            "ipv4": 1,
            "ipv6": 1,
            "other": 0
          },
          "publicAnswerCount": 1,
          "prohibitedAnswerCount": 1,
          "rejectingRules": [
            "ipv4-special-purpose"
          ]
        },
        "elapsedMs": 26
      }
    },
    {
      "receiptId": "receipt-16",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-5",
        "candidateIndex": 5,
        "discoveryRank": 5,
        "acquisitionRank": 5,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
        "resolvedUrl": "https://www.databank.com/resources/news/inside-databanks-multibillion-dollar-red-oak-data-center-campus/",
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": true,
      "reused": false,
      "state": "blocked",
      "reason": "private-destination",
      "physicalOpenIndexes": [
        5
      ],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "resolvedUrl": "https://www.databank.com/resources/news/inside-databanks-multibillion-dollar-red-oak-data-center-campus/",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-8269ff8d9ad4df4f"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": {
        "stage": "dns-validation",
        "responseReceived": false,
        "httpStatus": null,
        "contentType": null,
        "redirectChain": [
          "https://www.databank.com/resources/news/inside-databanks-multibillion-dollar-red-oak-data-center-campus/"
        ],
        "addressValidationReason": "prohibited-address-class",
        "addressValidationCategory": "dns-answer-policy",
        "addressValidationRule": "ipv4-special-purpose",
        "addressValidationTelemetry": {
          "answerCount": 2,
          "addressFamilies": [
            4,
            6
          ],
          "addressFamilyCounts": {
            "ipv4": 1,
            "ipv6": 1,
            "other": 0
          },
          "publicAnswerCount": 1,
          "prohibitedAnswerCount": 1,
          "rejectingRules": [
            "ipv4-special-purpose"
          ]
        },
        "elapsedMs": 1
      }
    },
    {
      "receiptId": "receipt-17",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-7",
        "candidateIndex": 7,
        "discoveryRank": 7,
        "acquisitionRank": 6,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
        "resolvedUrl": "https://www.databank.com/resources/news/dallas-based-firm-lands-2-billion-construction-loan-for-data-center-campus/",
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": true,
      "reused": false,
      "state": "blocked",
      "reason": "private-destination",
      "physicalOpenIndexes": [
        6
      ],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
      "resolvedUrl": "https://www.databank.com/resources/news/dallas-based-firm-lands-2-billion-construction-loan-for-data-center-campus/",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-ef603ecfbd8f662c"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": {
        "stage": "dns-validation",
        "responseReceived": false,
        "httpStatus": null,
        "contentType": null,
        "redirectChain": [
          "https://www.databank.com/resources/news/dallas-based-firm-lands-2-billion-construction-loan-for-data-center-campus/"
        ],
        "addressValidationReason": "prohibited-address-class",
        "addressValidationCategory": "dns-answer-policy",
        "addressValidationRule": "ipv4-special-purpose",
        "addressValidationTelemetry": {
          "answerCount": 2,
          "addressFamilies": [
            4,
            6
          ],
          "addressFamilyCounts": {
            "ipv4": 1,
            "ipv6": 1,
            "other": 0
          },
          "publicAnswerCount": 1,
          "prohibitedAnswerCount": 1,
          "rejectingRules": [
            "ipv4-special-purpose"
          ]
        },
        "elapsedMs": 1
      }
    },
    {
      "receiptId": "receipt-18",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-9",
        "candidateIndex": 9,
        "discoveryRank": 9,
        "acquisitionRank": 7,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
        "resolvedUrl": "https://www.databank.com/resources/blogs/building-the-future-inside-databanks-red-oak-campus-construction/",
        "title": "databank.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": true,
      "reused": false,
      "state": "blocked",
      "reason": "private-destination",
      "physicalOpenIndexes": [
        7
      ],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "resolvedUrl": "https://www.databank.com/resources/blogs/building-the-future-inside-databanks-red-oak-campus-construction/",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-9cc743588d9a6f45"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": {
        "stage": "dns-validation",
        "responseReceived": false,
        "httpStatus": null,
        "contentType": null,
        "redirectChain": [
          "https://www.databank.com/resources/blogs/building-the-future-inside-databanks-red-oak-campus-construction/"
        ],
        "addressValidationReason": "prohibited-address-class",
        "addressValidationCategory": "dns-answer-policy",
        "addressValidationRule": "ipv4-special-purpose",
        "addressValidationTelemetry": {
          "answerCount": 2,
          "addressFamilies": [
            4,
            6
          ],
          "addressFamilyCounts": {
            "ipv4": 1,
            "ipv6": 1,
            "other": 0
          },
          "publicAnswerCount": 1,
          "prohibitedAnswerCount": 1,
          "rejectingRules": [
            "ipv4-special-purpose"
          ]
        },
        "elapsedMs": 0
      }
    },
    {
      "receiptId": "receipt-19",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-1",
        "candidateIndex": 1,
        "discoveryRank": 1,
        "acquisitionRank": 1,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
        "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
        "resolvedUrl": "https://www.datacentermap.com/usa/texas/dallas/databank-dfw15-red-oak/",
        "title": "datacentermap.com",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": true,
      "reused": false,
      "state": "blocked",
      "reason": "http-429",
      "physicalOpenIndexes": [
        1
      ],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
      "resolvedUrl": "https://www.datacentermap.com/usa/texas/dallas/databank-dfw15-red-oak/",
      "canonicalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-7381d6e1678dd5dc"
      ],
      "contentHash": null,
      "passageSha256": null,
      "passageLength": 0,
      "passageExcerpt": null,
      "extractionMethod": null,
      "extractionOutcome": null,
      "transportDiagnostic": {
        "stage": "response",
        "responseReceived": true,
        "httpStatus": 429,
        "contentType": "text/html",
        "redirectChain": [
          "https://www.datacentermap.com/usa/texas/dallas/databank-dfw15-red-oak/"
        ],
        "addressValidationReason": null,
        "addressValidationCategory": null,
        "addressValidationRule": null,
        "addressValidationTelemetry": null,
        "elapsedMs": 74
      }
    },
    {
      "receiptId": "receipt-20",
      "phase": "grounded-discovery-prefetch",
      "candidate": {
        "candidateId": "discovery-3",
        "candidateIndex": 3,
        "discoveryRank": 3,
        "acquisitionRank": 3,
        "categoryId": null,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
        "canonicalUrl": "https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681",
        "resolvedUrl": "https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681",
        "title": "texas.gov",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": true,
      "reused": false,
      "state": "accessible",
      "reason": "retrieved",
      "physicalOpenIndexes": [
        3
      ],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
      "resolvedUrl": "https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681",
      "canonicalUrl": "https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51"
      ],
      "contentHash": "969c09778718dc0d8a53c6e936b85355315815c408bfdb9bb5bfe5f29bff70ae",
      "passageSha256": "9d720972c6da03da2f0387acf25f231a2877696248a6e5cd06b31e64cea87f5c",
      "passageLength": 2440,
      "passageExcerpt": "TDLR TABS - Project Details <iframe src=\"[redacted-url] height=\"0\" width=\"0\" style=\"display:none;visibility:hidden\"> Project Details <div id=\"divMsg\" class=\"mainmsgbox alert alert-danger text-center collapse\" role=\"alert\" aria-hidden=\"true\"> Print View Texas Department of Licensing and Regulation Architectural Barriers Project Details Page Project #: TABS2026027681 Registration Date: 8/12/2026 [redacted-url] PROJECT Project Name: DataBank Red Oak - DFW14 Base Building Project Number: TABS2026027681 Facility Name: DB DFW14 Location Address: 3600 Batchler Rd Red Oak, TX 75154 Location County: Ellis Start Date: 12/1/2026 Completion Date: 12/31/2026 Estimated Cost: $325,000,000 Type of Work: New Construction Type of Funds: This project is privately funded, on private land for private use. Scope of Work: New Construction, two story data center with office component. 443,679 SF Square Footage: 443,679 ft 2 Are the private funds provided by the tenant? No Current Status: Project Registered PERSON FILING FORM Contact Name: Ron Davis RAS RAS Name: RONALD L,DAVIS 83 RAS Address: 3001 MOTLEY DR STE J MESQUITE, TX 75150 RAS Phone: (972) 270-3100 OWNER Owner Name: DB Data Center Red Oak, LLC Owner Address: 400 South Akard Street, Suite 100 Dllas, Texas 75202 Owner Phone: 855-328-2247 Dan Yamagishi TENANT Not Assigned DESIGN FIRM Design Firm Name: JHET Architects, PLLC Design Firm Address: 2554 Elm Street, Suite 230 Dallas, Texas 75226 Design Firm Phone: (214) 628-1062 Registered accessibi",
      "extractionMethod": "html",
      "extractionOutcome": "extracted",
      "transportDiagnostic": {
        "stage": "complete",
        "responseReceived": true,
        "httpStatus": 200,
        "contentType": "text/html",
        "redirectChain": [
          "https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681"
        ],
        "addressValidationReason": null,
        "addressValidationCategory": null,
        "addressValidationRule": null,
        "addressValidationTelemetry": null,
        "elapsedMs": 510
      }
    },
    {
      "receiptId": "receipt-21",
      "phase": "category-source-access",
      "candidate": {
        "candidateId": "discovery-3",
        "candidateIndex": 3,
        "discoveryRank": 3,
        "acquisitionRank": 3,
        "categoryId": "grid",
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
        "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
        "canonicalUrl": "https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681",
        "resolvedUrl": "https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681",
        "title": "texas.gov",
        "sourceChannel": "google-grounded-search",
        "searchDomain": null,
        "sourceType": null,
        "categoryIds": [],
        "sourceState": null,
        "exactProject": false,
        "identitySignals": []
      },
      "attempted": false,
      "reused": true,
      "state": "accessible",
      "reason": "retrieved",
      "physicalOpenIndexes": [
        3
      ],
      "originalUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51",
      "resolvedUrl": "https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681",
      "canonicalUrl": "https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681",
      "underlyingDocumentUrl": null,
      "referringUrls": [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-894383eebe598c51"
      ],
      "contentHash": "969c09778718dc0d8a53c6e936b85355315815c408bfdb9bb5bfe5f29bff70ae",
      "passageSha256": "9d720972c6da03da2f0387acf25f231a2877696248a6e5cd06b31e64cea87f5c",
      "passageLength": 2440,
      "passageExcerpt": "TDLR TABS - Project Details <iframe src=\"[redacted-url] height=\"0\" width=\"0\" style=\"display:none;visibility:hidden\"> Project Details <div id=\"divMsg\" class=\"mainmsgbox alert alert-danger text-center collapse\" role=\"alert\" aria-hidden=\"true\"> Print View Texas Department of Licensing and Regulation Architectural Barriers Project Details Page Project #: TABS2026027681 Registration Date: 8/12/2026 [redacted-url] PROJECT Project Name: DataBank Red Oak - DFW14 Base Building Project Number: TABS2026027681 Facility Name: DB DFW14 Location Address: 3600 Batchler Rd Red Oak, TX 75154 Location County: Ellis Start Date: 12/1/2026 Completion Date: 12/31/2026 Estimated Cost: $325,000,000 Type of Work: New Construction Type of Funds: This project is privately funded, on private land for private use. Scope of Work: New Construction, two story data center with office component. 443,679 SF Square Footage: 443,679 ft 2 Are the private funds provided by the tenant? No Current Status: Project Registered PERSON FILING FORM Contact Name: Ron Davis RAS RAS Name: RONALD L,DAVIS 83 RAS Address: 3001 MOTLEY DR STE J MESQUITE, TX 75150 RAS Phone: (972) 270-3100 OWNER Owner Name: DB Data Center Red Oak, LLC Owner Address: 400 South Akard Street, Suite 100 Dllas, Texas 75202 Owner Phone: 855-328-2247 Dan Yamagishi TENANT Not Assigned DESIGN FIRM Design Firm Name: JHET Architects, PLLC Design Firm Address: 2554 Elm Street, Suite 230 Dallas, Texas 75226 Design Firm Phone: (214) 628-1062 Registered accessibi",
      "extractionMethod": "html",
      "extractionOutcome": "extracted",
      "transportDiagnostic": {
        "stage": "complete",
        "responseReceived": true,
        "httpStatus": 200,
        "contentType": "text/html",
        "redirectChain": [
          "https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681"
        ],
        "addressValidationReason": null,
        "addressValidationCategory": null,
        "addressValidationRule": null,
        "addressValidationTelemetry": null,
        "elapsedMs": 510
      }
    }
  ]
}
```

## Identity and single Grid result
```json
{
  "identity": {
    "required": true,
    "state": "unresolved",
    "usableRetainedPassageCount": 1,
    "exactProjectPassageCount": 0,
    "reason": "No successfully retrieved retained passage establishes the exact requested project identity."
  },
  "gridAnalysisPackets": [],
  "claimTrace": {
    "version": 1,
    "sanitized": true,
    "responses": [
      {
        "categoryId": "grid",
        "providerResponseId": null,
        "state": "not-issued",
        "reasonCode": "structured-analysis-not-issued",
        "claimCount": 0,
        "expectedEvidenceIds": [
          "grid_interconnection",
          "electricity_cost",
          "electricity_escalation",
          "renewable_percentage"
        ],
        "omittedClaimIds": [],
        "parseState": "not-evaluated",
        "parseErrorCode": null
      }
    ],
    "claims": [],
    "analysisPassages": []
  }
}
```

## Validation and source provenance
```json
{
  "sourceRevision": "ccc1ab7c2e936e809ea3eb1d8a7bc34b8b737d35",
  "sourceHash": "23cc14eff617acea6842f6e3670d55f5bf376ff510ccc6c3cdfcb17074ef9a74",
  "preconditions": {
    "gateFilePath": "/tmp/red-oak-identity-validation/gates.json",
    "gates": {
      "offlineSuite": {
        "status": "passed",
        "logPath": "/tmp/red-oak-identity-validation/final-package.log"
      },
      "standaloneDataMjs": {
        "status": "passed",
        "logPath": "/tmp/red-oak-identity-validation/final-data.log"
      },
      "typecheck": {
        "status": "passed",
        "logPath": "/tmp/red-oak-identity-validation/final-typecheck.log"
      },
      "productionBuild": {
        "status": "passed",
        "logPath": "/tmp/red-oak-identity-validation/final-build.log"
      }
    },
    "redOakContentQualityFixesIncluded": true,
    "googleGroundingFixtureSynchronized": true,
    "sourceRevision": "ccc1ab7c2e936e809ea3eb1d8a7bc34b8b737d35",
    "sourceHash": "23cc14eff617acea6842f6e3670d55f5bf376ff510ccc6c3cdfcb17074ef9a74"
  }
}
```

## Evidence boundaries

Syndicated company statements are not independently verified grid approval. Campus IT capacity, phase IT capacity, proposed substation capacity, and confirmed interconnection are different measures. Discovery context DFW9/DFW10/DFW11 helps search/admission only; it does not establish campus/building relationships, authority, passage validity, eligibility, or model evidence.
No DNS/SSRF/address/redirect restrictions, authority rules, financial rules, governed IDs, or reviewer acceptance changed. Blocked operator pages remain blocked. Historical reports remain unchanged. No production data or dossiers were written and nothing was deployed.
