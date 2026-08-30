import { expect, test } from "@playwright/test";

const workbenchRoutes = ["brief", "evidence", "materiality", "decision", "advisor"] as const;
const nonWorkbenchRoutes = ["home", "value-chain", "how-it-works"] as const;

test("shows the expandable four-source bar only on workbench routes", async ({ page }) => {
  for (const route of workbenchRoutes) {
    await page.goto(`/#${route}`);
    await expect(page.getByTestId("data-sources")).toBeVisible();
    await expect(page.locator("[data-testid^='data-source-']:not([data-testid^='data-source-status-'])")).toHaveCount(4);
  }

  await page.goto("/#brief");
  await expect(page.getByTestId("data-source-status-fema-nri")).toHaveText("Embedded");
  await expect(page.getByTestId("data-source-status-ercot-queue")).toHaveText("Embedded");
  await expect(page.getByTestId("data-source-status-eia")).toHaveText("Embedded");
  await expect(page.getByTestId("data-source-status-gridtracker-mcp")).toHaveText("Disconnected");
  await page.getByTestId("data-sources-toggle").click();
  await expect(page.getByTestId("data-sources-details")).toBeVisible();
  await expect(page.getByTestId("source-detail-fema-nri")).toContainText("v1.20");
  await expect(page.getByTestId("data-sources-fallback")).toHaveText(
    "All external feeds automatically fall back to cached values during an unavailable live demonstration.",
  );

  for (const route of nonWorkbenchRoutes) {
    await page.goto(`/#${route}`);
    await expect(page.getByTestId("data-sources")).toHaveCount(0);
  }
});

test("keeps evidence freshness separate from classification and model mechanics", async ({ page }) => {
  await page.goto("/#evidence");
  await expect(page.getByTestId("evidence-origin-electricity_cost")).toHaveText("Embedded");
  await expect(page.getByTestId("evidence-origin-grid_interconnection")).toHaveText("Embedded");
  await expect(page.getByTestId("evidence-source-status-site_hazard_exposure")).toHaveText("Embedded");
  await expect(page.getByTestId("evidence-origin-water_consumption")).toHaveText("Embedded");

  await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
  await expect(page.getByTestId("evidence-origin-electricity_cost")).toHaveText("Embedded");

  await page.goto("/#materiality");
  await expect(page.getByTestId("model-electricity-attribution")).toContainText(
    "Electricity cost: $60.9/MWh (embedded estimate)",
  );
});

test("documents all four source integrations and the fallback rule in How It Works", async ({ page }) => {
  await page.goto("/#how-it-works");
  const register = page.getByTestId("tour-data-sources");
  await expect(register.getByRole("heading", { name: "Data Sources" })).toBeVisible();
  await expect(register).toContainText("ERCOTQueue.com");
  await expect(register).toContainText("U.S. EIA Open Data");
  await expect(register).toContainText("FEMA National Risk Index v1.20");
  await expect(register).toContainText("GridTracker MCP");
  await expect(register).toContainText(
    "All external feeds automatically fall back to cached values during an unavailable live demonstration.",
  );
});