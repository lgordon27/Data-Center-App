import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiligenceProvider, INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import type { EvidenceRecord } from "./cashFlowEngine";
import { buildEstimatedFinancialRange, editFinancialAssumption, EMPTY_FINANCIAL_ASSUMPTIONS } from "./financialTransmission";
(globalThis as { React?: unknown }).React = React;
const { FinancialAssumptionControls } = await import("@/components/conference/FinancialAssumptionControls");
const { FinancialDriverChart } = await import("@/components/conference/FinancialDriverChart");
const { FinancialTransmission } = await import("@/components/conference/FinancialTransmission");

const range = buildEstimatedFinancialRange({ evidence: INITIAL_EVIDENCE as unknown as EvidenceRecord, context: { isStargate: true, state: "TX" }, session: EMPTY_FINANCIAL_ASSUMPTIONS });

test("controls render eight sourced inputs with resets", () => {
  const html = renderToStaticMarkup(createElement(FinancialAssumptionControls, { range, session: EMPTY_FINANCIAL_ASSUMPTIONS, onEdit: () => {} }));
  assert.equal((html.match(/data-testid="reset-/g) ?? []).length, 8);
  assert.match(html, /Sourced default/);
});

test("driver chart shows at most six rows and no exact returns", () => {
  const html = renderToStaticMarkup(createElement(FinancialDriverChart, { drivers: range.drivers }));
  assert.ok((html.match(/data-testid="driver-row-/g) ?? []).length <= 6);
  assert.doesNotMatch(html, /IRR|MOIC|NPV/);
});

test("owned wrapper renders rounded ranges with provenance and no inherited exact returns or stress formulas", () => {
  const html = renderToStaticMarkup(createElement(DiligenceProvider, null,
    createElement(FinancialTransmission, { onNavigate: () => {}, onResolveEvidence: () => {} })));
  assert.match(html, /Estimated return: roughly \d+-\d+%/);
  assert.match(html, /Couldn&#x27;t directly source|Couldn&#x27;t directly source|Couldn't directly source/);
  assert.match(html, /A stress adjustment was applied/);
  assert.match(html, /Actual Oracle terms are not public/);
  assert.match(html, /article permalink unresolved/);
  assert.doesNotMatch(html, /IRR|NPV|MOIC|\$42|Primary model input · illustrative assumption/);
  assert.doesNotMatch(html, /climateMultiplier|QUALITY_POLICY|costMultiplier|coolingContingency|0\.0945|NOI.*2\.2/);
  assert.doesNotMatch(html, new RegExp(String(range.cases.central.model!.projectIRR)));
  assert.match(html, /No EIA provider observation is available/);
  assert.match(html, /data-testid="financial-session-review"/);
  assert.match(html, /My session financial review/);
});

test("in-range edits are explicitly Your assumption; valid out-of-range edits warn and keep reset", () => {
  for (const value of [172, 500]) {
    const session = editFinancialAssumption(EMPTY_FINANCIAL_ASSUMPTIONS, "leaseRate", value, "2026-10-06T10:00:00Z");
    const edited = buildEstimatedFinancialRange({ evidence: INITIAL_EVIDENCE as EvidenceRecord, context: { isStargate: true, state: "TX" }, session });
    const html = renderToStaticMarkup(createElement(FinancialAssumptionControls, { range: edited, session, onEdit: () => {} }));
    assert.match(html, /Your assumption/);
    if (value === 500) assert.match(html, /Outside the sourced range; allowed/);
    else assert.doesNotMatch(html, /Outside the sourced range/);
  }
});

test("unavailable driver calculations do not falsely claim no landlord effect", () => {
  const html = renderToStaticMarkup(createElement(FinancialDriverChart, { drivers: [{
    id: "leaseRate", label: "Lease revenue", lowDelta: null, highDelta: null, magnitude: 0,
    lowReason: "no-sign-change", highReason: "invalid-input",
  }] }));
  assert.match(html, /unavailable/);
  assert.doesNotMatch(html, /no landlord return effect/);
});
