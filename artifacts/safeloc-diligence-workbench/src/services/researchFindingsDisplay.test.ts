import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CURRENT_SESSION_STORAGE_KEY,
  loadCurrentSession,
} from "@/context/DiligenceContext";
import { AdvisorFindingsSummary, ResearchFindingsSection } from "@/components/ResearchFindingsDisplay";
import { groupResearchFindings, rankAdvisorResearchFindings } from "@/model/researchFindingsPresentation";
import { CUSTOM_EVIDENCE_IDS, parseResponse } from "./researchProjectService";
import { ReportedResearchFindings } from "@/components/ReportedResearchFindings";
import type { ResearchFinding } from "@/types/researchFindings";

const responseFixture = JSON.parse(readFileSync(
  new URL("../../tests/fixtures/research-project-synthetic.json", import.meta.url),
  "utf8",
));
const displayFixture = JSON.parse(readFileSync(
  new URL("../../tests/fixtures/research-findings-display.json", import.meta.url),
  "utf8",
)) as { findings: unknown[]; topicCoverage: Record<string, unknown> };

const report = {
  id: "legacy-report",
  status: "reported" as const,
  categoryId: "grid",
  evidenceId: "grid_interconnection",
  label: "Grid update",
  statement: "The local utility described a planning update.",
  exactQuotation: "The utility described a planning update.",
  quotationVerified: true as const,
  sourceUrl: "https://records.example.gov/legacy-grid-report",
  sourceTitle: "Legacy grid report",
  publisher: null,
  publicationDate: null,
  retrievedAt: null,
  facilityScope: null,
  phaseScope: null,
  identityScope: "scope-unconfirmed" as const,
  financialEligibility: "not-established" as const,
};

function render(element: Parameters<typeof renderToStaticMarkup>[0]) {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React");
  Object.defineProperty(globalThis, "React", { configurable: true, value: React });
  try {
    return renderToStaticMarkup(element);
  } finally {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact);
    else Reflect.deleteProperty(globalThis, "React");
  }
}

test("renders finding variants, source fallbacks, scope, proposed-mapping boundary, and coverage states", () => {
  const parsed = parseResponse({ ...responseFixture, ...displayFixture }, {
    name: "Aster Northstar Campus",
    location: "Cedar County, Iowa",
  });
  const findings = parsed.findings ?? [];
  assert.equal(findings.length, 6);
  assert.equal(findings.find((finding) => finding.findingId === "grid-scope-unconfirmed")?.projectMatch, "scope-unconfirmed");
  assert.deepEqual(findings.find((finding) => finding.findingId === "grid-scope-unconfirmed")?.scope.entityRoles, [
    { name: "GridWorks", role: "contractor" },
    { name: "County Utility", role: "utility" },
  ]);
  assert.equal(findings.find((finding) => finding.findingId === "permitting-plan")?.kind, "plan");
  assert.equal(findings.find((finding) => finding.findingId === "capacity-proposed-map")?.proposedModelMapping?.status, "proposed-not-accepted");
  assert.equal(findings.find((finding) => finding.findingId === "tenant-report-no-source-metadata")?.source.publisher, null);
  assert.equal(findings.find((finding) => finding.findingId === "tenant-report-no-source-metadata")?.source.publishedAt, null);

  const markup = render(createElement(ResearchFindingsSection, {
    findings,
    topicCoverage: parsed.topicCoverage,
    evidenceLabels: { electricity_cost: { label: "Facility electricity cost" } },
  }));
  assert.match(markup, /Findings/);
  assert.match(markup, /Matches requested project/);
  assert.match(markup, /Facility scope unconfirmed/);
  assert.match(markup, /GridWorks · contractor/);
  assert.match(markup, /County Utility · utility/);
  assert.match(markup, /Plan/);
  assert.match(markup, /Proposed model input — not accepted · Facility electricity cost/);
  assert.match(markup, /Publisher not recorded · Published date unavailable/);
  assert.match(markup, /Published date unavailable · Retrieved 2026-06-02/);
  assert.match(markup, /Power · Found/);
  assert.match(markup, /Water · Nothing found/);
  assert.match(markup, /Permitting · Not analyzed · incomplete/);
  assert.match(markup, /No admitted source passage was available for this topic/);
  assert.match(markup, /Exact source passage/);
  assert.match(markup, /href="https:\/\/records.example.gov\/project\/service-planning"/);
  assert.doesNotMatch(markup, /<button/);
  assert.doesNotMatch(markup, /<details[^>]* open/);

  const sorted = rankAdvisorResearchFindings(findings);
  assert.equal(sorted[0]?.findingId, "power-reported-match");
  assert.equal(sorted[1]?.findingId, "tenant-report-no-source-metadata");
  assert.ok(sorted.slice(0, 3).every((finding) => finding.projectMatch === "matches-requested-project"));
  assert.equal(sorted[3]?.findingId, "hazard-scope-unconfirmed-report");
  const groups = groupResearchFindings(findings);
  assert.deepEqual(groups.map((group) => group.topic), ["capacity", "power", "grid", "permitting", "tenant", "hazard"]);

  const advisorMarkup = render(createElement(AdvisorFindingsSummary, { findings: sorted, evidenceLabels: { electricity_cost: { label: "Facility electricity cost" } } }));
  assert.match(advisorMarkup, /What public sources say/);
  assert.match(advisorMarkup, /View complete Findings section/);
  assert.match(advisorMarkup, /href="#research-findings"/);
  assert.equal((advisorMarkup.match(/data-testid="advisor-finding-/g) ?? []).length, 5);
  assert.match(advisorMarkup, /data-testid="advisor-finding-hazard-scope-unconfirmed-report"/);
  assert.doesNotMatch(advisorMarkup, /data-testid="advisor-finding-capacity-proposed-map"/);
});

test("empty findings show the empty state and coverage, while absent findings retain the legacy reported section", () => {
  const explicitEmpty = parseResponse({
    ...responseFixture,
    findings: [],
    topicCoverage: displayFixture.topicCoverage,
    reportedFindings: [report],
  });
  assert.deepEqual(explicitEmpty.findings, []);
  const emptyMarkup = render(createElement(ResearchFindingsSection, {
    findings: explicitEmpty.findings,
    topicCoverage: explicitEmpty.topicCoverage,
  }));
  assert.match(emptyMarkup, /No verified findings in this run/);
  assert.match(emptyMarkup, /Power · Found/);

  const legacy = parseResponse({ ...responseFixture, reportedFindings: [report] });
  assert.equal(legacy.findings, undefined);
  assert.equal(legacy.reportedFindings?.length, 1);
  assert.equal(render(createElement(ResearchFindingsSection, { findings: legacy.findings })), "");
  const legacyMarkup = render(createElement(ReportedResearchFindings, { findings: legacy.reportedFindings }));
  assert.match(legacyMarkup, /Reported findings/);
  assert.match(legacyMarkup, /Legacy grid report/);
  assert.deepEqual(legacy.acceptedModelInputs, parseResponse(responseFixture).acceptedModelInputs);
  assert.deepEqual(legacy.retainedFindings, parseResponse(responseFixture).retainedFindings);
});

test("finding fields and the absent-versus-empty distinction survive saved-session restoration", () => {
  const parsed = parseResponse({ ...responseFixture, ...displayFixture });
  const empty = parseResponse({ ...responseFixture, findings: [], topicCoverage: displayFixture.topicCoverage });
  const sessionFor = (findings: ResearchFinding[] | undefined, topicCoverage: typeof parsed.topicCoverage) => ({
    version: 2,
    canonicalProvenanceVersion: 2,
    hasChangedClassification: true,
    classifications: {},
    overrides: {},
    reviewMetadata: {},
    customResearch: {
      project: {
        kind: "custom",
        name: "Aster Northstar Campus",
        location: "Cedar County, Iowa",
        description: "Saved project",
        capacityMW: null,
        ...(findings !== undefined ? { findings } : {}),
        ...(topicCoverage !== undefined ? { topicCoverage } : {}),
      },
      evidence: Object.fromEntries(CUSTOM_EVIDENCE_IDS.map((id) => [id, {}])),
      modelEvidence: Object.fromEntries(CUSTOM_EVIDENCE_IDS.map((id) => [id, {}])),
      researchProposals: {},
      researchProposalDispositions: {},
      researchProposalOverrides: {},
    },
  });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    for (const [findings, topicCoverage] of [
      [parsed.findings, parsed.topicCoverage],
      [empty.findings, empty.topicCoverage],
      [undefined, undefined],
    ] as const) {
      const stored = new Map([[CURRENT_SESSION_STORAGE_KEY, JSON.stringify(sessionFor(findings, topicCoverage))]]);
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) } },
      });
      const restored = loadCurrentSession().project;
      assert.deepEqual(restored?.findings, findings);
      assert.deepEqual(restored?.topicCoverage, topicCoverage);
    }
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("new display findings remain separate from accepted financial evidence and model inputs", () => {
  const baseline = parseResponse(responseFixture);
  const withFindings = parseResponse({ ...responseFixture, ...displayFixture });
  assert.deepEqual(withFindings.acceptedModelInputs, baseline.acceptedModelInputs);
  assert.deepEqual(withFindings.eligibleEvidence, baseline.eligibleEvidence);
  assert.deepEqual(withFindings.evidence, baseline.evidence);
  assert.equal(withFindings.findings?.every((finding) => !("acceptedForModel" in finding)), true);
});
