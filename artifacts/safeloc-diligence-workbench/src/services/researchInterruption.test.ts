import assert from "node:assert/strict";
import test from "node:test";
import { researchProject } from "./researchProjectService";
import { getPublicResearchPresentation, PublicResearchRequestError } from "./publicResearchPresentation";

for (const status of [500, 502, 503, 504]) {
  test(`HTTP ${status} without a result is labeled Research interrupted`, async () => {
    let calls = 0;
    await assert.rejects(researchProject("Offline interruption fixture", "Texas", (async () => {
      calls += 1;
      return new Response("<html>Internal Server Error</html>", { status });
    }) as typeof fetch), (error: unknown) => {
      assert.ok(error instanceof PublicResearchRequestError);
      assert.equal(error.kind, "interrupted");
      assert.match(error.message, /server restarted or lost connection/i);
      assert.equal(getPublicResearchPresentation({ errorType: error.kind }).label, "Research interrupted");
      return true;
    });
    assert.equal(calls, 1);
  });
}

test("a dropped browser connection is interrupted, without automatic retry", async () => {
  let calls = 0;
  await assert.rejects(researchProject("Offline dropped connection", "Texas", (async () => {
    calls += 1;
    throw new TypeError("Failed to fetch");
  }) as typeof fetch), (error: unknown) => {
    assert.ok(error instanceof PublicResearchRequestError);
    assert.equal(error.kind, "interrupted");
    return true;
  });
  assert.equal(calls, 1);
});

test("an explicit server provider rejection is not mislabeled as an interruption", async () => {
  await assert.rejects(researchProject("Offline provider rejection", "Texas", (async () =>
    new Response(JSON.stringify({
      error: "Provider rejected request", errorType: "upstream",
      providerDiagnostic: { upstreamStatus: 400, errorType: "invalid_request_error" },
    }), { status: 502 })) as typeof fetch), (error: unknown) => {
    assert.ok(error instanceof PublicResearchRequestError);
    assert.equal(error.kind, "upstream");
    return true;
  });
});
