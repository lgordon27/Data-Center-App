import assert from "node:assert/strict";
import test from "node:test";
import type { EvidenceItem, FinancialModelingState, ProjectContext } from "../context/DiligenceContext";
import type { RetainedResearchFinding, ResearchCategoryAudit } from "../services/researchProjectService";
import { generateAdvisorBrief } from "./conferencePresentation";
import { getCommunityResultPresentation, getResearchResultPresentation, getSessionReviewAvailability, retainedFindingReason, shortSourceText, unresolvedEvidenceReason } from "./researchResultPresentation";

const finding: RetainedResearchFinding = {
  id: "retained-report", topic: "capacity", assessment: "attributed-report", applicability: "exact-project",
  financialProposalEligibility: "unresolved", statement: "Unsupported synthetic summary must not be displayed as fact.",
  attribution: "Attributed to County reporting", projectScope: "Campus reporting; operational status unresolved",
  phaseScope: "Phase not established", timePeriod: null, powerMeasure: null, powerClaimState: "not-present", powerClaim: null,
  reportingDate: "2026-06-12", reportingDateBasis: "visible-publication-line", accessedAt: null, accessedAtBasis: "not-recorded",
  sourceTitle: "County reporting", sourceUrl: "https://county.example.test/report",
  passage: "The developer reported plans for a 600 MW campus. The utility did not confirm its operating timetable.",
  evidenceEligibility: "research-only", demonstratedFinancialEffect: false,
};
const project: ProjectContext = {
  kind: "custom", name: "Partial Campus", location: "Texas", description: "", capacityMW: null,
  researchMode: "research-incomplete", researchStatus: "partial", retainedFindings: [finding],
};
const record = (overrides: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id: "grid_interconnection", label: "Interconnection duration", value: "Not disclosed", unit: "months",
  classification: "Missing Evidence", impactRole: "Financial Driver", citation: "", description: "",
  sourceId: null, providerSourceId: null, sourceRole: "Project research", ...overrides,
});
const model: FinancialModelingState = { status: "modeled", label: "Capacity-based synthetic project model", reason: "Illustrative capacity set", requiredInputs: [] };
const unavailable: FinancialModelingState = { status: "not-modeled", label: "Not modeled", reason: "No model capacity", requiredInputs: ["Capacity"] };

test("retained attribution without structured facts agrees across result and advisor; raw text is not promoted", () => {
  const before = JSON.stringify(project);
  const summary = getResearchResultPresentation(project, {});
  const brief = generateAdvisorBrief({
    project, evidence: {}, originatingCompany: null, financialModeling: unavailable,
    metrics: { projectIRR: null, recommendationStatus: "BLOCKED" },
  } as never);
  assert.deepEqual(summary.facts, []);
  assert.deepEqual(brief.whatWeKnow, []);
  assert.equal(summary.reported[0].id, finding.id);
  assert.equal(brief.whatIsReportedNotVerified[0], summary.reported[0].text);
  assert.match(summary.reported[0].text, /developer reported plans/);
  assert.doesNotMatch(summary.reported[0].text, /Unsupported synthetic summary/);
  assert.match(retainedFindingReason(finding, {}), /No matching canonical evidence field.*not missing source text/);
  assert.equal(summary.readiness, "Not assessed");
  assert.equal(JSON.stringify(project), before);
});

test("not-assessed, failed, skipped and missing assessments never imply record absence", () => {
  for (const outcome of ["not-assessed", "failed", "skipped", "not-run", undefined] as const) {
    const category = { categoryId: "power", label: "Power", evidenceIds: ["grid_interconnection"], analysisOutcome: outcome, notRunReason: outcome === "not-assessed" ? "no-admitted-passage-text" : null } as ResearchCategoryAudit;
    const partial = { ...project, researchAudit: { categories: [category] } } as ProjectContext;
    const result = getResearchResultPresentation(partial, { grid_interconnection: record() });
    const reason = unresolvedEvidenceReason(record(), partial);
    assert.match(reason, outcome === "not-assessed" ? /Not assessed: no admitted passage text/ : /Not established in this run/);
    assert.equal(result.categories.length, 1);
    assert.doesNotMatch(reason, /no documentation found|no public/i);
  }
});

test("partial runs with valid candidates remain previewable; missing model blocks without losing candidates", () => {
  const candidate = record({ id: "electricity_cost", value: 78, unit: "USD/MWh", sourceUrl: finding.sourceUrl });
  const partial = { ...project, researchProposals: { electricity_cost: candidate } } as ProjectContext;
  assert.equal(getSessionReviewAvailability(partial, {}, model).canPreview, true);
  const blocked = getSessionReviewAvailability(partial, {}, unavailable);
  assert.equal(blocked.canPreview, false);
  assert.equal(blocked.candidates.length, 1);
  assert.equal(candidate.acceptedForModel, undefined);
});

test("MW/GW in a duration field is flagged, never reclassified or previewed", () => {
  const wrong = record({ value: "600 MW", rawUnit: "MW", unit: "months", classification: "Verified Evidence", sourceUrl: finding.sourceUrl });
  const before = JSON.stringify(wrong);
  assert.match(unresolvedEvidenceReason(wrong, project), /Capacity assertion, not an interconnection duration/);
  const availability = getSessionReviewAvailability(project, { grid_interconnection: wrong }, model);
  assert.equal(availability.canPreview, false);
  assert.equal(availability.candidates[0].mismatch, true);
  assert.deepEqual(getResearchResultPresentation({ ...project, kind: "curated" }, { grid_interconnection: wrong }).facts, []);
  assert.equal(JSON.stringify(wrong), before);
});

test("reviewed snapshot with gaps is distinct from completed live research and financial readiness", () => {
  const snapshot = { ...project, canonicalDossier: { asOfDate: "2026-06-22", coverageState: "material-gaps", canonicalData: { identity: {}, materiality: {}, questions: [] } } } as ProjectContext;
  const result = getResearchResultPresentation(snapshot, { grid_interconnection: record() });
  assert.equal(result.status.label, "Reviewed snapshot");
  assert.match(result.status.description, /not completed live research/);
  assert.equal(result.readiness, "Not assessed");
  assert.equal(result.unresolved.length, 1);
});

test("missing source, unsupported quotation, invalid value and mapping gap are distinct", () => {
  assert.match(retainedFindingReason({ ...finding, passage: "" }, {}), /Missing source text/);
  const mapping = { sourceId: finding.sourceUrl, exactQuotation: "The developer reported plans for a 600 MW campus.", variable: "grid_interconnection", supportStatus: "unsupported", contradictionStatus: "none" };
  const associated = record({ sourceUrl: finding.sourceUrl, claimMappings: [mapping] as EvidenceItem["claimMappings"] });
  assert.match(retainedFindingReason(finding, { grid_interconnection: associated }), /Quotation support not established/);
  assert.match(retainedFindingReason(finding, { grid_interconnection: { ...associated, quarantineReasons: ["invalid-value-unit"] } }), /Invalid value or unit/);
  assert.match(retainedFindingReason(finding, {}), /mapping gap/);
});

test("shortening preserves original text and unresolved ordering is not a materiality score", () => {
  const long = "Exact original source. ".repeat(50);
  assert.equal(shortSourceText(long).length, 241);
  assert.equal(long, "Exact original source. ".repeat(50));
  const evidence = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`item${index}`, record({ id: `item${index}` })]));
  const result = getResearchResultPresentation(project, evidence);
  assert.equal(result.open.length, 5);
  assert.deepEqual(result.unresolved.map((item) => item.id), ["item0", "item1", "item2"]);
});

test("multiline supported quotations use policy comparison semantics without changing source text", () => {
  const multiline = { ...finding, passage: "The Developer\n reported\t plans for a 600 MW campus.\nThe utility did not confirm its operating timetable." };
  const mapping = { sourceId: finding.sourceUrl, exactQuotation: "The developer reported plans for a 600 MW campus.", variable: "grid_interconnection", supportStatus: "supported", contradictionStatus: "none" };
  const evidence = { grid_interconnection: record({ sourceUrl: finding.sourceUrl, claimMappings: [mapping] as EvidenceItem["claimMappings"] }) };
  const before = JSON.stringify({ multiline, evidence });
  assert.match(retainedFindingReason(multiline, evidence), /Passage mapping retained/);
  assert.equal(JSON.stringify({ multiline, evidence }), before);
  assert.equal(getResearchResultPresentation({ ...project, retainedFindings: [multiline] }, evidence).established.length, 0);
});

test("null-quotation rejection receipts are not mislabeled as absent canonical fields", () => {
  const mapping = { sourceId: finding.sourceUrl, exactQuotation: null, variable: "grid_interconnection", supportStatus: "missing-passage", contradictionStatus: "none", rejectionCodes: ["missing-passage"] };
  const evidence = { grid_interconnection: record({ sourceUrl: finding.sourceUrl, claimMappings: [mapping] as EvidenceItem["claimMappings"] }) };
  assert.match(retainedFindingReason(finding, evidence), /Missing admitted source text.*missing-passage/);
  assert.doesNotMatch(retainedFindingReason(finding, evidence), /mapping gap|No matching canonical evidence field/);
  assert.match(retainedFindingReason(finding, { grid_interconnection: record({ sourceUrl: finding.sourceUrl, claimMappings: [{ ...mapping, supportStatus: "blocked", rejectionCodes: [] }] as EvidenceItem["claimMappings"] }) }), /Quotation support not established/);
});

test("expanded Community fallback preserves known non-assessment rather than documentation absence", () => {
  for (const outcome of ["not-assessed", "skipped", "failed", undefined] as const) {
    const category = { categoryId: "community", label: "Community", evidenceIds: ["community_risk"], analysisOutcome: outcome, notRunReason: outcome === "not-assessed" ? "no-admitted-passage-text" : null } as ResearchCategoryAudit;
    const partial = { ...project, researchAudit: { categories: [category] } } as ProjectContext;
    const evidence = { community_risk: record({ id: "community_risk", label: "Community", impactRole: "Context Indicator" }) };
    const status = getCommunityResultPresentation(evidence, partial).statuses[0];
    assert.match(status.label, outcome === "not-assessed" ? /Not assessed: no admitted passage text/ : /Not established in this run/);
    assert.doesNotMatch(status.label, /documentation found/i);
    assert.match(status.detail, /not a finding of public-record absence/);
    assert.equal(getResearchResultPresentation(partial, evidence).established.length, 0);
  }
});