import { expect, test, type Page } from "@playwright/test";

const agentKey = "safeloc:diligence:agent-run:v1";
const lineageKey = "safeloc:diligence:financial-lineage:v1";
const scenariosKey = "safeloc:diligence:scenarios:v1";
const sessionKey = "safeloc:diligence:current-session:v1";

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

async function openAgent(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/#analysis");
  await expect(page.getByRole("tablist", { name: "Analysis views" }).getByRole("tab")).toHaveCount(4);
  await page.getByTestId("tab-market").click();
  await page.getByTestId("button-run-diligence-agent").click();
  await expect(page.getByTestId("agent-run-status")).toContainText("Review prepared", { timeout: 5_000 });
}

async function clickIfPresent(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  if (await locator.count()) await locator.click();
}

function recalculationCount(page: Page) {
  return page.evaluate(
    (key) => (JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{ action: string }>).filter((event) => event.action === "financial-recalculation").length,
    lineageKey,
  );
}

function eligibleResearchResponse() {
  return {
    projectSummary: {
      name: "Project Atlas",
      location: "Maricopa County, Arizona",
      description: "High-level research found a project-specific grid filing and open questions on the remaining variables.",
      capacityMW: 600,
    },
    researchCache: {
      key: "d".repeat(64),
      state: "fresh",
      storedAt: "2026-09-03T12:00:00.000Z",
      refreshStatus: "idle",
      providerAvailable: true,
    },
    researchCoverage: {
      searchTerms: Array.from({ length: 8 }, (_, i) => `Atlas observed query ${i + 1}`),
      searchTermsSource: "tool-observed",
      toolCallCount: 8,
      toolCallLimit: 32,
      toolCallBudgetExceeded: false,
    },
    evidence: evidenceIds.map((id) => id === "grid_interconnection" ? {
      id,
      label: "Grid interconnection",
      value: 14,
      numericValue: 14,
      unit: "months",
      classification: "Verified Evidence",
      citation: "Project Atlas grid filing, page 2 (2026).",
      description: "The facility project tariff filing reports 14 months to energized interconnection.",
      sourceRole: "AI-researched public-source review",
      sourceUrl: "https://example.com/atlas/grid-filing",
      sourceTitle: "Project Atlas grid filing",
      sourcePublisher: "example.com",
      sourcePublishedAt: "2026-07-01",
      sourceAccessedAt: "2026-09-03",
      sourceAccessStatus: "open",
      coverageStatus: "supported",
      sourceSupportConfidence: 94,
      sourceRelevance: "exact-project",
      claimPassage: "The filing reports 14 months to energized interconnection.",
      facilityScope: "exact-project",
      phaseScope: "exact-phase",
      claimTimePeriod: "2026",
      claimMappings: [{
        sourceId: "https://example.com/atlas/grid-filing",
        claimText: "14 months to energized interconnection",
        exactQuotation: "The filing reports 14 months to energized interconnection.",
        supportStatus: "supported",
      }],
      sources: [{
        url: "https://example.com/atlas/grid-filing",
        title: "Project Atlas grid filing",
        publisher: "example.com",
        publishedAt: "2026-07-01",
        accessedAt: "2026-09-03",
        accessStatus: "open",
        excerpt: "The filing reports 14 months to energized interconnection.",
        claimPassage: "The filing reports 14 months to energized interconnection.",
        sourceClass: "primary-government",
        searchDomain: "power-grid",
        relationship: "primary",
        exactProject: true,
        claimSupport: [{ evidenceId: "grid_interconnection", value: "14 months" }],
        facilityScope: "exact-project",
        phaseScope: "exact-phase",
        timePeriod: "2026",
      }],
    } : {
      id,
      label: id.replaceAll("_", " "),
      value: "Not disclosed",
      unit: "Project context",
      classification: "Missing Evidence",
      citation: "Public source searched for Project Atlas (2026).",
      description: "The public record does not establish a facility-level value.",
      sourceRole: "AI-researched public-source review",
    }),
  };
}

test.describe("Batch 4 analyst proposal lineage", () => {
  test("separates actionable changes, gaps, and context with reconciled counters and no recalculation", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Decision lifecycle runs once on desktop.");
    await openAgent(page);
    const recalculationsBefore = await recalculationCount(page);
    await expect(page.getByTestId("agent-review-package")).toContainText("Reject and Leave unresolved preserve the model");

    // The summary counters reconcile with the header and report only retained evidence.
    await expect(page.getByTestId("agent-summary-new-sources")).toHaveText("0");
    await expect(page.getByTestId("agent-retrieved-source-count")).toContainText("New sources this run: 0");
    const eligible = Number(await page.getByTestId("agent-summary-eligible-sources").textContent());
    await expect(page.getByTestId("agent-validated-source-count")).toContainText(`Eligible validated records: ${eligible}`);
    expect(Number(await page.getByTestId("agent-summary-retained-sources").textContent())).toBeGreaterThan(0);
    expect(eligible).toBe(0);

    // Findings arrive in three labeled groups; nothing curated is actionable.
    await expect(page.getByTestId("agent-group-actionable")).toContainText("No actionable changes");
    await expect(page.getByTestId("agent-group-gap")).toBeVisible();
    await expect(page.getByTestId("agent-group-context")).toBeVisible();

    // The curated grid record is related context: no supporting-source claim, no Accept/Override.
    await clickIfPresent(page, "agent-view-all-context");
    await expect(page.getByTestId("agent-related-context-agent-finding-grid")).toContainText("does not support");
    await expect(page.getByTestId("agent-group-context")).not.toContainText("Supporting source (eligible");
    await expect(page.getByTestId("agent-decision-agent-finding-grid-accepted")).toHaveCount(0);
    await expect(page.getByTestId("agent-decision-agent-finding-grid-overridden")).toHaveCount(0);

    await page.getByTestId("agent-decision-agent-finding-grid-rejected").click();
    await expect(page.getByTestId("agent-finding-agent-finding-grid")).toContainText("Rejected");
    await expect(page.getByTestId("agent-disposition-confirmation")).toBeFocused();
    expect(await recalculationCount(page)).toBe(recalculationsBefore);

    await clickIfPresent(page, "agent-view-all-gap");
    await page.getByTestId("agent-decision-agent-finding-community-unresolved").click();
    await expect(page.getByTestId("agent-finding-agent-finding-community")).toContainText("Unresolved");
    await expect(page.getByTestId("agent-disposition-confirmation")).toBeFocused();
    expect(await recalculationCount(page)).toBe(recalculationsBefore);
  });

  test("curated review keeps bulk accept disabled and exposes bulk reject for non-conflicting items", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Bulk control assertions run once on desktop.");
    await openAgent(page);
    await expect(page.getByTestId("agent-bulk-accept")).toBeVisible();
    await expect(page.getByTestId("agent-bulk-accept")).toBeDisabled();
    await expect(page.getByTestId("agent-bulk-reject")).toBeVisible();
    await expect(page.getByTestId("agent-bulk-reject")).toBeEnabled();

    await page.getByTestId("agent-bulk-reject").click();
    await expect(page.getByTestId("agent-disposition-confirmation")).toBeFocused();
    await expect(page.getByTestId("agent-disposition-confirmation")).toContainText("Bulk reject");
    expect(await recalculationCount(page)).toBe(0);
  });

  test("eligible exact-project evidence yields an actionable change with accept, reversal, and append-only lineage", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Actionable lineage runs once on desktop.");
    await page.route("**/api/research-project", async (route) => {
      const request = route.request().postDataJSON() as { name: string; location: string };
      const response = eligibleResearchResponse();
      response.projectSummary.name = request.name;
      response.projectSummary.location = request.location;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    });
    await page.route("**/api/analyze-evidence", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ classification: "Verified Evidence", reasoning: "Assessed citation; human acceptance required." }),
      });
    });

    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const paths = page.getByTestId("home-explore-panel");
    if (await paths.count() && await paths.getAttribute("open") === null) {
      await paths.locator(":scope > summary").click();
    }
    await page.getByTestId("button-analyze-another-project").click();
    await page.getByTestId("input-custom-project-name").fill("Project Atlas");
    await page.getByTestId("input-custom-project-location").fill("Maricopa County, Arizona");
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);

    await page.getByTestId("tab-market").click();
    await page.getByTestId("button-run-diligence-agent").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review prepared", { timeout: 5_000 });

    // Only the eligible, exact-project, passage-mapped record is actionable.
    await expect(page.getByTestId("agent-summary-new-sources")).toHaveText("0");
    await expect(page.getByTestId("agent-summary-eligible-sources")).toHaveText("1");
    await expect(page.getByTestId("agent-summary-mapped-variables")).toHaveText("1");
    const gridCard = page.getByTestId("agent-finding-agent-finding-grid");
    await expect(gridCard).toBeVisible();
    await expect(gridCard).toContainText("Supporting source (eligible, exact-project)");
    await expect(page.getByTestId("agent-decision-agent-finding-grid-accepted")).toBeVisible();

    const recalculationsBefore = await recalculationCount(page);
    await page.getByTestId("agent-decision-agent-finding-grid-accepted").click();
    await expect(page.getByTestId("agent-disposition-confirmation")).toBeFocused();
    await expect(page.getByTestId("agent-disposition-confirmation")).toContainText("Accept recorded");
    await expect(gridCard).toContainText("Accepted");
    await expect(page.getByTestId("agent-audit-timeline")).toContainText("Accepted");
    expect(await recalculationCount(page)).toBe(recalculationsBefore + 1);

    await page.getByTestId("financial-lineage-history").locator(":scope > summary").click();
    await expect(page.getByTestId("financial-lineage-history")).toContainText("analyst");
    const historyBefore = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]").length, lineageKey);

    // After a refresh the accepted record matches the accepted state: it leaves the
    // actionable group, proposes nothing further, and still keeps its reversal control.
    await page.getByTestId("button-run-diligence-agent").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review prepared", { timeout: 5_000 });
    await expect(page.getByTestId("agent-group-actionable")).toContainText("No actionable changes");
    await clickIfPresent(page, "agent-view-all-context");
    const contextRow = page.getByTestId("agent-finding-agent-finding-grid");
    await expect(contextRow).toBeVisible();
    await expect(contextRow).toContainText("matches the accepted state");
    await expect(page.getByTestId("agent-accept-agent-finding-grid")).toHaveCount(0);
    await expect(page.getByTestId("agent-override-agent-finding-grid")).toHaveCount(0);

    await page.getByTestId("agent-reverse-agent-finding-grid").click();
    await expect(page.getByTestId("agent-disposition-confirmation")).toBeFocused();
    await expect(page.getByTestId("agent-disposition-confirmation")).toContainText("Reversed");
    await expect(page.getByTestId("agent-audit-timeline")).toContainText("Reversed");
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]").length, lineageKey)).toBeGreaterThan(historyBefore);
    expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").classifications?.grid_interconnection ?? "Missing Evidence", sessionKey)).toBe("Missing Evidence");
  });

  test("refreshes deliberate stale paths, scopes scenario lineage, and reset clears the run", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "State transition assertions run once on desktop.");
    await openAgent(page);
    await page.getByTestId("tab-reality").click();
    const evidence = page.getByRole("button", { name: /Detailed Evidence Record/i });
    if (await evidence.getAttribute("aria-expanded") === "false") await evidence.click();
    await page.getByTestId("filter-evidence-all").click();
    const select = page.getByTestId("select-classification-grid_interconnection");
    await select.selectOption("Management Assertion");
    await page.getByTestId("tab-market").click();
    await expect(page.getByTestId("agent-stale-warning")).toBeVisible();
    await expect(page.getByTestId("agent-bulk-accept")).toBeDisabled();
    const staleApply = page.locator("[data-testid^='agent-apply-stale-']").first();
    if (await staleApply.count()) {
      await staleApply.click();
      await expect(page.getByTestId("agent-audit-timeline")).toContainText("Accepted");
    }
    await page.getByTestId("button-run-diligence-agent").click();
    await expect(page.getByTestId("agent-stale-warning")).not.toBeVisible();
    const run = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), agentKey);
    expect(run.projectKey).toBeTruthy();
    expect(run.evidenceSnapshotKey).toBeTruthy();
    await page.getByTestId("tab-transmission").click();
    await page.getByTestId("rail-save-scenario").click();
    await page.getByTestId("input-scenario-name").fill("Batch 4 reproducible case");
    await page.getByTestId("button-confirm-save-scenario").click();
    const scenario = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios[0], scenariosKey);
    expect(scenario.reproducibility).toMatchObject({
      inputFingerprint: expect.any(String),
      modelIdentity: expect.any(String),
      releaseIdentity: expect.any(String),
    });
    // Scenario lineage is scoped to events that belong to this project.
    const activityEventIds = scenario.reproducibility?.activityEventIds as string[] | undefined;
    expect(Array.isArray(activityEventIds)).toBe(true);
    const lineageEvents = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{ id: string; projectKey: string }>, lineageKey);
    const lineageIds = new Set(lineageEvents.map((event) => event.id));
    for (const eventId of activityEventIds ?? []) {
      expect(lineageIds.has(eventId)).toBe(true);
    }
    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Not prepared");
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), agentKey)).toBeNull();
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios.length, scenariosKey)).toBe(1);
  });

  test("keeps the four-tab workbench usable on mobile without overflow", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 390, "Mobile behavior is covered in the mobile project.");
    await page.goto("/#analysis");
    await expect(page.getByRole("tablist", { name: "Analysis views" }).getByRole("tab")).toHaveCount(4);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByTestId("tab-market").click();
    await expect(page.getByTestId("button-run-diligence-agent")).toBeVisible();
    await page.getByTestId("button-run-diligence-agent").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("button-run-diligence-agent")).toBeInViewport();
    await expect(page.getByTestId("button-run-diligence-agent")).toContainText("Prepare Review");
  });
});
