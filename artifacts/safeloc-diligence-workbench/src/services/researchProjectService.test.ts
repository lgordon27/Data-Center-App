import assert from "node:assert/strict";
import test from "node:test";
import { CUSTOM_EVIDENCE_IDS, parseResponse } from "./researchProjectService";

const response = {
  projectSummary: { name: "Atlas", location: "Texas", description: "High-level research.", capacityMW: 600 },
  evidence: CUSTOM_EVIDENCE_IDS.map((id) => ({
    id,
    label: id,
    value: "Not disclosed",
    unit: "Context",
    classification: "Missing Evidence" as const,
    citation: "Public source searched.",
    description: "Not established at facility level.",
    sourceRole: "AI-researched",
    ...(id === CUSTOM_EVIDENCE_IDS[0] ? { sourceUrl: "https://example.com/atlas/source" } : {}),
  })),
};

test("accepts the exact 16-item custom research contract", () => {
  assert.equal(parseResponse(response).evidence.length, 16);
});

test("rejects custom responses with a missing modeled item", () => {
  assert.throws(() => parseResponse({ ...response, evidence: response.evidence.slice(0, 15) }), /exactly 16/i);
});

test("keeps only safe direct source links from custom responses", () => {
  const parsed = parseResponse(response);
  assert.equal(parsed.evidence[0].sourceUrl, "https://example.com/atlas/source");

  const unsafe = {
    ...response,
    evidence: response.evidence.map((item, index) => ({
      ...item,
      sourceUrl: index === 0 ? "javascript:alert(1)" : "https://user:pass@example.com/source",
    })),
  };
  assert.equal(parseResponse(unsafe).evidence.every((item) => item.sourceUrl === undefined), true);
});