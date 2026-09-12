import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PROJECT_RESEARCH_REGISTRY_FILE,
  createProjectResearchRegistry,
  handleProjectResearchRegistryRequest,
  projectResearchIdentity,
} from "./projectResearchRegistry.mjs";

function responseRecorder() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: "",
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body ?? "";
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

function usefulResult(overrides = {}) {
  return {
    projectSummary: { name: "Atlas", location: "Taylor County, TX", description: "Public record.", capacityMW: 600 },
    researchStatus: "partial",
    researchCoverage: { runCorrelationId: "run-1" },
    researchAudit: { version: 3, policyVersion: 2, runCorrelationId: "run-1" },
    sourceLedger: [{ canonicalUrl: "https://agency.example/filing" }],
    evidence: [{
      id: "project-identity",
      classification: "Management Assertion",
      sourceUrl: "https://agency.example/filing",
      claimPassage: "Atlas is operated by Atlas Compute.",
      sources: [{
        url: "https://agency.example/filing",
        canonicalUrl: "https://agency.example/filing",
        title: "Atlas filing",
        publisher: "Agency",
        sourceClass: "primary-government",
        exactProject: true,
        claimPassage: "Atlas is operated by Atlas Compute.",
        accessOutcome: { state: "accessible", reason: "http-200", passage: "Atlas is operated by Atlas Compute." },
      }],
    }],
    ...overrides,
  };
}

test("project identity is stable and prefers provider canonical ids", () => {
  assert.equal(
    projectResearchIdentity({ name: "Atlas", location: "TX", knownData: { operator: "Compute" } }).id,
    projectResearchIdentity({ name: " atlas ", location: " tx ", knownData: { operator: " compute " } }).id,
  );
  const provider = projectResearchIdentity({
    name: "A different display name",
    location: "A different location",
    knownData: { providerId: "abc-123", operator: "Compute" },
  });
  assert.equal(provider.identityBasis, "provider/canonical-id");
  assert.equal(provider.canonicalId, "abc-123");
});

test("registry atomically retains useful partial research and keeps support separate", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-project-registry-"));
  const registry = createProjectResearchRegistry({ directory, now: () => Date.parse("2026-09-03T00:00:00.000Z") });
  const project = { name: "Atlas", location: "Taylor County, TX", knownData: { operator: "Atlas Compute" } };
  const record = await registry.retain(project, usefulResult());
  assert.ok(record);
  assert.equal(record.relationshipSupport.supportedRelationships.length, 0);
  assert.equal(record.relationshipSupport.candidates[0].relationshipSupport.promoted, false);
  assert.equal(record.relationshipSupport.candidates[0].exactPassage, "Atlas is operated by Atlas Compute.");
  assert.equal(record.financialEligibility.eligible, false);
  assert.equal(record.financialEligibility.explicitActionRequired, true);
  assert.match(record.limitations[0], /not shared/i);

  const persisted = JSON.parse(await readFile(path.join(directory, PROJECT_RESEARCH_REGISTRY_FILE), "utf8"));
  assert.equal(persisted.version, 1);
  assert.equal(persisted.records.length, 1);
  const reloaded = createProjectResearchRegistry({ directory });
  assert.deepEqual(await reloaded.read(record.projectIdentity.id), record);
});

test("zero-evidence and failed runs do not become registry relationships", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-project-registry-empty-"));
  const registry = createProjectResearchRegistry({ directory });
  const project = { name: "No Evidence", location: "Ohio", knownData: { operator: "Unknown Co" } };
  assert.equal(await registry.retain(project, {
    researchStatus: "failed",
    evidence: [],
    researchError: { message: "provider unavailable" },
  }), null);
  assert.equal(await registry.retain(project, {
    researchStatus: "partial",
    evidence: [{ classification: "Missing Evidence" }],
    sourceLedger: [],
  }), null);
  assert.deepEqual(await registry.list(), []);
});

test("registry API lists and reads records without write affordances", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-project-registry-api-"));
  const registry = createProjectResearchRegistry({ directory });
  const record = await registry.retain({ name: "Atlas", location: "TX" }, usefulResult());

  const listResponse = responseRecorder();
  await handleProjectResearchRegistryRequest({ method: "GET", url: "/api/project-research" }, listResponse, { registry });
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.json().records.length, 1);
  assert.equal(listResponse.json().storage.shared, false);

  const readResponse = responseRecorder();
  await handleProjectResearchRegistryRequest({ method: "GET", url: `/api/project-research/${record.projectIdentity.id}` }, readResponse, { registry });
  assert.equal(readResponse.statusCode, 200);
  assert.equal(readResponse.json().record.projectIdentity.id, record.projectIdentity.id);

  const writeResponse = responseRecorder();
  await handleProjectResearchRegistryRequest({ method: "POST", url: "/api/project-research" }, writeResponse, { registry });
  assert.equal(writeResponse.statusCode, 405);
});
