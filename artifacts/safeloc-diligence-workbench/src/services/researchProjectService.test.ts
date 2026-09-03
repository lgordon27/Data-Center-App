import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultAssumptionResearch,
  CUSTOM_EVIDENCE_IDS,
  parseResponse,
  researchProject,
  RESEARCH_PROJECT_TIMEOUT_MS,
  summarizeSourceCoverage,
} from "./researchProjectService";

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
    ...(id === CUSTOM_EVIDENCE_IDS[0] ? {
      sourceUrl: "https://example.com/atlas/source",
      sourceTitle: "Atlas filing",
      sourcePublisher: "example.com",
      sourcePublishedAt: "2026-06-01",
      sourceAccessedAt: "2026-08-30",
      sourceAccessStatus: "not provided",
    } : {}),
  })),
};

test("accepts the exact 16-item custom research contract", () => {
  const parsed = parseResponse(response);
  assert.equal(parsed.evidence.length, 16);
  assert.equal(parsed.projectSummary.capacityMW, 600);
  assert.equal(parsed.projectSummary.capacityProvenance, "ai-reported");
});

test("reports mutually exclusive source coverage counts that total sixteen", () => {
  const parsed = parseResponse({
    ...response,
    evidence: response.evidence.map((item, index) => index === 1
      ? {
          ...item,
          value: "Company-reported arrangement",
          classification: "Management Assertion" as const,
        }
      : item),
  });
  const coverage = summarizeSourceCoverage(parsed.evidence);
  assert.deepEqual(coverage, { supported: 0, aiKnowledge: 1, missing: 15 });
  assert.equal(coverage.supported + coverage.aiKnowledge + coverage.missing, 16);
});

test("uses the standardized capacity fallback for malformed or implausible capacity", () => {
  for (const capacityMW of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 10_001, "2,000 MW"]) {
    const parsed = parseResponse({
      ...response,
      projectSummary: { ...response.projectSummary, capacityMW },
    });
    assert.equal(parsed.projectSummary.capacityMW, 1_200);
    assert.equal(parsed.projectSummary.capacityProvenance, "standardized-default");
  }
});

test("rejects custom responses with a missing modeled item", () => {
  assert.throws(() => parseResponse({ ...response, evidence: response.evidence.slice(0, 15) }), /exactly 16/i);
});

test("keeps only safe direct source links from custom responses", () => {
  const parsed = parseResponse(response);
  assert.equal(parsed.evidence[0].sourceUrl, "https://example.com/atlas/source");
  assert.equal(parsed.evidence[0].sourceTitle, "Atlas filing");
  assert.equal(parsed.evidence[0].sourcePublishedAt, "2026-06-01");
  assert.equal(parsed.evidence[0].sourceAccessStatus, "not provided");

  const unsafe = {
    ...response,
    evidence: response.evidence.map((item, index) => ({
      ...item,
      sourceUrl: index === 0 ? "javascript:alert(1)" : "https://user:pass@example.com/source",
    })),
  };
  assert.equal(parseResponse(unsafe).evidence.every((item) => item.sourceUrl === undefined), true);
});

test("uses a 60-second request budget", () => {
  assert.equal(RESEARCH_PROJECT_TIMEOUT_MS, 60_000);
});

test("retries one timeout response and reports retry progress", async () => {
  let calls = 0;
  const progress: string[] = [];
  const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    assert.deepEqual(JSON.parse(String(init?.body)), {
      name: "Atlas",
      location: "Texas",
      knownData: {
        capacity: 800,
        operator: "Atlas Compute",
        status: "Operating",
        sourceUrl: "https://example.com/directory/atlas",
      },
    });
    return calls === 1
      ? new Response(JSON.stringify({ error: "Project research timed out." }), { status: 504 })
      : new Response(JSON.stringify(response), { status: 200 });
  };
  const result = await researchProject("Atlas", "Texas", fetchImpl as typeof fetch, {
    knownData: {
      capacity: 800,
      operator: "Atlas Compute",
      status: "Operating",
      sourceUrl: "https://example.com/directory/atlas",
    },
    onProgress: (state) => progress.push(state),
  });
  assert.equal(result.evidence.length, 16);
  assert.equal(calls, 2);
  assert.deepEqual(progress, ["researching", "retrying"]);
});

test("does not retry non-timeout failures", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: "Provider rejected the request." }), { status: 502 });
  };
  await assert.rejects(() => researchProject("Atlas", "Texas", fetchImpl as typeof fetch), /Provider rejected/);
  assert.equal(calls, 1);
});

test("creates an explicitly labeled 16-item Missing Evidence fallback", () => {
  const fallback = createDefaultAssumptionResearch("Atlas", "Taylor County, Texas", {
    capacity: 880,
    operator: "Atlas Compute",
    status: "Planned",
    sourceUrl: "https://example.com/directory/atlas",
  });
  assert.equal(fallback.researchMode, "default-assumptions");
  assert.equal(fallback.projectSummary.capacityMW, 880);
  assert.equal(fallback.projectSummary.capacityProvenance, "directory-reported");
  assert.equal(fallback.evidence.length, 16);
  assert.equal(fallback.evidence.every((item) => item.classification === "Missing Evidence"), true);
  assert.equal(fallback.evidence.every((item) => item.sourceUrl === undefined), true);
});

test("preserves server-normalized varied classifications and partial coverage", () => {
  const varied = {
    ...response,
    evidence: response.evidence.map((item, index) => ({
      ...item,
      value: index === 0 ? 48 : `Finding ${index + 1}`,
      classification: index === 0
        ? "Management Assertion"
        : index === 1
          ? "Model Inference"
          : index === 2
            ? "User Assumption"
            : item.classification,
      coverageStatus: index < 3 ? "partial" : "searched-no-support",
      citation: index === 0
        ? "AI classification downgraded: cited source not in retrieved search results. Original classification: Verified Evidence."
        : item.citation,
    })),
  };
  const parsed = parseResponse(varied);
  assert.deepEqual(
    parsed.evidence.slice(0, 3).map((item) => item.classification),
    ["Management Assertion", "Model Inference", "User Assumption"],
  );
  assert.equal(parsed.evidence[0].coverageStatus, "partial");
  assert.match(parsed.evidence[0].citation, /classification downgraded/i);
});