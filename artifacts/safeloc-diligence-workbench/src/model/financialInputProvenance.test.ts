import assert from "node:assert/strict";
import test from "node:test";
import type { EvidenceItem } from "@/context/DiligenceContext";
import { getFinancialInputProvenance } from "./financialInputProvenance";

const input = (overrides: Record<string, unknown> = {}) => ({
  id: "metric",
  label: "Power price",
  value: "42",
  classification: "Verified Evidence",
  sourceRole: "Dated public records",
  origin: "dossier",
  sourceUrl: "https://example.test/source",
  ...overrides,
} as unknown as EvidenceItem);

test("provenance follows accepted lineage, not only custom origin", () => {
  assert.equal(getFinancialInputProvenance(input({
    origin: "custom-research",
    acceptedForModel: true,
    eligibleForModel: true,
    researchState: "accepted",
    sourceValidation: { state: "financially-eligible" },
  })), "Sourced");
});

test("pending, unsupported, and synthetic inputs are not labeled sourced", () => {
  assert.equal(getFinancialInputProvenance(input({ origin: "custom-research", acceptedForModel: false })), "Unresolved");
  assert.equal(getFinancialInputProvenance(input({ origin: "synthetic-default" })), "Illustrative assumption");
  assert.equal(getFinancialInputProvenance(input({ classification: "Missing Evidence" })), "Unresolved");
  assert.equal(getFinancialInputProvenance(input({
    origin: "custom-research",
    acceptedForModel: false,
    eligibleForModel: true,
    researchState: "proposed",
    sourceValidation: { state: "financially-eligible" },
  }), "Verified Evidence"), "Unresolved");
  assert.equal(getFinancialInputProvenance(input({
    origin: "synthetic-default", classification: "Missing Evidence",
  })), "Illustrative assumption");
});

test("sourced analyst calculations remain distinct from direct evidence", () => {
  assert.equal(getFinancialInputProvenance(input({ sourceRole: "Analyst inference from dated public records" })), "Derived from sourced evidence");
  assert.equal(getFinancialInputProvenance(input({
    origin: "custom-research",
    acceptedForModel: true,
    eligibleForModel: true,
    researchState: "accepted",
    sourceValidation: { state: "financially-eligible" },
    sourceRole: "Calculated from sourced evidence",
  })), "Derived from sourced evidence");
});