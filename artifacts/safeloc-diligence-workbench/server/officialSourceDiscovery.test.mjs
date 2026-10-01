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

test("ranked exact official project endpoints receive physical admission before a generic declared root", async () => {
  const calls = [];
  const result = await discoverOfficialSources({
    projectIdentity: { name: "Project Atlas", location: "Taylor County, Texas" },
    knownData: {
      sourceUrl: "https://developer.example/",
      companyDomains: ["developer.example"],
      knownOfficialEndpoints: ["https://developer.example/projects/project-atlas/"],
    },
    category: "project-identity",
    maxAttempts: 2,
    fetchImpl: async (url) => {
      calls.push(url);
      return response("");
    },
  });

  assert.deepEqual(calls, [
    "https://developer.example/projects/project-atlas/",
    "https://developer.example/",
  ]);
  assert.deepEqual(result.attempts.map((attempt) => attempt.physicalOpenIndex), [null, null]);
  assert.equal(result.candidateUrls[0].url, "https://developer.example/");
  assert.equal(result.discoveryIsEvidence, false);
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

test("official discovery cancels a stalled streamed body on client abort", async () => {
  const controller = new AbortController();
  let bodyPullStarted;
  let bodyCancelled = false;
  const bodyReadStarted = new Promise((resolve) => { bodyPullStarted = resolve; });
  const resultPromise = discoverOfficialSources({
    projectIdentity: {
      name: "Project Atlas",
      location: "Taylor County, Texas",
      knownData: { companyDomains: ["records.example"] },
    },
    knownData: { companyDomains: ["records.example"] },
    maxAttempts: 1,
    signal: controller.signal,
    fetchImpl: async () => new Response(new ReadableStream({
      pull() {
        bodyPullStarted();
      },
      cancel() {
        bodyCancelled = true;
      },
    }), { status: 200, headers: { "content-type": "text/html" } }),
  });
  await bodyReadStarted;
  controller.abort();
  const result = await resultPromise;
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].status, "aborted");
  assert.equal(bodyCancelled, true);
});

async function discoverRegistryAuthorities(state, category = null, maxAttempts = 1) {
  const fetched = [];
  const result = await discoverOfficialSources({
    projectIdentity: { name: "Project Atlas", state },
    category,
    maxAttempts,
    fetchImpl: async (url) => {
      fetched.push(url);
      return response("");
    },
  });
  return {
    authorities: result.authorities
      .filter((authority) => authority.sourceChannel === "verified-state-domain-registry")
      .map(({ name, domain }) => ({ name, domain })),
    fetched,
  };
}

test("recognizes full state names and postal codes while preserving Texas and Arizona agencies", async () => {
  const cases = [
    {
      aliases: ["Texas", "TX"],
      expected: [
        { name: "Texas Commission on Environmental Quality", domain: "tceq.texas.gov" },
        { name: "Texas Water Development Board", domain: "twdb.texas.gov" },
        { name: "Public Utility Commission of Texas", domain: "puc.texas.gov" },
        { name: "Electric Reliability Council of Texas", domain: "ercot.com" },
        { name: "Texas Department of Licensing and Regulation", domain: "tdlr.texas.gov" },
      ],
    },
    {
      aliases: ["Arizona", "AZ"],
      expected: [
        { name: "Arizona Department of Environmental Quality", domain: "azdeq.gov" },
        { name: "Arizona Department of Water Resources", domain: "azwater.gov" },
        { name: "Arizona Corporation Commission", domain: "azcc.gov" },
      ],
    },
    {
      aliases: ["Virginia", "VA"],
      expected: [
        { name: "Virginia Department of Environmental Quality", domain: "deq.virginia.gov" },
        { name: "Virginia State Corporation Commission", domain: "scc.virginia.gov" },
      ],
    },
    {
      aliases: ["Georgia", "GA"],
      expected: [
        { name: "Georgia Environmental Protection Division", domain: "epd.georgia.gov" },
        { name: "Georgia Public Service Commission", domain: "psc.ga.gov" },
      ],
    },
    {
      aliases: ["Ohio", "OH"],
      expected: [
        { name: "Ohio Environmental Protection Agency", domain: "epa.ohio.gov" },
        { name: "Public Utilities Commission of Ohio", domain: "puco.ohio.gov" },
        { name: "Ohio Department of Natural Resources", domain: "ohiodnr.gov" },
      ],
    },
  ];

  for (const { aliases, expected } of cases) {
    for (const alias of aliases) {
      const result = await discoverRegistryAuthorities(alias);
      assert.deepEqual(result.authorities, expected, `registry for ${alias}`);
      assert.equal(result.fetched.length, 1, `injected fetch used for ${alias}`);
      assert.equal(new URL(result.fetched[0]).hostname, expected[0].domain, `first registry domain fetched for ${alias}`);
    }
  }
});

test("filters new state agencies by their assigned discovery categories", async () => {
  const cases = [
    ["TX", "construction-capital", ["tdlr.texas.gov"]],
    ["Texas", "permitting-community", ["tceq.texas.gov", "tdlr.texas.gov"]],
    ["VA", "water", ["deq.virginia.gov"]],
    ["Virginia", "permitting-community", ["deq.virginia.gov"]],
    ["Virginia", "climate-operational-hazard", ["deq.virginia.gov"]],
    ["Virginia", "grid", ["scc.virginia.gov"]],
    ["VA", "electricity", ["scc.virginia.gov"]],
    ["GA", "water", ["epd.georgia.gov"]],
    ["Georgia", "permitting-community", ["epd.georgia.gov"]],
    ["Georgia", "climate-operational-hazard", ["epd.georgia.gov"]],
    ["Georgia", "grid", ["psc.ga.gov"]],
    ["GA", "electricity", ["psc.ga.gov"]],
    ["OH", "water", ["epa.ohio.gov", "ohiodnr.gov"]],
    ["Ohio", "permitting-community", ["epa.ohio.gov"]],
    ["Ohio", "climate-operational-hazard", ["epa.ohio.gov", "ohiodnr.gov"]],
    ["Ohio", "grid", ["puco.ohio.gov"]],
    ["OH", "electricity", ["puco.ohio.gov"]],
  ];

  for (const [state, category, expectedDomains] of cases) {
    const result = await discoverRegistryAuthorities(state, category, 0);
    assert.deepEqual(
      result.authorities.map((authority) => authority.domain),
      expectedDomains,
      `${category} authorities for ${state}`,
    );
    assert.deepEqual(result.fetched, []);
  }
});

test("unknown states do not add state-registry authorities or trigger registry fetches", async () => {
  const result = await discoverRegistryAuthorities("Nevada");
  assert.deepEqual(result.authorities, []);
  assert.deepEqual(result.fetched, []);
});
