import { expect, test } from "@playwright/test";
import { blockUnmockedProviderRequests } from "./offline-provider-reads";
import { readFileSync } from "node:fs";

const syntheticResearchFixture = JSON.parse(
  readFileSync(new URL("./fixtures/research-project-synthetic.json", import.meta.url), "utf8"),
) as Record<string, unknown>;
const partialReceiptsFixture = JSON.parse(
  readFileSync(new URL("../server/fixtures/research-partial-receipts.json", import.meta.url), "utf8"),
) as {
  project: { name: string; location: string; knownData: { city: string; state: string } };
  accessibleReceipt: {
    url: string;
    title: string;
    date: string;
    categoryIds: string[];
    sourceChannel: string;
    passage: string;
  };
};

const evidenceIds = [
  "electricity_cost",
  "water_consumption",
  "grid_interconnection",
  "water_escalation",
  "community_risk",
  "renewable_percentage",
  "cooling_capex",
  "electricity_escalation",
  "carbon_compliance",
  "permitting_timeline",
  "customer_concentration",
  "water_rights",
  "site_hazard_exposure",
  "backup_power_capacity",
  "water_source_resilience",
  "downtime_cost",
];
const scenariosKey = "safeloc:diligence:scenarios:v1";

async function openCustomProjectDialog(page: import("@playwright/test").Page) {
  const paths = page.getByTestId("home-explore-panel");
  if (await paths.count() && await paths.getAttribute("open") === null) {
    await paths.locator(":scope > summary").click();
  }
  await page.getByTestId("button-analyze-another-project").click();
  await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
}

function customResponse() {
  return {
    projectSummary: {
      name: "Project Atlas",
      location: "Maricopa County, Arizona",
      description: "High-level research found equipment procurement and lead-time concerns, local electricity-rate questions, noise and operational considerations, jurisdictional moratorium review, and semiconductor and memory supply-chain constraints. Regional grid-load requests are context, not facility proof.",
      capacityMW: 600,
    },
    researchCache: {
      key: "c".repeat(64),
      state: "fresh",
      storedAt: "2026-09-03T12:00:00.000Z",
      refreshStatus: "idle",
      providerAvailable: true,
    },
    researchCoverage: {
      searchTerms: Array.from({ length: 32 }, (_, i) => `Atlas observed query ${i + 1}`),
      searchTermsSource: "tool-observed",
      toolCallCount: 32,
      toolCallLimit: 32,
      toolCallBudgetExceeded: false,
    },
    evidence: evidenceIds.map((id, index) => ({
      id,
      label: id.replaceAll("_", " "),
      value: index === 0 ? 48 : "Not disclosed",
      unit: index === 0 ? "$/MWh" : "Project context",
      classification: index % 2 === 0 ? "Missing Evidence" : "Management Assertion",
      citation: "Public source searched for Project Atlas (2026).",
      ...(index === 0 ? {
        sourceUrl: "https://example.com/atlas/source",
        sourceTitle: "Project Atlas public filing",
        sourcePublisher: "example.com",
        sourcePublishedAt: "2026-06-01",
        sourceAccessedAt: "2026-08-30",
        sourceAccessStatus: "not provided",
        sources: [{
          url: "https://example.com/atlas/source",
          title: "Project Atlas public filing",
          publisher: "example.com",
          publishedAt: "2026-06-01",
          accessedAt: "2026-08-30",
          accessStatus: "open",
          excerpt: "Project Atlas public filing passage.",
           claimPassage: "Project Atlas public filing passage.",
          sourceClass: "primary-government",
          searchDomain: "project-identity",
          relationship: "primary",
          exactProject: true,
          claimSupport: [{ evidenceId: "electricity_cost", value: "48 USD/MWh" }],
          facilityScope: "exact-facility",
          phaseScope: "not-applicable",
          timePeriod: "2026",
        }],
         claimPassage: "Project Atlas public filing passage.",
         facilityScope: "exact-facility",
         phaseScope: "not-applicable",
         claimTimePeriod: "2026",
      } : {}),
      description: "The public record does not establish a facility-level value.",
      sourceRole: "AI-researched public-source review",
      modelReportedConfidence: index === 0 ? 91 : 76,
      ...(index === 0 ? { sourceSupportConfidence: 84 } : {}),
      ...(index === 1 ? { sourceSupportConfidence: 0 } : {}),
      ...(index === 0 ? { numericValue: 48 } : {}),
      ...(id === "site_hazard_exposure" ? { qualitativeValue: "high" } : {}),
      ...(id === "water_source_resilience" ? { qualitativeValue: "single-source" } : {}),
    })),
  };
}

function acceptanceResponse() {
  const response: any = customResponse();
  response.projectSummary.location = "Irving, Dallas County, Texas";
  const configureProposal = (id: string, value: number, unit: string, claim: string) => {
    const item = response.evidence.find((candidate: { id: string }) => candidate.id === id);
    const retrievedPassage = `Project Atlas is located in Irving, Dallas County, Texas. ${claim}`;
    Object.assign(item, {
      value,
      rawValue: value,
      numericValue: value,
      unit,
      rawUnit: unit,
      classification: "Verified Evidence",
      coverageStatus: "supported",
      sourceRelevance: "exact-project",
      sourceSupportConfidence: 96,
      sourceUrl: `https://ercot.com/project-atlas/${id}`,
      sourceTitle: `Project Atlas ${id} filing`,
      sourcePublisher: "ercot.com",
      sourceAccessStatus: "open",
      description: claim,
      citation: `ERCOT Project Atlas filing (2026).`,
      sources: [
        ...(id === "electricity_cost" ? [{
          url: `https://example.com/unmapped/${id}`,
          canonicalUrl: `https://example.com/unmapped/${id}`,
          resolvedUrl: `https://example.com/unmapped/${id}`,
          title: `Unmapped Project Atlas ${id} context`,
          publisher: "example.com",
          accessedAt: "2026-09-10",
          accessStatus: "open",
          excerpt: "This passage is accessible but does not identify Project Atlas or support the displayed electricity claim.",
          sourceClass: "reviewer-submitted",
          searchDomain: "power-grid",
          relationship: "corroborating",
          exactProject: true,
          facilityScope: "exact-project",
          phaseScope: "exact-phase",
          timePeriod: "2026",
          sourceState: "retained",
          accessOutcome: {
            state: "accessible",
            reason: "open",
            format: "html",
            resolvedUrl: `https://example.com/unmapped/${id}`,
            canonicalUrl: `https://example.com/unmapped/${id}`,
            passage: "This passage is accessible but does not identify Project Atlas or support the displayed electricity claim.",
            pageOrSection: "Context",
            extractionLimitations: [],
          },
        }] : []),
        {
        url: `https://ercot.com/project-atlas/${id}`,
        canonicalUrl: `https://ercot.com/project-atlas/${id}`,
        resolvedUrl: `https://ercot.com/project-atlas/${id}`,
        title: `Project Atlas ${id} filing`,
        publisher: "ercot.com",
        accessedAt: "2026-09-10",
        accessStatus: "open",
        excerpt: retrievedPassage,
        claimPassage: claim,
        sourceClass: "primary-government",
        searchDomain: "power-grid",
        relationship: "primary",
        exactProject: true,
        claimSupport: [{ evidenceId: id, value: `${value} ${unit}`, claim }],
        facilityScope: "exact-project",
        phaseScope: "exact-phase",
        timePeriod: "2026",
        sourceState: "retained",
        accessOutcome: {
          state: "accessible",
          reason: "open",
          format: "html",
          resolvedUrl: `https://ercot.com/project-atlas/${id}`,
          canonicalUrl: `https://ercot.com/project-atlas/${id}`,
          passage: retrievedPassage,
          pageOrSection: "Tariff schedule",
          extractionLimitations: [],
        },
        },
      ],
    });
  };
  configureProposal("electricity_cost", 48, "USD/MWh", "The Project Atlas facility electricity cost is 48 USD/MWh.");
  configureProposal("water_escalation", 8, "%", "The Project Atlas facility water cost escalation is 8% annually.");
  configureProposal("cooling_capex", 150, "USD millions", "Project Atlas cooling infrastructure capital cost is 150 USD millions.");
  configureProposal("water_consumption", 23, "Mgal/year", "The Project Atlas facility consumes 23 Mgal/year of cooling water.");
  configureProposal("grid_interconnection", 12, "months", "Project Atlas grid interconnection timeline is 12 months.");
  const related = response.evidence.find((candidate: { id: string }) => candidate.id === "renewable_percentage");
  Object.assign(related, {
    sourceRelevance: "related-context",
    coverageStatus: "partial",
    sourceUrl: "https://example.com/comparable-grid",
    sources: [{
      url: "https://example.com/comparable-grid",
      title: "Comparable Texas grid project",
      publisher: "example.com",
      accessedAt: "2026-09-10",
      accessStatus: "open",
      excerpt: "A different Texas project used a delayed interconnection.",
      claimPassage: "A different Texas project used a delayed interconnection.",
      sourceClass: "secondary",
      searchDomain: "power-grid",
      relationship: "comparable",
      exactProject: false,
      claimSupport: [],
      facilityScope: "related-project",
      phaseScope: "unknown",
      timePeriod: "2026",
    }],
  });
  response.researchCoverage = {
    ...response.researchCoverage,
    searchedDomains: ["ercot.com", "cityofirving.org"],
    failedDomains: [],
    retrievedSourceCount: 5,
    followUpCount: 1,
    followUpLimit: 8,
    physicalOpenBudget: 24,
    physicalOpensUsed: 2,
    physicalOpensRemaining: 22,
    physicalOpenBudgetExceeded: false,
  };
  response.researchAudit = {
    version: 3,
    policyVersion: 3,
    provider: "openai",
    model: "research",
    providerResponseId: "batch-5-acceptance",
    startedAt: "2026-09-10T12:00:00.000Z",
    finishedAt: "2026-09-10T12:00:01.000Z",
    elapsedMs: 1000,
    budget: {
      deadlineMs: 90000,
      maxProviderRequests: 16,
      maxFollowUps: 8,
      maxFollowUpsPerCategory: 1,
      maxCandidatesPerCategory: 10,
      maxTotalCandidates: 80,
      maxToolCalls: 32,
      maxPhysicalDocumentOpens: 24,
    },
    toolCallCount: 2,
    observedToolCallCount: 2,
    acceptedToolCallCount: 2,
    providerRequestCount: 2,
    physicalOpenBudget: 24,
    physicalOpensUsed: 2,
    physicalOpensRemaining: 22,
    physicalOpenBudgetExceeded: false,
    followUpCount: 1,
    followUpLimit: 8,
    followUpLimitPerCategory: 1,
    sourcePriorityApplied: ["Texas primary authorities"],
    categoryGaps: ["backup_power_capacity"],
    providerLimitations: [],
    categories: [{
      categoryId: "power-grid",
      label: "Power and grid",
      evidenceIds: ["electricity_cost", "grid_interconnection"],
      requestedPrimaryQuery: "Project Atlas Texas electricity tariff",
      primaryQueryRole: "authoritative-primary",
      plannedPrimaryQuery: "Project Atlas site:ercot.com tariff",
      issuedPrimaryQuery: "Project Atlas site:ercot.com tariff",
      executedQueries: ["Project Atlas site:ercot.com tariff", "Project Atlas exact project grid filing"],
      providerObservedPrimaryQueries: ["Project Atlas site:ercot.com tariff"],
      optionalFollowUpQuery: "Project Atlas exact project grid filing",
      fallbackQueryRole: "unrestricted-exact-project-fallback",
      plannedFollowUpQuery: "Project Atlas exact project grid filing",
      issuedFollowUpQuery: "Project Atlas exact project grid filing",
      providerObservedFollowUpQueries: ["Project Atlas exact project grid filing"],
      followUpExecutedQuery: "Project Atlas exact project grid filing",
      followUpCount: 1,
      followUpLimit: 1,
      followUpTriggerEvidenceIds: ["grid_interconnection"],
      followUpSkipReason: null,
      authorityTargets: {
        names: ["ERCOT", "City of Irving"],
        domains: ["ercot.com"],
        localAuthorities: [
          { name: "City of Irving", kind: "municipality", domain: "cityofirving.org", establishmentMethod: "directory", status: "established" },
          { name: "Dallas County", kind: "county", domain: null, establishmentMethod: "location", status: "identified-no-domain" },
        ],
        limitations: ["Dallas County was identified, but an official domain was not established."],
      },
      localAuthorities: [
        { name: "City of Irving", kind: "municipality", domain: "cityofirving.org", establishmentMethod: "directory", status: "established" },
        { name: "Dallas County", kind: "county", domain: null, establishmentMethod: "location", status: "identified-no-domain" },
      ],
      authorityLimitations: ["Dallas County was identified, but an official domain was not established."],
      returnedDomains: ["ercot.com", "cityofirving.org"],
      openedDocuments: [
        {
          originalUrl: "https://ercot.com/project-atlas?utm_source=search",
          referringUrls: ["https://ercot.com/project-atlas?utm_source=search"],
          resolvedUrl: "https://ercot.com/project-atlas",
          canonicalUrl: "https://ercot.com/project-atlas",
          opened: true,
          reusedFromCanonicalUrl: null,
          accessState: "accessible",
          accessOutcome: "open",
          retainedPassage: "Project Atlas tariff is 48 dollars per MWh.",
          extractionLimitations: [],
        },
        {
          originalUrl: "https://ercot.com/project-atlas?ref=redirect",
          referringUrls: ["https://ercot.com/project-atlas?ref=redirect"],
          resolvedUrl: "https://ercot.com/project-atlas",
          canonicalUrl: "https://ercot.com/project-atlas",
          opened: false,
          reusedFromCanonicalUrl: "https://ercot.com/project-atlas",
          accessState: "accessible",
          accessOutcome: "reused",
          retainedPassage: "Project Atlas tariff is 48 dollars per MWh.",
          extractionLimitations: [],
        },
      ],
      state: "Partial",
      stageCounts: { normalized: 2, accessed: 2, parsed: 2, claimMapped: 1, eligible: 1, retainedCandidates: 2 },
      rejectionCounts: { "related-context": 1 },
      accessLimitations: [],
      unresolvedGaps: ["grid_interconnection"],
      providerFailure: null,
    }],
  };
  return response;
}

test.describe("custom project research", () => {
  test.beforeEach(async ({ page }) => {
    await blockUnmockedProviderRequests(page);
    await page.route("**/api/research-project", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const request = route.request().postDataJSON() as { name: string; location: string; projectIdentity?: { projectId: string | null; providerId: string | null; name: string; location: string; operator: string | null }; knownData?: { providerId?: string; operator?: string }; focusIds?: string[]; forceRefresh?: boolean };
      const response = customResponse();
      response.projectSummary.name = request.name;
      response.projectSummary.location = request.location;
      response.projectIdentity = request.projectIdentity ?? {
        projectId: null,
        providerId: request.knownData?.providerId ?? null,
        name: request.name,
        location: request.location,
        operator: request.knownData?.operator ?? null,
      };
      const electricity = response.evidence.find((item) => item.id === "electricity_cost")!;
      const electricityPassage = `${request.name} is located in ${request.location}. The facility electricity cost is 48 USD/MWh.`;
      const electricitySource = electricity.sources?.[0] as Record<string, any> | undefined;
      if (electricitySource) {
        Object.assign(electricitySource, {
          excerpt: electricityPassage,
          claimPassage: electricityPassage,
          accessOutcome: {
            state: "accessible",
            reason: "open",
            format: "html",
            passage: electricityPassage,
          },
        });
      }
      Object.assign(electricity, {
        sourceRelevance: "exact-project",
        coverageStatus: "supported",
      });
      electricity.claimPassage = electricityPassage;
      if (request.forceRefresh) {
        response.researchCache.state = "updated";
        electricity.classification = "Verified Evidence";
      }
      if (request.focusIds?.length) {
        const grid = response.evidence.find((item) => item.id === "grid_interconnection")!;
        const gridPassage = `${request.name} is located in ${request.location}. The facility will use behind-the-meter generation.`;
        grid.value = "Behind-the-meter generation";
        grid.classification = "Verified Evidence";
        grid.citation = "A project-specific filing describes the behind-the-meter arrangement.";
        grid.description = "The retrieved filing reports that the project will use behind-the-meter generation.";
        Object.assign(grid, {
          sourceUrl: "https://example.com/atlas/grid-filing",
          sourceTitle: "Project Atlas grid filing",
          sourcePublisher: "example.com",
          sourcePublishedAt: "2026-07-01",
          sourceAccessedAt: "2026-09-03",
          sourceAccessStatus: "open",
          sourceRelevance: "exact-project",
          coverageStatus: "supported",
          sourceSupportConfidence: 94,
          sources: [{
            url: "https://example.com/atlas/grid-filing",
            title: "Project Atlas grid filing",
            publisher: "example.com",
            publishedAt: "2026-07-01",
            accessedAt: "2026-09-03",
            accessStatus: "open",
            excerpt: gridPassage,
            claimPassage: gridPassage,
            accessOutcome: {
              state: "accessible",
              reason: "open",
              format: "html",
              passage: gridPassage,
            },
            sourceClass: "primary-government",
            searchDomain: "power-grid",
            relationship: "primary",
            exactProject: true,
            claimSupport: [{ evidenceId: "grid_interconnection", value: "behind-the-meter generation" }],
            facilityScope: "exact-project",
            phaseScope: "exact-phase",
            timePeriod: "2026",
          }],
            claimPassage: gridPassage,
           facilityScope: "exact-project",
           phaseScope: "exact-phase",
           claimTimePeriod: "2026",
        });
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    });
    await page.route("**/api/analyze-evidence", async (route) => {
      const request = route.request().postDataJSON() as { projectName: string };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          classification: "Verified Evidence",
          reasoning: `The supplied citation was assessed for ${request.projectName}; human acceptance is still required.`,
          downgradeSuggested: false,
        }),
      });
    });
  });

  test("hands off the committed offline fixture without promoting unsupported claims", async ({ page }) => {
    await page.unroute("**/api/research-project");
    let researchRequests = 0;
    await page.route("**/api/research-project", async (route) => {
      researchRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(syntheticResearchFixture),
      });
    });
    for (const endpoint of ["**/api/eia**", "**/api/ercot**", "**/api/directory**", "**/api/compute-atlas**"]) {
      await page.route(endpoint, (route) => route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Provider traffic is blocked by the offline handoff test." }),
      }));
    }
    await page.route(/https:\/\/(api\.openai\.com|generativelanguage\.googleapis\.com)\//, (route) => route.abort("blockedbyclient"));

    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Aster Northstar Campus");
    await page.getByTestId("input-custom-project-location").fill("Cedar County, Iowa");
    await page.getByTestId("button-submit-custom-project").click();

    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("custom-research-banner")).toContainText("Aster Northstar Campus");
    await page.getByTestId("tab-reality").click();
    const findings = page.getByTestId("retained-research-findings");
    await expect(findings).toContainText("Source-supported passage");
    await expect(findings).toContainText("Attributed reporting");
    await expect(findings).toContainText("Ambiguous applicability");
    await expect(findings).toContainText("180 MW");
    await expect(findings).toContainText("24 MW of IT load");
    await expect(findings.getByTestId("retained-research-findings-audit")).toContainText("3 shown of 3 retained findings");
    await expect(findings).toContainText("The Phase One utility interconnection was announced at 180 MW");
    await expect(findings).not.toContainText("Dayton, Ohio");
    await expect(findings).toContainText("Source publication date:");
    await expect(findings).toContainText("Accessed:");

    await expect(page.getByTestId("custom-research-banner")).not.toContainText("operating 480 MW");

    await page.getByTestId("tab-advisor").click();
    const advisor = page.getByTestId("conference-view-advisor");
    await expect(advisor).toContainText("Partial public-source research");
    await expect(advisor.getByTestId("advisor-retained-research")).toContainText("180 MW");
    await expect(advisor).not.toContainText("operating 480 MW");

    await page.getByTestId("tab-transmission").click();
    await page.getByTestId("button-opt-in-scenario").click();
    await expect(page.getByTestId("custom-project-not-modeled")).toContainText("Not modeled");
    expect(researchRequests).toBe(1);
  });

  test("renders retained project evidence in the incomplete custom research flow", async ({ page }) => {
    const response = customResponse() as Record<string, any>;
    response.projectSummary.name = partialReceiptsFixture.project.name;
    response.projectSummary.location = partialReceiptsFixture.project.location;
    response.projectSummary.capacityMW = null;
    response.projectSummary.capacityProvenance = "unknown";
    response.projectIdentity = {
      projectId: null,
      providerId: null,
      name: partialReceiptsFixture.project.name,
      location: partialReceiptsFixture.project.location,
      operator: null,
    };
    response.researchStatus = "partial";
    delete response.researchOutcome;

    const receipt = partialReceiptsFixture.accessibleReceipt;
    const passage = receipt.passage;
    const url = receipt.url;
    const waterRights = response.evidence.find((item: { id: string }) => item.id === "water_rights");
    const waterSource = {
      url,
      originalUrl: url,
      canonicalUrl: url,
      resolvedUrl: url,
      title: receipt.title,
      publisher: new URL(url).hostname,
      sourceClass: "primary-government",
      searchDomain: "water",
      relationship: "primary",
      exactProject: true,
      facilityScope: "unknown",
      phaseScope: "unknown",
      timePeriod: null,
      accessStatus: "open",
      excerpt: passage,
      claimPassage: passage,
      accessOutcome: {
        state: "accessible",
        reason: "open",
        format: "html",
        passage,
        resolvedUrl: url,
        canonicalUrl: url,
        publicationDate: receipt.date,
        publicationDateBasis: "provider-source-metadata",
        publicationDateStatus: "resolved",
        retrievalTime: "2026-09-03T12:00:00.000Z",
      },
    };
    Object.assign(waterRights, {
      value: "Not established",
      unit: "Project evidence",
      classification: "Missing Evidence",
      citation: `A dated water-planning record was retrieved: ${url}`,
      description: "The passage documents water planning, not water rights.",
      sourceUrl: url,
      sourceTitle: waterSource.title,
      sourcePublisher: waterSource.publisher,
      sourcePublishedAt: receipt.date,
      sourceAccessedAt: "2026-09-03T12:00:00.000Z",
      sourceAccessStatus: "open",
      sourceRelevance: "unresolved",
      coverageStatus: "partial",
      sourceSupportConfidence: 0,
      claimPassage: passage,
      sources: [waterSource],
    });
    response.sourceLedger = [waterSource];

    await page.unroute("**/api/research-project");
    await page.route("**/api/research-project", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    }));
    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill(partialReceiptsFixture.project.name);
    await page.getByTestId("input-custom-project-location").fill(partialReceiptsFixture.project.location);
    await page.getByTestId("button-submit-custom-project").click();

    await expect(page.getByTestId("custom-research-banner")).toContainText("Search incomplete");
    await expect(page.getByTestId("custom-research-banner")).not.toContainText("600 MW");
    await page.getByTestId("tab-reality").click();
    const realityFindings = page.getByTestId("retained-research-findings");
    await expect(realityFindings).toContainText(passage);
    await expect(realityFindings).toContainText(receipt.date);
    await expect(realityFindings).toContainText("0 financially eligible");

    await page.getByTestId("tab-advisor").click();
    const advisorFindings = page.getByTestId("advisor-retained-research");
    await expect(advisorFindings).toContainText(passage);
    await expect(advisorFindings).toContainText("Financial eligibility unresolved");

    await page.getByTestId("tab-transmission").click();
    await expect(page.getByTestId("button-opt-in-scenario")).toBeVisible();
  });

  test("launches research from Home, preserves 16 items, and resets to Stargate", async ({ page }) => {
    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Atlas");
    await page.getByTestId("input-custom-project-location").fill("Maricopa County, Arizona");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("conference-view-market")).toBeVisible();
    await expect(page.getByTestId("conference-research-status")).toBeVisible();
    await expect(page.getByTestId("custom-research-banner")).toContainText("Project Atlas");

    await page.getByTestId("tab-reality").click();
    await page.getByTestId("button-detailed-evidence").click();
    await expect(page.getByTestId("text-evidence-count")).toContainText("16 / 16");
    await expect(page.getByTestId("badge-ai-researched-electricity_cost")).toBeVisible();
    const electricityRow = page.getByTestId("row-evidence-electricity_cost");
    const electricitySummary = page.getByTestId("summary-evidence-electricity_cost");
    await expect(electricityRow).not.toHaveAttribute("open", "");
    await expect(electricitySummary).toContainText("$\/MWh");
    await expect(electricitySummary.getByTestId("badge-classification-missing")).toBeVisible();
    await expect(page.getByTestId("model-confidence-electricity_cost")).toContainText("AI confidence: 91%");
    await expect(page.getByTestId("model-confidence-electricity_cost")).toContainText("self-reported, not verified probability");
    await expect(page.getByTestId("support-confidence-electricity_cost")).toContainText("Validated source support: 84%");
    await expect(page.getByTestId("evidence-source-status-electricity_cost")).toHaveText("1 validated source");
    await expect(page.getByTestId("model-confidence-water_consumption")).toContainText("AI confidence: 76%");
    await expect(page.getByTestId("support-confidence-water_consumption")).toContainText("Validated source support: 0%");
    const searchAudit = page.getByTestId("research-search-audit");
    await expect(searchAudit).not.toHaveAttribute("open", "");
    await searchAudit.locator("summary").click();
    await expect(searchAudit).toContainText("Individual query details remain in the restricted research audit.");
    await expect(searchAudit).not.toContainText("Atlas observed query 32");
    await searchAudit.locator("summary").click();
    await expect(page.getByTestId("evidence-source-status-water_consumption")).toHaveText("No validated source");
    await expect(electricitySummary.locator("button, select, input, textarea, a")).toHaveCount(0);
    await expect(page.getByTestId("button-analyze-ai-electricity_cost")).toBeVisible();
    await expect(electricityRow).not.toHaveAttribute("open", "");
    await electricitySummary.focus();
    await page.keyboard.press("Enter");
    await expect(electricityRow).toHaveAttribute("open", "");
    await expect(page.getByTestId("select-classification-electricity_cost")).toBeVisible();
    await expect(page.getByTestId("custom-research-banner")).toBeVisible();
    await expect(page.getByTestId("eia-electricity-evidence")).toHaveCount(0);
    await expect(page.getByTestId("button-analyze-all-ai")).toBeEnabled();
    await expect(page.getByTestId("button-analyze-ai-electricity_cost")).toBeEnabled();
    await expect(page.getByTestId("custom-ai-reassessment-note")).toContainText("human acceptance required");
    await expect(page.getByTestId("link-custom-source-electricity_cost")).toHaveAttribute("href", "https://example.com/atlas/source");
    await expect(page.getByTestId("link-custom-source-electricity_cost")).toHaveAttribute("target", "_blank");
    await expect(page.getByTestId("link-custom-source-electricity_cost")).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.getByTestId("link-custom-source-electricity_cost")).toContainText("Project Atlas public filing");
    await expect(page.getByTestId("custom-source-metadata-electricity_cost")).toContainText("Jun 1, 2026");
    await expect(page.getByTestId("custom-source-metadata-electricity_cost")).toContainText("Aug 30, 2026");
    await expect(page.getByTestId("custom-source-metadata-electricity_cost")).toContainText("not provided");
    await expect(page.getByTestId("custom-source-context-electricity_cost")).toContainText("not facility-level proof");
    await page.getByTestId("summary-evidence-water_consumption").focus();
    await page.keyboard.press(" ");
    await expect(page.getByTestId("row-evidence-water_consumption")).toHaveAttribute("open", "");
    await expect(page.getByTestId("custom-source-missing-water_consumption")).toContainText("No validated direct source link returned");
    await page.getByTestId("summary-evidence-water_consumption").focus();
    await page.keyboard.press(" ");
    await expect(page.getByTestId("row-evidence-water_consumption")).not.toHaveAttribute("open", "");
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), scenariosKey)).toBeNull();
    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("custom-research-banner")).toHaveCount(0);
  });

  test("keeps the Batch 5 handoff concise while exposing governed audit detail on demand", async ({ page }, testInfo) => {
    await page.unroute("**/api/research-project");
    await page.route("**/api/research-project", (route) => {
      const response = acceptanceResponse();
      delete response.researchStatus;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(response),
      });
    });
    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Atlas");
    await page.getByTestId("input-custom-project-location").fill("Irving, Dallas County, Texas");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await page.goto("/#analysis");
    await page.getByTestId("tab-reality").click();
    const evidenceReview = page.getByTestId("button-detailed-evidence");
    if (await evidenceReview.getAttribute("aria-expanded") === "false") await evidenceReview.click();
    await page.getByTestId("filter-evidence-all").click();

    const handoff = page.getByTestId("research-handoff-summary");
    await expect(handoff).toBeVisible();
    await expect(page.getByTestId("research-handoff-status")).toContainText("Final status: Partial results available");
    await expect(handoff.getByTestId("research-telemetry-status")).toContainText("Previously retained research");
    await expect(handoff.getByTestId("research-coverage-summary")).toContainText("2 of 24 source opens used; 22 remaining");
    await expect(page.getByTestId("research-handoff-details")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("research-search-audit")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("research-handoff-proposals")).toContainText("5");
    await expect(page.getByTestId("research-handoff-proposals")).toContainText("5 pending · 0 accepted · 0 overridden · 0 rejected · 0 unresolved");
    await expect(page.getByTestId("research-handoff-exact-project")).toContainText("5");
    await expect(page.getByTestId("research-handoff-context")).toContainText("2 related/comparable context");

    await page.getByTestId("research-handoff-details").click();
    await expect(handoff).toContainText("Retained passages: 2 across 1 reviewed source records");
    await expect(handoff).toContainText("2 of 24 source opens used; 22 remaining");
    await expect(handoff).toContainText("A blocked, failed, or unrun category is incomplete");
    await expect(handoff).not.toContainText("official domains established");

    const audit = page.getByTestId("research-search-audit");
    await audit.locator(":scope > summary").click();
    const category = page.getByTestId("public-research-category-power-grid");
    await expect(category).toContainText("Partial results available");
    await expect(category).toContainText("Retained passages: 2");
    await expect(audit).toContainText("Individual query details remain in the restricted research audit");
    await expect(audit).not.toContainText("Project Atlas site:ercot.com tariff");
    await expect(audit).not.toContainText("Returned domains:");

    if (testInfo.project.name.includes("mobile")) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const summary = page.getByTestId("summary-evidence-electricity_cost");
      await summary.focus();
      await expect(summary).toBeFocused();
      await page.getByTestId("row-evidence-electricity_cost").evaluate((element) => {
        (element as HTMLDetailsElement).open = true;
      });
      await expect(page.getByTestId("row-evidence-electricity_cost")).toHaveAttribute("open", "");
      await page.getByTestId("button-override-source-proposal-electricity_cost").click();
      await expect(page.getByTestId("input-source-proposal-override-value-electricity_cost")).toBeFocused();
    }
  });

  test("persists every proposal disposition and keeps invalid or context-only findings out of model evidence", async ({ page }) => {
    await page.unroute("**/api/research-project");
    await page.route("**/api/research-project", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(acceptanceResponse()),
    }));
    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Atlas");
    await page.getByTestId("input-custom-project-location").fill("Irving, Dallas County, Texas");
    await page.getByTestId("button-submit-custom-project").click();
    await page.goto("/#evidence");

    const openRow = async (id: string) => {
      await page.getByTestId(`row-evidence-${id}`).evaluate((element) => {
        (element as HTMLDetailsElement).open = true;
      });
    };

    await openRow("electricity_cost");
    await page.getByTestId("button-accept-source-proposal-electricity_cost").click();
    await expect(page.getByTestId("proposal-disposition-electricity_cost")).toHaveText("accepted");

    await openRow("water_escalation");
    await page.getByTestId("button-override-source-proposal-water_escalation").click();
    await page.getByTestId("input-source-proposal-override-value-water_escalation").fill("9");
    await page.getByTestId("textarea-source-proposal-override-rationale-water_escalation").fill("The retained tariff passage supports the replacement.");
    await page.getByTestId("button-submit-source-proposal-override-water_escalation").click();
    await expect(page.getByTestId("proposal-disposition-water_escalation")).toHaveText("overridden");

    await openRow("cooling_capex");
    await page.getByTestId("button-override-source-proposal-cooling_capex").click();
    await page.getByTestId("input-source-proposal-override-value-cooling_capex").fill("not-a-number");
    await page.getByTestId("textarea-source-proposal-override-rationale-cooling_capex").fill("Invalid numeric replacement.");
    await page.getByTestId("button-submit-source-proposal-override-cooling_capex").click();
    await expect(page.getByText("The override failed source or semantic validation; no model input was changed.")).toBeVisible();
    await expect(page.getByTestId("proposal-disposition-cooling_capex")).toHaveText("pending");

    await openRow("water_consumption");
    await page.getByTestId("button-unresolve-source-proposal-water_consumption").click();
    await expect(page.getByTestId("proposal-disposition-water_consumption")).toHaveText("unresolved");

    await openRow("grid_interconnection");
    await page.getByTestId("button-reject-source-proposal-grid_interconnection").click();
    await expect(page.getByTestId("proposal-disposition-grid_interconnection")).toHaveText("rejected");

    await page.reload();
    const persisted = await page.evaluate(() => JSON.parse(window.localStorage.getItem("safeloc:diligence:current-session:v1") ?? "{}"));
    expect(persisted.customResearch.researchProposalDispositions).toMatchObject({
      electricity_cost: "accepted",
      water_escalation: "overridden",
      cooling_capex: "pending",
      water_consumption: "unresolved",
      grid_interconnection: "rejected",
    });
    expect(persisted.customResearch.modelEvidence.electricity_cost.acceptedForModel).toBe(true);
    expect(persisted.customResearch.modelEvidence.water_escalation.acceptedForModel).toBe(true);
    expect(persisted.customResearch.modelEvidence.water_escalation.value).toBe(9);
    expect(persisted.customResearch.modelEvidence.cooling_capex.acceptedForModel).toBe(false);
    expect(persisted.customResearch.modelEvidence.water_consumption.acceptedForModel).toBe(false);
    expect(persisted.customResearch.modelEvidence.grid_interconnection.acceptedForModel).toBe(false);
    expect(persisted.customResearch.modelEvidence.renewable_percentage.acceptedForModel).toBe(false);
    await page.goto("/#evidence");
    await expect(page.getByTestId("research-handoff-proposals")).toContainText("1 pending · 1 accepted · 1 overridden · 1 rejected · 1 unresolved");
    await expect(page.getByTestId("button-accept-source-proposal-renewable_percentage")).toHaveCount(0);
    await expect(page.getByTestId("button-override-source-proposal-renewable_percentage")).toHaveCount(0);
  });

  test("keeps reviewer source corrections behind the disclosure", async ({ page }) => {
    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Atlas");
    await page.getByTestId("input-custom-project-location").fill("Maricopa County, Arizona");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await page.goto("/#evidence");

    const row = page.getByTestId("row-evidence-electricity_cost");
    await expect(row).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("button-correct-source-electricity_cost")).toBeHidden();
    await page.getByTestId("summary-evidence-electricity_cost").click();
    await page.getByTestId("button-correct-source-electricity_cost").click();
    await page.getByTestId("input-correction-url-electricity_cost").fill("https://example.com/atlas/reviewer-filing");
    await page.getByTestId("input-correction-claim-electricity_cost").fill("A reviewer filing supports the revised electricity cost.");
    await page.getByTestId("input-correction-value-electricity_cost").fill("46");
    await page.getByTestId("button-propose-correction-electricity_cost").click();
    await expect(page.getByTestId("correction-proposal-electricity_cost").getByTestId("badge-classification-verified")).toBeVisible();
    await page.getByTestId("button-accept-correction-electricity_cost").click();
    await expect(page.getByTestId("model-confidence-electricity_cost")).toContainText("self-reported, not verified probability");
    await expect(page.getByTestId("support-confidence-electricity_cost")).toContainText("84%");
    await expect(page.getByTestId("evidence-source-status-electricity_cost")).toHaveText(/validated source|No validated source/);
    await expect(page.getByTestId("link-custom-source-electricity_cost")).toBeVisible();
  });

  test("lets a reviewer force a provider refresh and exposes the resulting cache state", async ({ page }) => {
    await page.goto("/#home");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Atlas");
    await page.getByTestId("input-custom-project-location").fill("Maricopa County, Arizona");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await page.goto("/#evidence");

    const requestPromise = page.waitForRequest((request) =>
      request.url().includes("/api/research-project") &&
      request.method() === "POST" &&
      request.postDataJSON()?.forceRefresh === true,
    );
    await page.getByTestId("button-force-refresh-research").click();
    const refreshRequest = await requestPromise;
    expect(refreshRequest.postDataJSON().forceRefresh).toBe(true);
    await expect(page.getByTestId("source-research-cache-status")).toContainText("Research updated now");
    await expect(page.getByTestId("source-research-summary")).toContainText("new source-backed proposal");
  });

  test("keeps semantically incompatible research leads out of proposal review and model evidence", async ({ page }) => {
    const assessmentRequests: Array<{
      projectName: string;
      projectLocation: string;
      projectKind: string;
      name: string;
    }> = [];
    const researchRequests: Array<{
      name: string;
      location: string;
      projectIdentity?: {
        projectId: string | null;
        providerId: string | null;
        name: string;
        location: string;
        operator: string | null;
      };
      knownData?: { capacity?: number; operator?: string; status?: string; sourceUrl?: string };
    }> = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/api/analyze-evidence")) {
        assessmentRequests.push(request.postDataJSON());
      }
      if (new URL(request.url()).pathname.endsWith("/api/research-project")) {
        researchRequests.push(request.postDataJSON());
      }
    });
    await page.route("**/api/directory?**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceMetadata: {
          provider: "Compute Atlas",
          attributionUrl: "https://compute-atlas.com",
          status: "embedded",
          dataOrigin: "embedded",
          snapshotVersion: "test-snapshot",
        },
        facilities: [{
          id: "qts-irving-1",
          name: "QTS Irving 1",
          operator: "QTS Data Centers",
          city: "Irving",
          county: "Dallas",
          state: "TX",
          capacityMW: 165,
          availableCapacityMW: 165,
          status: "operating",
          confidence: "reported",
          aiClassification: null,
          sourceUrl: "https://compute-atlas.com/facilities/qts-irving-1",
          connectedCompanies: [],
          connectedFunds: [],
          lastUpdated: null,
        }],
        totalFacilities: 1,
        offset: 0,
        limit: 24,
        hasMore: false,
      }),
    }));

    await page.goto("/#directory");
    await expect(page.getByTestId("compute-atlas-record-qts-irving-1")).toBeVisible();
    await page.getByTestId("compute-atlas-open-qts-irving-1").click();
    await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
    await expect(page.getByTestId("input-custom-project-name")).toHaveValue("QTS Irving 1");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("conference-summary")).toContainText("QTS Irving 1");
    const activeContext = page.getByTestId("project-context-binding");
    await expect(activeContext).toHaveAttribute("data-project-id", "qts-irving-1");
    await expect(activeContext).toHaveAttribute("data-classification", "arbitrary");
    await expect(activeContext).toHaveAttribute("data-lifecycle", "researching");
    await expect(activeContext).toContainText("Selected via: Directory selection");
    await expect(activeContext).toHaveAttribute("data-research-run-id", /^.+$/);
    await expect(page.getByTestId("custom-research-banner")).toContainText("Search incomplete");
    await expect(page.getByTestId("canonical-dossier-select")).toHaveCount(0);
    expect(researchRequests).toHaveLength(1);
    expect(researchRequests[0]).toEqual({
      name: "QTS Irving 1",
      location: "Irving, Dallas County, Texas",
      projectIdentity: {
        projectId: "qts-irving-1",
        providerId: "qts-irving-1",
        name: "QTS Irving 1",
        location: "Irving, Dallas County, Texas",
        operator: "QTS Data Centers",
      },
      knownData: {
        capacity: 165,
        operator: "QTS Data Centers",
        status: "Operating",
        sourceUrl: "https://compute-atlas.com/facilities/qts-irving-1",
        providerId: "qts-irving-1",
        city: "Irving",
        county: "Dallas",
        state: "TX",
      },
    });
    await page.getByTestId("tab-market").click();
    await expect(page.getByTestId("conference-research-status")).toContainText("Research Incomplete");
    await expect(page.getByTestId("custom-project-operator")).toHaveText("Operator: QTS Data Centers");
    await expect(page.getByTestId("custom-project-id")).toHaveText("Project ID: qts-irving-1");
    await expect(page.getByTestId("custom-project-provider-id")).toHaveText("Provider ID: qts-irving-1");
    const restoredSession = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("safeloc:diligence:current-session:v1") ?? "{}"),
    );
    expect(restoredSession.customResearch.project.projectIdentity).toEqual({
      projectId: "qts-irving-1",
      providerId: "qts-irving-1",
      name: "QTS Irving 1",
      location: "Irving, Dallas County, Texas",
      operator: "QTS Data Centers",
    });
    await page.reload();
    await page.getByTestId("tab-market").click();
    await expect(page.getByTestId("custom-project-id")).toHaveText("Project ID: qts-irving-1");

    await page.goto("/#evidence");
    await expect(page.getByTestId("button-analyze-all-ai")).toHaveText("Research Missing Sources");
    await page.getByTestId("button-analyze-all-ai").click();
    await expect.poll(() => researchRequests.length).toBe(2);
    await expect(page.getByTestId("button-analyze-all-ai")).toBeEnabled();
    expect(assessmentRequests).toHaveLength(0);
    expect(researchRequests[1].focusIds).toContain("grid_interconnection");
    expect(researchRequests[1].focusIds).toContain("water_consumption");
    expect(researchRequests[1].projectIdentity).toEqual({
      projectId: "qts-irving-1",
      providerId: "qts-irving-1",
      name: "QTS Irving 1",
      location: "Irving, Dallas County, Texas",
      operator: "QTS Data Centers",
    });
    await expect(page.getByTestId("source-research-status")).toContainText("no new project-specific source passed validation");
    await expect(page.getByTestId("source-research-summary")).toHaveCount(0);
    await expect(page.getByTestId("button-accept-source-proposal-grid_interconnection")).toHaveCount(0);
    await expect(page.getByTestId("button-override-source-proposal-grid_interconnection")).toHaveCount(0);
    const persisted = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("safeloc:diligence:current-session:v1") ?? "{}"),
    );
    expect(persisted.customResearch.modelEvidence.grid_interconnection.acceptedForModel).toBe(false);
    expect(persisted.customResearch.researchProposalDispositions.grid_interconnection).toBeUndefined();
  });

  test("labels the standardized capacity fallback when research returns no usable capacity", async ({ page }) => {
    await page.unroute("**/api/research-project");
    await page.route("**/api/research-project", async (route) => {
      const request = route.request().postDataJSON() as { name: string; location: string; projectIdentity?: { projectId: string | null; providerId: string | null; name: string; location: string; operator: string | null } };
      const response = customResponse();
      response.projectSummary.name = request.name;
      response.projectSummary.location = request.location;
      response.projectIdentity = request.projectIdentity ?? {
        projectId: null,
        providerId: null,
        name: request.name,
        location: request.location,
        operator: null,
      };
      response.projectSummary.capacityMW = 0;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    });

    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Fallback");
    await page.getByTestId("input-custom-project-location").fill("Texas");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("conference-summary")).toContainText("Project Fallback");
    await expect(page.getByTestId("conference-research-status")).toBeVisible();
  });

  test("shows preserved and downgraded AI findings with partial source coverage", async ({ page }) => {
    await page.unroute("**/api/research-project");
    await page.route("**/api/research-project", async (route) => {
      const result = customResponse();
      const power = result.evidence.find((item) => item.id === "electricity_cost")!;
      power.classification = "Management Assertion";
      power.value = 48;
      power.citation = "AI classification downgraded: cited source not in retrieved search results. Original classification: Verified Evidence.";
      Object.assign(power, { coverageStatus: "partial" });
      delete power.sourceUrl;
      const grid = result.evidence.find((item) => item.id === "grid_interconnection")!;
      grid.classification = "Model Inference";
      grid.value = "Behind-the-meter arrangement reported";
      grid.citation = "AI-cited source not in retrieved search results; Model Inference retained pending reviewer verification.";
      Object.assign(grid, { coverageStatus: "partial" });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
    });

    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Kilby");
    await page.getByTestId("input-custom-project-location").fill("Reeves County, Texas");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await page.goto("/#evidence");

    await page.getByTestId("summary-evidence-electricity_cost").click();
    await expect(page.getByTestId("select-classification-electricity_cost")).toHaveValue("Missing Evidence");
    await expect(page.getByTestId("coverage-status-electricity_cost")).toHaveText("partial");
    await expect(page.getByTestId("row-evidence-electricity_cost")).toContainText("AI classification downgraded");
    await page.getByTestId("summary-evidence-grid_interconnection").click();
    await expect(page.getByTestId("select-classification-grid_interconnection")).toHaveValue("Missing Evidence");
    await expect(page.getByTestId("coverage-status-grid_interconnection")).toHaveText("partial");
  });

  test("keeps provider timeout state visible after immediate handoff", async ({ page }) => {
    let calls = 0;
    await page.unroute("**/api/research-project");
    await page.route("**/api/research-project", async (route) => {
      calls += 1;
      await route.fulfill({
        status: 504,
        contentType: "application/json",
        body: JSON.stringify({ error: "Project research timed out." }),
      });
    });

    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Timeout");
    await page.getByTestId("input-custom-project-location").fill("Cook County, Illinois");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("custom-research-banner")).toContainText("Research failed safely");
    await expect(page.getByTestId("custom-research-retry")).toBeVisible();
    expect(calls).toBe(1);
    await page.getByTestId("custom-research-retry").click();
    await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
    await page.getByTestId("button-close-custom-project").click();
    await expect(page.getByTestId("custom-project-dialog")).not.toBeVisible();
    await page.goto("/#evidence");
    await expect(page.getByTestId("text-evidence-count")).toContainText("16 / 16");
    await expect(page.locator('[data-testid^="select-classification-"]')).toHaveCount(16);
    await expect(page.locator('[data-testid^="select-classification-"]').first()).toHaveValue("Missing Evidence");
  });

  test("records a research handoff with safe project dimensions", async ({ page }) => {
    await page.addInitScript(() => {
      window.umami = {
        track(name, data) {
          const analyticsWindow = window as typeof window & {
            __safelocAnalytics?: Array<{ name: string; data?: Record<string, string | number | boolean> }>;
          };
          analyticsWindow.__safelocAnalytics = [
            ...(analyticsWindow.__safelocAnalytics ?? []),
            { name, data },
          ];
        },
      };
    });

    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Atlas");
    await page.getByTestId("input-custom-project-location").fill("Maricopa County, Arizona");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);

    const events = await expect.poll(() => page.evaluate(() => {
      const analyticsWindow = window as typeof window & {
        __safelocAnalytics?: Array<{ name: string; data?: Record<string, string | number | boolean> }>;
      };
      return analyticsWindow.__safelocAnalytics ?? [];
    })).toEqual([
      {
        name: "research_handoff_completed",
        data: {
          company: "none",
          project_id: "custom_project",
          project_kind: "custom",
          research_mode: "ai_researched",
          destination: "analysis",
        },
      },
    ]);
  });

  test("keeps the scope disclosure closed by default on the curated case", async ({ page }) => {
    await page.goto("/#analysis");
    await expect(page.getByTestId("conference-view-market")).toBeVisible();
    await expect(page.getByTestId("custom-research-banner")).toHaveCount(0);
  });

  test("keeps a no-origin Research Incomplete project unmodeled when capacity is unknown", async ({ page }) => {
    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Atlas");
    await page.getByTestId("input-custom-project-location").fill("Maricopa County, Arizona");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);

    const market = page.getByTestId("conference-view-market");
    await expect(market).toBeVisible();
    await expect(page.getByTestId("conference-research-status")).toHaveText("Research Incomplete");
    await expect(market).toContainText("No company selected");
    await expect(market).not.toContainText(/NVIDIA|GPU demand|hyperscaler CAPEX/i);
    await expect(page.getByTestId("market-exposure-chain")).toHaveCount(0);
    await expect(page.getByTestId("live-current-irr")).toHaveCount(0);
    await expect(page.getByTestId("metric-project-irr")).toHaveCount(0);
    await expect(page.getByTestId("metric-moic")).toHaveCount(0);
    await page.getByTestId("tab-transmission").click();
    await expect(page.getByTestId("button-opt-in-scenario")).toBeVisible();

    await page.getByTestId("button-opt-in-scenario").click();
    await expect(page.getByTestId("conference-view-transmission")).toBeVisible();
    const notModeled = page.getByTestId("custom-project-not-modeled");
    await expect(notModeled).toBeVisible();
    await expect(notModeled).toContainText(
      "Custom research remains not modeled until a qualified capacity claim is accepted or illustrative capacity is entered.",
    );
    await expect(page.getByTestId("financial-transmission-model")).toHaveCount(0);

    const captured = await page.evaluate(async () => {
      const capture = (window as Window & {
        __safelocCaptureReturnDiscrepancyState?: () => Promise<{
          project: { capacityMW: number | null };
          modelInputs: { assumptions: { capacityMW: number | null } };
          financialScenarios: { scenarios: Record<string, unknown> };
        }>;
      }).__safelocCaptureReturnDiscrepancyState;
      if (!capture) throw new Error("Return discrepancy capture hook is unavailable.");
      return capture();
    });
    expect(captured.project.capacityMW).toBeNull();
    expect(captured.modelInputs.assumptions.capacityMW).toBeNull();
    expect(captured.financialScenarios.scenarios).toEqual({
      "synthetic-verified": null,
      "synthetic-current": null,
      "eia-verified": null,
      "eia-current": null,
    });
  });

  test("ignores an older project result when a newer research request finishes first", async ({ page }) => {
    type RequestIdentity = {
      projectId: string | null;
      providerId: string | null;
      name: string;
      location: string;
      operator: string | null;
    };
    type ResearchRequest = { name: string; location: string; projectIdentity: RequestIdentity };
    const heldResponses = new Map<string, {
      request: ResearchRequest;
      reply: (response: Record<string, any>) => void;
    }>();
    await page.unroute("**/api/research-project");
    await page.route("**/api/research-project", async (route) => {
      const request = route.request().postDataJSON() as ResearchRequest;
      let reply!: (response: Record<string, any>) => void;
      const responseReady = new Promise<Record<string, any>>((resolve) => { reply = resolve; });
      heldResponses.set(request.name, { request, reply });
      const response = await responseReady;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(response),
      });
    });

    const completeResearch = (name: string) => {
      const held = heldResponses.get(name);
      if (!held) throw new Error(`No held research request for ${name}.`);
      const response = customResponse() as Record<string, any>;
      response.projectSummary.name = held.request.name;
      response.projectSummary.location = held.request.location;
      response.projectIdentity = held.request.projectIdentity;
      held.reply(response);
    };
    const firstProject = "Northstar East";
    const secondProject = "QTS Irving 1";
    const firstLocation = "Phoenix, Arizona";
    const secondLocation = "Irving, Dallas County, Texas";

    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill(firstProject);
    await page.getByTestId("input-custom-project-location").fill(firstLocation);
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page.getByTestId("custom-research-banner")).toContainText("Researching");
    await expect.poll(() => heldResponses.size).toBe(1);

    await page.goto("/#home");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill(secondProject);
    await page.getByTestId("input-custom-project-location").fill(secondLocation);
    await page.getByTestId("button-submit-custom-project").click();
    await expect.poll(() => heldResponses.size).toBe(2);

    expect(heldResponses.get(firstProject)?.request.projectIdentity).toEqual({
      projectId: null,
      providerId: null,
      name: firstProject,
      location: firstLocation,
      operator: null,
    });
    completeResearch(secondProject);
    await expect(page.getByTestId("conference-summary")).toContainText(secondProject);

    const firstResponseFinished = page.waitForEvent("requestfinished", (request) =>
      new URL(request.url()).pathname.endsWith("/api/research-project")
      && request.postDataJSON().name === firstProject);
    completeResearch(firstProject);
    await firstResponseFinished;
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await expect(page.getByTestId("conference-summary")).toContainText(secondProject);
    await expect(page.getByTestId("conference-summary")).not.toContainText(firstProject);
    const restoredSession = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("safeloc:diligence:current-session:v1") ?? "{}"),
    );
    expect(restoredSession.customResearch.project.projectIdentity.name).toBe(secondProject);
  });
});
