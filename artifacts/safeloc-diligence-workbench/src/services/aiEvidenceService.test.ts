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
    }));
  });

  assert.deepEqual(result, {
    status: "success",
    classification: "Missing Evidence",
    reasoning: "The project has not publicly disclosed a facility-level water total.",
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
  })));
  assert.equal(invalid.status, "unparseable");
  assert.match(invalid.message, /concise reasoning/);
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
    }));
  };

  await analyzeEvidence(item, project, fetchImpl);
  await analyzeEvidence(item, project, fetchImpl);
  assert.equal(requests, 2);
});