import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CUSTOM_EVIDENCE_IDS } from "./researchProjectService";
import { CURRENT_SESSION_STORAGE_KEY, loadCurrentSession } from "../context/DiligenceContext";

const redOakQualityFixtures = JSON.parse(readFileSync(
  new URL("../../server/fixtures/red-oak-quality.json", import.meta.url),
  "utf8",
)) as { civicEngagePassage: string; corruptedPdfPassage: string };

test("saved session reload excludes exact legacy application-error and corrupted PDF findings without rewriting history", () => {
  const goodFinding = {
    id: "red-oak-good",
    topic: "project-identity",
    assessment: "source-supported",
    applicability: "exact-project",
    financialProposalEligibility: "unresolved",
    statement: "The filing describes the Red Oak project.",
    attribution: "Source-supported passage from the county filing.",
    projectScope: "Exact project.",
    phaseScope: "Phase scope is not established.",
    timePeriod: null,
    powerMeasure: null,
    powerClaimState: "not-present",
    powerClaim: null,
    reportingDate: null,
    reportingDateBasis: "not-reported",
    accessedAt: null,
    accessedAtBasis: "not-recorded",
    sourceTitle: "County filing",
    sourceUrl: "https://records.example.gov/red-oak",
    passage: "The filing describes the Red Oak project and its public review process.",
    evidenceEligibility: "research-only",
    demonstratedFinancialEffect: false,
  };
  const unusableFinding = {
    ...goodFinding,
    id: "red-oak-civicengage-error",
    sourceTitle: "Ellis County Archive",
    sourceUrl: "https://www.elliscountytx.gov/ArchiveCenter/ViewFile/Item/4224",
    passage: redOakQualityFixtures.civicEngagePassage,
  };
  const corruptedFinding = {
    ...goodFinding,
    id: "red-oak-corrupted-pdf",
    sourceTitle: "DFW11 case study",
    sourceUrl: "https://checkmarkpro.com/assets/Case-Study-DataBank-DFW-11.pdf",
    passage: redOakQualityFixtures.corruptedPdfPassage,
  };
  const session = {
    version: 2,
    canonicalProvenanceVersion: 2,
    hasChangedClassification: true,
    classifications: {},
    overrides: {},
    reviewMetadata: {},
    customResearch: {
      project: {
        kind: "custom",
        name: "Red Oak Campus",
        location: "Red Oak, Ellis County, Texas",
        description: "Persisted summary.",
        capacityMW: null,
        retainedFindings: [unusableFinding, corruptedFinding, goodFinding],
        retainedFindingAudit: {
          accessiblePassagesReviewed: 3,
          qualityExcludedCount: 0,
          qualityExclusionReasons: [],
          sourceSupportedCount: 3,
          attributedReportCount: 0,
          ambiguousUnresolvedCount: 0,
          unrelatedExcludedCount: 0,
          duplicateExcludedCount: 0,
          inaccessibleExcludedCount: 0,
          financiallyEligibleCount: 0,
          totalFindingCount: 3,
          shownFindingCount: 3,
          capDiscardCount: 0,
        },
      },
      evidence: Object.fromEntries(CUSTOM_EVIDENCE_IDS.map((id) => [id, {}])),
      modelEvidence: Object.fromEntries(CUSTOM_EVIDENCE_IDS.map((id) => [id, {}])),
      researchProposals: {},
      researchProposalDispositions: {},
      researchProposalOverrides: {},
    },
  };
  const originalSession = JSON.stringify(session);
  const values = new Map([[CURRENT_SESSION_STORAGE_KEY, originalSession]]);
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });

  try {
    const loaded = loadCurrentSession();

    assert.equal(loaded.restored, true);
    assert.equal(loaded.project?.retainedFindings?.length, 1);
    assert.equal(loaded.project?.retainedFindings?.[0].id, goodFinding.id);
    assert.equal(loaded.project?.retainedFindingAudit?.qualityExcludedCount, 2);
    assert.deepEqual(loaded.project?.retainedFindingAudit?.qualityExclusionReasons, [
      { reason: "application-error-page", count: 1 },
      { reason: "control-heavy-content", count: 1 },
    ]);
    assert.deepEqual(JSON.parse(values.get(CURRENT_SESSION_STORAGE_KEY) ?? "null"), session);
    assert.equal(values.get(CURRENT_SESSION_STORAGE_KEY), originalSession);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});