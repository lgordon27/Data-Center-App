import { expect, test } from "@playwright/test";

const evidenceIds = [
  "electricity_cost", "water_consumption", "grid_interconnection", "water_escalation",
  "community_risk", "renewable_percentage", "cooling_capex", "electricity_escalation",
  "carbon_compliance", "permitting_timeline", "customer_concentration", "water_rights",
  "site_hazard_exposure", "backup_power_capacity", "water_source_resilience", "downtime_cost",
];

const directoryResponse = {
  sourceMetadata: {
    provider: "Compute Atlas",
    attributionUrl: "https://compute-atlas.com",
    status: "embedded",
    dataOrigin: "embedded",
    snapshotVersion: "batch-1-test",
  },
  facilities: [{
    id: "gw-ranch-pecos-tx",
    name: "GW Ranch",
    operator: "GW Ranch Compute",
    city: "",
    county: "Pecos",
    state: "TX",
    capacityMW: 800,
    availableCapacityMW: 800,
    status: "planned",
    confidence: "reported",
    aiClassification: "ai_training",
    sourceUrl: "https://compute-atlas.com/facilities/gw-ranch-pecos-tx",
    connectedCompanies: [],
    connectedFunds: [],
    lastUpdated: null,
  }],
};

const placeholderDirectoryResponse = {
  ...directoryResponse,
  facilities: [{ ...directoryResponse.facilities[0], city: "Undisclosed" }],
};

function incompleteResearch(name: string, location: string) {
  return {
    projectSummary: { name, location, description: "Bounded public-source review.", capacityMW: 800 },
    evidence: evidenceIds.map((id) => ({
      id,
      label: id,
      value: "Not established",
      unit: "Context",
      classification: "Missing Evidence",
      citation: "No project-specific source established.",
      description: "Unsupported category remains unresolved.",
      sourceRole: "AI-researched",
    })),
  };
}

test.describe("Batch 1 custom-project research lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/directory**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(directoryResponse),
    }));
  });

  test("prefills GW Ranch exactly and sends directory context without claiming evidence", async ({ page }) => {
    await page.unroute("**/api/directory**");
    await page.route("**/api/directory**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(placeholderDirectoryResponse),
    }));
    let requestBody: Record<string, unknown> | null = null;
    await page.route("**/api/research-project", async (route) => {
      requestBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(incompleteResearch("GW Ranch", "Pecos County, Texas")),
      });
    });

    await page.goto("/#directory");
    await page.getByTestId("compute-atlas-open-gw-ranch-pecos-tx").click();
    await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
    await expect(page.getByTestId("input-custom-project-name")).toHaveValue("GW Ranch");
    await expect(page.getByTestId("input-custom-project-location")).toHaveValue("Pecos County, Texas");

    await page.getByTestId("button-submit-custom-project").click();
    await expect.poll(() => requestBody).toMatchObject({
      name: "GW Ranch",
      location: "Pecos County, Texas",
      knownData: {
        capacity: 800,
        operator: "GW Ranch Compute",
        status: "Planned",
        providerId: "gw-ranch-pecos-tx",
      },
    });
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("conference-research-status")).toContainText("Research Incomplete");
    await expect(page.getByTestId("conference-summary")).toContainText("No company selected");
  });

  test("cancels and closes pending research, and route changes dismiss the modal", async ({ page }) => {
    let releaseRequest = () => {};
    const requestReleased = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    let markRequestStarted = () => {};
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });
    let markRequestFinished = () => {};
    const requestFinished = new Promise<void>((resolve) => {
      markRequestFinished = resolve;
    });
    await page.route("**/api/research-project", async (route) => {
      markRequestStarted();
      await requestReleased;
      try {
        if (!route.request().isNavigationRequest()) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(incompleteResearch("GW Ranch", "Pecos County, Texas")),
          });
        }
      } catch {
        // The browser may abort the request as part of the tested cancellation flow.
      } finally {
        markRequestFinished();
      }
    });
    await page.goto("/#directory");
    await page.getByTestId("compute-atlas-open-gw-ranch-pecos-tx").click();
    await page.getByTestId("button-submit-custom-project").click();
    await requestStarted;
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("custom-research-banner")).toContainText("RESEARCH IN PROGRESS");
    await page.getByTestId("custom-research-cancel").click();
    await expect(page.getByTestId("custom-research-banner")).toContainText("RESEARCH CANCELLED");
    releaseRequest();
    await requestFinished;
    await page.goto("/#home");
    await expect(page.getByTestId("custom-project-dialog")).not.toBeVisible();
  });

  test("keeps a timeout visible after handoff and offers same-project retry", async ({ page }) => {
    await page.route("**/api/research-project", (route) => route.fulfill({
      status: 504,
      contentType: "application/json",
      body: JSON.stringify({ error: "Project research timed out." }),
    }));
    await page.goto("/#directory");
    await page.getByTestId("compute-atlas-open-gw-ranch-pecos-tx").click();
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("custom-research-banner")).toContainText("RESEARCH TIMED OUT");
    await expect(page.getByTestId("custom-research-retry")).toBeVisible();
    await page.getByTestId("custom-research-retry").click();
    await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
    await page.getByTestId("button-close-custom-project").click();
    await expect(page.getByTestId("custom-project-dialog")).not.toBeVisible();
  });

  test("does not turn the former 45-second browser limit into a terminal timeout", async ({ page }) => {
    await page.route("**/api/research-project", () => {
      // Intentionally unresolved: only explicit cancellation may end this request.
    });

    await page.goto("/#directory");
    await page.getByTestId("compute-atlas-open-gw-ranch-pecos-tx").click();
    await page.clock.install();
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("custom-research-banner")).toContainText("RESEARCH IN PROGRESS");
    await page.clock.fastForward(45_000);
    await expect(page.getByTestId("custom-research-banner")).toContainText("RESEARCH IN PROGRESS");
    await page.getByTestId("custom-research-cancel").click();
    await expect(page.getByTestId("custom-research-banner")).toContainText("RESEARCH CANCELLED");
  });
});
