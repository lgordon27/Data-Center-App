import { expect, test } from "@playwright/test";

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

test.describe("custom project research", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/research-project", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const request = route.request().postDataJSON() as { name: string; location: string; focusIds?: string[]; forceRefresh?: boolean };
      const response = customResponse();
      response.projectSummary.name = request.name;
      response.projectSummary.location = request.location;
      if (request.forceRefresh) response.researchCache.state = "updated";
      if (request.focusIds?.length) {
        const grid = response.evidence.find((item) => item.id === "grid_interconnection")!;
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
          coverageStatus: "supported",
          sourceSupportConfidence: 94,
          sources: [{
            url: "https://example.com/atlas/grid-filing",
            title: "Project Atlas grid filing",
            publisher: "example.com",
            publishedAt: "2026-07-01",
            accessedAt: "2026-09-03",
            accessStatus: "open",
            excerpt: "Project Atlas uses behind-the-meter generation.",
             claimPassage: "Project Atlas uses behind-the-meter generation.",
            sourceClass: "primary-government",
            searchDomain: "power-grid",
            relationship: "primary",
            exactProject: true,
            claimSupport: [{ evidenceId: "grid_interconnection", value: "behind-the-meter generation" }],
            facilityScope: "exact-project",
            phaseScope: "exact-phase",
            timePeriod: "2026",
          }],
           claimPassage: "Project Atlas uses behind-the-meter generation.",
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
        }),
      });
    });
  });

  test("launches research from Home, preserves 16 items, and resets to Stargate", async ({ page }) => {
    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Atlas");
    await page.getByTestId("input-custom-project-location").fill("Maricopa County, Arizona");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("custom-project-status")).toContainText("AI-researched");
    await expect(page.getByTestId("custom-project-description")).toContainText("equipment procurement");
    await expect(page.getByTestId("custom-project-capacity")).toHaveText("600 MW");
    await expect(page.getByTestId("custom-project-capacity-note")).toContainText("AI-reported capacity used");
    await expect(page.getByTestId("custom-research-cache-status")).toContainText("Fresh cached research");
    await expect(page.getByTestId("custom-project-summary")).not.toContainText("Research scale");
    await expect(page.locator('[data-testid="custom-project-description"]')).toHaveCount(1);
    await expect(page.getByTestId("custom-research-banner")).toContainText("Financial outputs remain synthetic");

    const scope = page.getByTestId("disclosure-scope-limitations");
    await expect(scope).not.toHaveAttribute("open", "");
    await scope.locator("summary").click();
    await expect(scope).toHaveAttribute("open", "");
    await expect(page.getByTestId("scope-limitations-content")).toContainText("Semiconductor and memory supply constraints");

    await page.goto("/#evidence");
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
    await expect(searchAudit).toContainText("Atlas observed query 32");
    await searchAudit.locator("summary").click();
    await expect(page.getByTestId("evidence-source-status-water_consumption")).toHaveText("No validated source");
    await expect(electricitySummary.locator("button, select, input, textarea, a")).toHaveCount(0);
    const collapsedClassification = page.getByTestId("select-classification-electricity_cost");
    await expect(collapsedClassification).toBeVisible();
    await expect(page.getByTestId("button-analyze-ai-electricity_cost")).toBeVisible();
    await collapsedClassification.selectOption("Management Assertion");
    await expect(collapsedClassification).toHaveValue("Management Assertion");
    await expect(page.getByTestId("review-marker-electricity_cost")).toBeVisible();
    await expect(electricityRow).not.toHaveAttribute("open", "");
    await collapsedClassification.selectOption("Missing Evidence");
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

    for (const route of ["materiality", "decision", "advisor"]) {
      await page.goto(`/#${route}`);
      await expect(page.getByTestId("custom-research-banner")).toContainText("Project Atlas");
      await expect(page.locator("main")).not.toContainText("Stargate Abilene");
    }

    await page.getByTestId("button-open-material-gap-customer_concentration").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("row-evidence-customer_concentration")).toHaveAttribute("open", "");

    await page.goto("/#decision");
    await expect(page.getByTestId("custom-scenario-disabled")).toContainText("not saved to browser storage");
    await expect(page.getByTestId("button-save-scenario")).toBeDisabled();
    await expect(page.getByTestId("button-compare-scenarios")).toBeDisabled();
    await expect(page.getByTestId("panel-saved-scenarios")).toHaveCount(0);
    await expect(page.getByTestId("status-recommendation")).toHaveText("BLOCKED");
    await expect(page.getByTestId("material-gap-row-customer_concentration")).toBeVisible();
    await expect(page.getByTestId("material-gap-row-water_source_resilience")).toBeVisible();
    await expect(page.locator('[data-testid^="material-gap-row-"]')).toHaveCount(2);
    await expect(page.getByTestId("material-gap-row-grid_interconnection")).toHaveCount(0);
    await expect(page.getByTestId("material-gap-row-community_risk")).toHaveCount(0);
    await expect(page.getByTestId("material-gap-row-electricity_cost")).toHaveCount(0);
    await expect(page.getByTestId("material-gap-row-water_consumption")).toHaveCount(0);

    await page.goto("/#home");
    await expect(page.getByTestId("home-preview-project-name")).toHaveText("Project Atlas");
    await expect(page.getByTestId("home-preview-relationship")).toHaveText("No linked holding selected");
    await expect(page.getByTestId("home-stargate-preview")).toContainText("Maricopa County, Arizona");
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), scenariosKey)).toBeNull();

    await page.goto("/#analysis");
    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByRole("heading", { name: /return is only as durable/i })).toBeVisible();
    await expect(page.getByTestId("custom-research-banner")).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), scenariosKey)).toBeNull();
    await page.reload();
    await expect(page.getByTestId("custom-research-banner")).toHaveCount(0);
    await expect(page).toHaveURL(/#brief$/);
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
    await expect(page.getByTestId("model-confidence-electricity_cost")).toContainText("not reported");
    await expect(page.getByTestId("support-confidence-electricity_cost")).toContainText("0%");
    await expect(page.getByTestId("evidence-source-status-electricity_cost")).toHaveText("No validated source");
    await expect(page.getByTestId("link-custom-source-electricity_cost")).toHaveAttribute("href", "https://example.com/atlas/reviewer-filing");
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

  test("researches unresolved inputs and stages a source-backed proposal for human acceptance", async ({ page }) => {
    const assessmentRequests: Array<{
      projectName: string;
      projectLocation: string;
      projectKind: string;
      name: string;
    }> = [];
    const researchRequests: Array<{
      name: string;
      location: string;
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
    await expect(page).toHaveURL(/#brief$/);
    await expect(page.getByTestId("custom-project-status")).toContainText("AI-researched");
    await expect(page.getByTestId("custom-project-summary")).toContainText("QTS Irving 1");
    expect(researchRequests).toHaveLength(1);
    expect(researchRequests[0]).toEqual({
      name: "QTS Irving 1",
      location: "Irving · Dallas County · TX",
      knownData: {
        capacity: 165,
        operator: "QTS Data Centers",
        status: "Operating",
        sourceUrl: "https://compute-atlas.com/facilities/qts-irving-1",
      },
    });

    await page.goto("/#evidence");
    await expect(page.getByTestId("button-analyze-all-ai")).toHaveText("Research Missing Sources");
    await page.getByTestId("button-analyze-all-ai").click();
    await expect.poll(() => researchRequests.length).toBe(2);
    await expect(page.getByTestId("button-analyze-all-ai")).toBeEnabled();
    expect(assessmentRequests).toHaveLength(0);
    expect(researchRequests[1].focusIds).toContain("grid_interconnection");
    expect(researchRequests[1].focusIds).toContain("water_consumption");
    await expect(page.getByTestId("source-research-summary")).toContainText("new source-backed proposal");
    await expect(page.getByTestId("row-evidence-grid_interconnection")).toHaveAttribute("open", "");
    await expect(page.getByTestId("source-research-proposal-grid_interconnection")).toContainText("Behind-the-meter generation");
    await expect(page.getByTestId("proposal-model-confidence-grid_interconnection")).toContainText("self-reported, not verified probability");
    await expect(page.getByTestId("proposal-support-confidence-grid_interconnection")).toContainText("Validated source support");
    await expect(page.getByTestId("select-classification-grid_interconnection")).toHaveValue("Missing Evidence");
    await page.getByTestId("button-accept-source-proposal-grid_interconnection").click();
    await expect(page.getByTestId("model-confidence-grid_interconnection")).toContainText("76%");
    await expect(page.getByTestId("select-classification-grid_interconnection")).toHaveValue("Verified Evidence");
    await expect(page.getByTestId("link-custom-source-grid_interconnection")).toHaveAttribute("href", "https://example.com/atlas/grid-filing");
    await expect(page.getByTestId("ai-decision-history")).toContainText("Accepted by human");
    await expect(page.getByTestId("ai-decision-history")).toContainText("grid interconnection");
  });

  test("labels the standardized capacity fallback when research returns no usable capacity", async ({ page }) => {
    await page.unroute("**/api/research-project");
    await page.route("**/api/research-project", async (route) => {
      const request = route.request().postDataJSON() as { name: string; location: string };
      const response = customResponse();
      response.projectSummary.name = request.name;
      response.projectSummary.location = request.location;
      response.projectSummary.capacityMW = 0;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    });

    await page.goto("/");
    await openCustomProjectDialog(page);
    await page.getByTestId("input-custom-project-name").fill("Project Fallback");
    await page.getByTestId("input-custom-project-location").fill("Texas");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("custom-project-capacity")).toHaveText("1,200 MW");
    await expect(page.getByTestId("custom-project-capacity-note")).toContainText("standardized 1,200 MW default used");
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
    await expect(page.getByTestId("select-classification-electricity_cost")).toHaveValue("Management Assertion");
    await expect(page.getByTestId("coverage-status-electricity_cost")).toHaveText("partial");
    await expect(page.getByTestId("row-evidence-electricity_cost")).toContainText("AI classification downgraded");
    await page.getByTestId("summary-evidence-grid_interconnection").click();
    await expect(page.getByTestId("select-classification-grid_interconnection")).toHaveValue("Model Inference");
    await expect(page.getByTestId("coverage-status-grid_interconnection")).toHaveText("partial");
  });

  test("offers a clearly labeled default-assumptions case after the timeout retry fails", async ({ page }) => {
    let calls = 0;
    await page.unroute("**/api/research-project");
    await page.route("**/api/research-project", async (route) => {
      calls += 1;
      if (calls === 2) await new Promise((resolve) => setTimeout(resolve, 250));
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
    await expect(page.getByTestId("custom-project-loading")).toContainText("retrying");
    await expect(page.getByTestId("custom-project-fallback")).toBeVisible();
    expect(calls).toBe(2);
    await page.getByTestId("custom-project-fallback").click();

    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("custom-project-status")).toContainText("Default assumptions");
    await expect(page.getByTestId("custom-research-banner")).toContainText("All modeled evidence remains Missing Evidence");
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

    const events = await page.evaluate(() => {
      const analyticsWindow = window as typeof window & {
        __safelocAnalytics?: Array<{ name: string; data?: Record<string, string | number | boolean> }>;
      };
      return analyticsWindow.__safelocAnalytics ?? [];
    });
    expect(events).toEqual([
      {
        name: "research_handoff_completed",
        data: {
          company: "none",
          project_id: "custom_project",
          project_kind: "custom",
          research_mode: "ai_researched",
          destination: "case_brief",
        },
      },
    ]);
  });

  test("keeps the scope disclosure closed by default on the curated case", async ({ page }) => {
    await page.goto("/#brief");
    const scope = page.getByTestId("disclosure-scope-limitations");
    await expect(scope).not.toHaveAttribute("open", "");
    await expect(scope.getByTestId("scope-limitations-content")).toBeHidden();
  });

  test("contains a no-origin Research Incomplete project until scenario analysis is explicitly requested", async ({ page }) => {
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
    await expect(page.getByTestId("banner-mechanical-disclaimer")).toContainText(
      /scenario mechanics|synthetic/i,
    );
    await expect(page.getByTestId("metric-project-irr")).toBeVisible();
  });
});
