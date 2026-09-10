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
    await page.route("**/api/research-project", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      if (!route.request().isNavigationRequest()) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(incompleteResearch("GW Ranch", "Pecos County, Texas")),
        }).catch(() => undefined);
      }
    });
    await page.goto("/#directory");
    await page.getByTestId("compute-atlas-open-gw-ranch-pecos-tx").click();
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page.getByTestId("custom-project-loading")).toBeVisible();
    await expect(page.getByTestId("custom-project-cancel")).toBeVisible();
    await page.getByTestId("custom-project-cancel").dispatchEvent("click");
    await expect(page.getByTestId("custom-project-loading")).not.toBeVisible();
    await page.goto("/#home");
    await expect(page.getByTestId("custom-project-dialog")).not.toBeVisible();
  });

  test("offers all timeout recovery choices after the bounded retry", async ({ page }) => {
    await page.route("**/api/research-project", (route) => route.fulfill({
      status: 504,
      contentType: "application/json",
      body: JSON.stringify({ error: "Project research timed out." }),
    }));
    await page.goto("/#directory");
    await page.getByTestId("compute-atlas-open-gw-ranch-pecos-tx").click();
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page.getByTestId("custom-project-error")).toBeVisible();
    await expect(page.getByTestId("custom-project-retry")).toBeVisible();
    await expect(page.getByTestId("custom-project-edit")).toBeVisible();
    await expect(page.getByTestId("custom-project-fallback")).toBeVisible();
    await expect(page.getByTestId("custom-project-return-curated")).toBeVisible();
    await page.getByTestId("button-close-custom-project").click();
    await expect(page.getByTestId("custom-project-dialog")).not.toBeVisible();
  });

  test("shows recovery within 46 seconds when the production research client never resolves", async ({ page }) => {
    test.setTimeout(55_000);
    await page.route("**/api/research-project", () => {
      // Intentionally unresolved: the browser UI wall clock must surface recovery.
    });

    await page.goto("/#directory");
    await page.getByTestId("compute-atlas-open-gw-ranch-pecos-tx").click();
    const startedAt = Date.now();
    await page.getByTestId("button-submit-custom-project").click();
    await expect(page.getByTestId("custom-project-loading")).toContainText("Searching public sources, up to 45 seconds.");
    await expect(page.getByText("Project research timed out after 45 seconds.")).toBeVisible({ timeout: 46_000 });
    const elapsedMs = Date.now() - startedAt;
    console.log(`Measured browser wall-clock timeout: ${elapsedMs}ms`);
    expect(elapsedMs).toBeGreaterThanOrEqual(44_500);
    expect(elapsedMs).toBeLessThanOrEqual(47_000);
    await expect(page.getByTestId("custom-project-retry")).toBeVisible();
    await expect(page.getByTestId("custom-project-edit")).toBeVisible();
    await expect(page.getByTestId("custom-project-fallback")).toBeVisible();
    await expect(page.getByTestId("custom-project-return-curated")).toBeVisible();
  });
});
