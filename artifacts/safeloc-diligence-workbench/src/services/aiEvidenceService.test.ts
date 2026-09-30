import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_EVIDENCE_ENDPOINT,
  analyzeEvidence,
} from "./aiEvidenceService";

const item = {
  label: "Annual Cooling Water",
  value: "Not disclosed",
  citation: "No public disclosure as of Aug 2026",
};
const project = {
  name: "Project Atlas",
  location: "Maricopa County, Arizona",
  kind: "custom",
} as const;

function proxyResponse(text: string, status = 200) {
  return new Response(text, {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("sends the same-origin evidence contract and normalizes a valid assessment", async () => {
  let request: Request | undefined;
  const result = await analyzeEvidence(item, project, async (input, init) => {
    request = new Request(new URL(String(input), "http://localhost"), init);
    return proxyResponse(JSON.stringify({
      classification: "missing evidence",
      reasoning: "The project has not publicly disclosed a facility-level water total.",
      downgradeSuggested: false,
    }));
  });

  assert.deepEqual(result, {
    status: "success",
    classification: "Missing Evidence",
    reasoning: "The project has not publicly disclosed a facility-level water total.",
    downgradeSuggested: false,
  });
  assert.equal(new URL(request!.url).pathname, AI_EVIDENCE_ENDPOINT);
  assert.equal(request?.method, "POST");
  assert.equal(request?.headers.get("content-type"), "application/json");
  assert.deepEqual(await request!.json(), {
    name: item.label,
    value: item.value,
    source: item.citation,
    projectName: project.name,
    projectLocation: project.location,
    projectKind: project.kind,
  });
});

test("forwards claim-specific retained text and prefers it to a broader retained passage", async () => {
  let request: Request | undefined;
  await analyzeEvidence({
    ...item,
    classification: "Management Assertion",
    sources: [{
      url: "https://example.gov/source",
      title: "Source",
      publisher: "Publisher",
      publishedAt: null,
      accessedAt: null,
      accessStatus: "accessible",
      excerpt: "Search-result summary that is not retained source text.",
      claimPassage: "Exact retained passage for annual cooling water.",
      claimCited: true,
      exactProject: true,
      sourceClass: "primary-government",
      searchDomain: "water",
      relationship: "primary",
      accessOutcome: {
        state: "accessible",
        reason: "Retrieved",
        passage: "Longer surrounding retained document passage.",
      },
    }],
  }, project, async (input, init) => {
    request = new Request(new URL(String(input), "http://localhost"), init);
    return proxyResponse(JSON.stringify({
      classification: "Management Assertion",
      reasoning: "The cited source is a company statement.",
      downgradeSuggested: false,
    }));
  });

  assert.deepEqual(await request!.json(), {
    name: item.label,
    value: item.value,
    source: item.citation,
    sourceText: "Exact retained passage for annual cooling water.",
    existingClassification: "Management Assertion",
    projectName: project.name,
    projectLocation: project.location,
    projectKind: project.kind,
  });
});

test("uses a supported exact quote when no claim passage is retained and caps text at 2,000 characters", async () => {
  let request: Request | undefined;
  await analyzeEvidence({
    ...item,
    claimMappings: [{
      id: "water-claim",
      sourceId: "public-filing",
      passageId: "water-passage",
      variable: "Annual Cooling Water",
      claimText: "The filing reports the water measure.",
      entityScope: "project",
      facilityScope: "facility",
      phaseScope: "current",
      timePeriod: null,
      sourceType: "primary-company",
      contradictionStatus: "none",
      supportStatus: "supported",
      exactQuotation: "Q".repeat(2_200),
      rejectionCodes: [],
    }],
  }, project, async (input, init) => {
    request = new Request(new URL(String(input), "http://localhost"), init);
    return proxyResponse(JSON.stringify({
      classification: "Verified Evidence",
      reasoning: "The exact project passage states the value.",
      downgradeSuggested: false,
    }));
  });

  const body = await request!.json() as { sourceText?: string };
  assert.equal(body.sourceText?.length, 2_000);
  assert.equal(body.sourceText, "Q".repeat(2_000));
});

test("omits source text rather than inventing a passage when none is retained", async () => {
  let request: Request | undefined;
  await analyzeEvidence(item, project, async (input, init) => {
    request = new Request(new URL(String(input), "http://localhost"), init);
    return proxyResponse(JSON.stringify({
      classification: "Missing Evidence",
      reasoning: "The citation does not establish the value.",
      downgradeSuggested: false,
    }));
  });

  const body = await request!.json() as Record<string, unknown>;
  assert.equal(Object.hasOwn(body, "sourceText"), false);
});

test("returns raw text for non-JSON and structurally invalid responses", async () => {
  const rawText = "I would review this manually.";
  const nonJson = await analyzeEvidence(item, project, async () => new Response(rawText, { status: 200 }));
  assert.deepEqual(nonJson, {
    status: "unparseable",
    message: "Could not parse structured assessment. Review manually.",
    rawText,
  });

  const invalid = await analyzeEvidence(item, project, async () => proxyResponse(JSON.stringify({
    classification: "Verified Evidence",
    reasoning: "",
    downgradeSuggested: false,
  })));
  assert.equal(invalid.status, "unparseable");
  assert.match(invalid.message, /concise reasoning/);

  const missingDowngradeSignal = await analyzeEvidence(item, project, async () => proxyResponse(JSON.stringify({
    classification: "Missing Evidence",
    reasoning: "The citation does not establish the value.",
  })));
  assert.equal(missingDowngradeSignal.status, "unparseable");
  assert.match(missingDowngradeSignal.message, /downgrade signal/);
});

test("normalizes transport failures and abort timeouts", async () => {
  const failed = await analyzeEvidence(item, project, async () => {
    throw new Error("network unavailable");
  });
  assert.equal(failed.status, "error");
  assert.match(failed.message, /Classify manually/);

  const timedOut = await analyzeEvidence(item, project, async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  });
  assert.deepEqual(timedOut, {
    status: "timeout",
    message: "AI analysis timed out after 10 seconds. Classify manually.",
  });
});

test("uses a safe manual-review message for a rate-limited response", async () => {
  const result = await analyzeEvidence(item, project, async () => new Response(JSON.stringify({
    error: "provider-internal detail should not be shown",
  }), { status: 429 }));

  assert.deepEqual(result, {
    status: "error",
    message: "AI analysis request limit reached. Please wait before trying again and classify manually.",
  });
  assert.doesNotMatch(result.message, /provider-internal detail/);
});

test("makes a fresh request for every analysis", async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return proxyResponse(JSON.stringify({
      classification: "Model Inference",
      reasoning: "The estimate is derived from related public facts rather than a disclosed contract.",
      downgradeSuggested: false,
    }));
  };

  await analyzeEvidence(item, project, fetchImpl);
  await analyzeEvidence(item, project, fetchImpl);
  assert.equal(requests, 2);
});