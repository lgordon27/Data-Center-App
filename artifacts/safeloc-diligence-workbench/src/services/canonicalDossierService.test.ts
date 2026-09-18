import assert from "node:assert/strict";
import test from "node:test";

import {
  dossierToResearchResponse,
  type CanonicalDossierSummary,
} from "./canonicalDossierService";

test("canonical projection preserves reviewed passages, dates, conflicts, and model separation", () => {
  const dossier = {
    slug: "reviewed-project",
    name: "Reviewed Project",
    version: "1",
    coverageState: "material-gaps",
    asOfDate: "2026-06-22",
    canonicalData: {
      identity: {
        location: "Reviewed County, Texas",
        operator: "Reviewed Operator",
        scope: "Reviewed phase only.",
        capacityMW: 250,
      },
      originatingCompany: "Microsoft",
      relationshipType: "Developer/Operator",
      relationships: [],
      evidence: [{
        variableId: "grid_interconnection",
        label: "Grid timeline",
        value: "Reviewed statement",
        unit: "Status",
        classification: "Management Assertion",
        claim: "Reviewed claim",
        description: "Reviewed description",
        coverageStatus: "conflicting",
        conflictSummary: "Ownership descriptions conflict.",
        scope: "Phase one only.",
        source: {
          title: "Reviewed source",
          url: "https://example.com/reviewed",
          publisher: "Example",
          publishedAt: "2026-06-22",
          accessedAt: "2026-09-17",
          exactPassage: "This exact reviewed passage must remain unchanged.",
        },
      }],
      materiality: {
        project: "Directional",
        issuer: "Unquantified",
        portfolio: "Not assessed",
      },
      questions: ["What remains unresolved?"],
      triggers: ["New filing"],
    },
  } satisfies CanonicalDossierSummary;

  const response = dossierToResearchResponse(dossier);
  const item = response.evidence[0];
  assert.equal(item.sources?.[0]?.claimPassage, dossier.canonicalData.evidence[0].source.exactPassage);
  assert.equal(item.sources?.[0]?.accessOutcome?.passage, dossier.canonicalData.evidence[0].source.exactPassage);
  assert.equal(item.sourcePublishedAt, "2026-06-22");
  assert.equal(item.sourceAccessedAt, "2026-09-17");
  assert.equal(item.conflictSummary, "Ownership descriptions conflict.");
  assert.equal(item.researchState, "accepted");
  assert.equal(item.eligibleForModel, false);
  assert.equal(item.acceptedForModel, false);
});