import test from "node:test";
import assert from "node:assert/strict";
import { discoverOfficialSources, OFFICIAL_SOURCE_DISCOVERY_LIMITS } from "./officialSourceDiscovery.mjs";

function response(body, contentType = "text/html", status = 200) {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

test("zero-provider-URL fallback discovers an exact-project official URL", async () => {
  const calls = [];
  const result = await discoverOfficialSources({
    projectIdentity: { name: "Project Atlas", location: "Taylor County, Texas" },
    knownData: { companyDomains: ["developer.example"] },
    category: "project-identity",
    maxAttempts: 3,
    now: () => Date.UTC(2026, 0, 2),
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith("/sitemap.xml")) {
        return response("<urlset><url><loc>https://developer.example/projects/project-atlas/</loc></url></urlset>", "application/xml");
      }
      return response("<html></html>");
    },
  });
  assert.equal(result.candidateUrls.length, 1);
  assert.equal(result.candidateUrls[0].url, "https://developer.example/projects/project-atlas/");
  assert.equal(result.candidateUrls[0].sourceChannel, "declared-company-domain");
  assert.equal(result.candidateUrls[0].provenance.discoveryOnly, true);
  assert.equal(result.discoveryIsEvidence, false);
  assert.deepEqual(calls.slice(0, 2), ["https://developer.example/", "https://developer.example/sitemap.xml"]);
});

test("preserves a named authority with an unknown domain without probing it", async () => {
  const calls = [];
  const result = await discoverOfficialSources({
    projectIdentity: { name: "Project Atlas", location: "Nevada" },
    knownData: { authorityNames: ["Example County Planning Department"] },
    now: () => 0,
    fetchImpl: async (url) => {
      calls.push(url);
      return response("");
    },
  });
  assert.deepEqual(result.authorities, [{
    name: "Example County Planning Department",
    domain: null,
    status: "identified-no-domain",
    sourceChannel: "declared-known-data",
    jurisdiction: "unknown",
    establishmentMethod: "declared-name-only",
    discoveredAt: new Date(0).toISOString(),
    urlsAttempted: [],
    accessOutcomes: [],
    provenance: { kind: "knownData", field: "authorityNames", discoveryOnly: true },
  }]);
  assert.equal(calls.length, 0);
});

test("authorizes every fetch, records shared physical indexes, and stops with a denied diagnostic", async () => {
  const fetched = [];
  let sharedOpportunities = 3;
  let physicalOpenIndex = 0;
  const result = await discoverOfficialSources({
    projectIdentity: { name: "Project Atlas" },
    knownData: { companyDomains: ["official.example", "second-official.example"] },
    maxAttempts: 12,
    now: () => 0,
    authorizeAttempt: () => {
      if (sharedOpportunities === 0) return { allowed: false };
      sharedOpportunities -= 1;
      physicalOpenIndex += 1;
      return { allowed: true, physicalOpenIndex };
    },
    fetchImpl: async (url) => {
      fetched.push(url);
      return response("");
    },
  });
  assert.equal(fetched.length, 3);
  assert.deepEqual(result.attempts.map((attempt) => attempt.physicalOpenIndex), [1, 2, 3, null]);
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ["parsed", "parsed", "parsed", "budget-denied"]);
  assert.equal(sharedOpportunities, 0);
});

test("keeps declared official source families distinct and never traverses off-domain links", async () => {
  const fetched = [];
  const result = await discoverOfficialSources({
    projectIdentity: { name: "Project Atlas", location: "Mesa, Arizona" },
    knownData: {
      city: "Mesa",
      county: "Maricopa County",
      cityDomains: ["mesaaz.gov"],
      countyDomains: ["maricopa.gov"],
      utilityDomains: ["utility.example"],
      economicDevelopmentDomains: ["invest.example"],
      knownOfficialEndpoints: ["https://records.example/api/projects"],
    },
    category: "project-identity",
    maxAttempts: 16,
    now: () => 0,
    fetchImpl: async (url) => {
      fetched.push(url);
      return response('<a href="https://evil.example/project-atlas">Project Atlas</a>');
    },
  });
  const channels = result.attempts.map((attempt) => attempt.sourceChannel);
  assert.equal(channels[0], "declared-official-endpoint");
  assert.ok(channels.includes("declared-city-domain"));
  assert.ok(channels.includes("declared-county-domain"));
  assert.ok(channels.includes("declared-utility-domain"));
  assert.ok(channels.includes("declared-economic-development-domain"));
  assert.ok(fetched.every((url) => ["records.example", "mesaaz.gov", "maricopa.gov", "utility.example", "invest.example"].includes(new URL(url).hostname)));
  assert.equal(result.candidateUrls.some((candidate) => candidate.url.includes("evil.example")), false);
  const cityAuthority = result.authorities.find((authority) => authority.sourceChannel === "declared-city-domain");
  assert.equal(cityAuthority.jurisdiction, "Mesa");
  assert.equal(cityAuthority.establishmentMethod, "declared-known-data-domain");
  assert.equal(cityAuthority.discoveredAt, new Date(0).toISOString());
  assert.ok(cityAuthority.urlsAttempted.length > 0);
  assert.equal(cityAuthority.accessOutcomes[0].status, "parsed");
});

test("rejects unsafe and malformed declared URLs and discovered links", async () => {
  const calls = [];
  const result = await discoverOfficialSources({
    projectIdentity: { name: "Project Atlas" },
    knownData: {
      sourceUrl: "http://user:password@official.example/project-atlas",
      companyDomains: ["localhost", "https://[::1]", "%%%bad", "official.example"],
    },
    maxAttempts: 1,
    fetchImpl: async (url) => {
      calls.push(url);
      return response(`
        <a href="http://127.0.0.1/project-atlas">Project Atlas</a>
        <a href="https://evil.example/project-atlas">Project Atlas</a>
        <a href="https://user:secret@official.example/project-atlas">Project Atlas</a>
      `);
    },
  });
  assert.deepEqual(calls, ["https://official.example/"]);
  assert.deepEqual(result.candidateUrls, []);
});

test("hard-bounds attempts even when a larger maximum is requested", async () => {
  let calls = 0;
  const result = await discoverOfficialSources({
    projectIdentity: { name: "Project Atlas", state: "Texas" },
    knownData: {
      companyDomains: Array.from({ length: 20 }, (_, index) => `official-${index}.example`),
    },
    maxAttempts: 10_000,
    fetchImpl: async () => {
      calls += 1;
      return response("");
    },
  });
  assert.equal(calls, OFFICIAL_SOURCE_DISCOVERY_LIMITS.hardMaxAttempts);
  assert.equal(result.attempts.length, OFFICIAL_SOURCE_DISCOVERY_LIMITS.hardMaxAttempts);
  assert.equal(result.limits.maxAttempts, OFFICIAL_SOURCE_DISCOVERY_LIMITS.hardMaxAttempts);
});

test("deduplicates an exact-project URL repeated in a sitemap", async () => {
  const result = await discoverOfficialSources({
    projectIdentity: { name: "Project Atlas" },
    knownData: { companyDomains: ["official.example"] },
    maxAttempts: 2,
    fetchImpl: async (url) => url.endsWith("sitemap.xml")
      ? response(`
          <urlset>
            <url><loc>https://official.example/projects/project-atlas</loc></url>
            <url><loc>https://official.example/projects/project-atlas#overview</loc></url>
          </urlset>
        `, "application/xml")
      : response(""),
  });
  assert.deepEqual(result.candidateUrls.map((candidate) => candidate.url), [
    "https://official.example/projects/project-atlas",
  ]);
});