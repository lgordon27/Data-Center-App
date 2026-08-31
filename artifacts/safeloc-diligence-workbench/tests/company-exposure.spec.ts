import { expect, test } from "@playwright/test";

const directoryResponse = {
  sourceMetadata: {
    provider: "Compute Atlas",
    attributionUrl: "https://compute-atlas.com",
    status: "embedded",
    dataOrigin: "embedded",
    snapshotVersion: "test-snapshot",
  },
  facilities: [
    {
      id: "project-rainier-microsoft-wi",
      name: "Project Rainier",
      operator: "Microsoft",
      city: "Mount Pleasant",
      county: "Racine",
      state: "WI",
      capacityMW: 315,
      availableCapacityMW: 315,
      status: "construction",
      confidence: "reported",
      aiClassification: "ai_training",
      sourceUrl: "https://compute-atlas.com/facilities/project-rainier-microsoft-wi",
      connectedCompanies: ["Microsoft"],
      connectedFunds: ["QQQ", "XLK"],
      lastUpdated: null,
    },
  ],
};

test.describe("stock-first company exposure flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/directory**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(directoryResponse) }));
  });

  test("does not fetch Compute Atlas while Home and holdings context render", async ({ page }) => {
    const directoryRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/directory")) directoryRequests.push(request.url());
    });
    await page.goto("/#home");
    await expect(page.getByTestId("home-stock-picker")).toBeVisible();
    await page.getByTestId("company-card-microsoft").click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    expect(directoryRequests).toHaveLength(0);
    await page.goto("/#directory");
    await expect(page.getByTestId("compute-atlas-page")).toBeVisible();
    await expect.poll(() => directoryRequests.length).toBeGreaterThan(0);
  });

  test("shows all six companies, drill-down summaries, and curated handoff context", async ({ page }) => {
    await page.goto("/#home");
    await expect(page.getByTestId("home-stock-picker")).toBeVisible();
    await expect(page.locator("[data-testid^='company-card-']")).toHaveCount(6);
    await page.getByTestId("company-card-microsoft").click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    await expect(page.getByTestId("company-fund-context")).toContainText("iShares ESG Advanced MSCI USA ETF");
    await expect(page.getByTestId("company-project-list")).toContainText("Project Kilby");
    await expect(page.getByTestId("company-project-list")).toContainText("Project Rainier");
    await expect(page.getByTestId("company-summary-tier1")).toContainText("1");
    await expect(page.getByTestId("company-summary-tier2")).toContainText("1");
    await page.getByTestId("company-project-open-project-kilby").click();
    await expect(page).toHaveURL(/#brief$/);
    await expect(page.getByTestId("workbench-breadcrumb")).toContainText("Microsoft → Project Kilby → Case Brief");
    await page.goto("/#advisor");
    await expect(page.getByTestId("advisor-originating-company")).toContainText("Microsoft");
    await expect(page.getByTestId("text-advisor-summary")).toContainText("values-aligned funds");
  });

  test("keeps the directory on its secondary route and clears company context on reset", async ({ page }) => {
    await page.goto("/#directory");
    await expect(page.getByTestId("compute-atlas-page")).toBeVisible();
    await expect(page.getByTestId("compute-atlas-search")).toBeVisible();
    await page.goto("/#home");
    await page.getByTestId("company-card-oracle").click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    await page.getByTestId("button-analyze-stargate").click();
    await expect(page).toHaveURL(/#brief$/);
    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await page.goto("/#advisor");
    await expect(page.getByTestId("advisor-originating-company")).toContainText("No company selected");
  });
});