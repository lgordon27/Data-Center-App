import { expect, test } from "@playwright/test";

const workbenchRoutes = ["brief", "evidence", "materiality", "decision", "advisor"] as const;
const nonWorkbenchRoutes = ["home", "value-chain", "how-it-works"] as const;

test("shows the expandable three-source bar only on workbench routes", async ({ page }) => {
  for (const route of workbenchRoutes) {
    await page.goto(`/#${route}`);
    await expect(page.getByTestId("data-sources")).toBeVisible();
    await expect(page.locator("[data-testid^='data-source-']:not([data-testid^='data-source-status-'])")).toHaveCount(3);
  }

  await page.goto("/#brief");
  await expect(page.getByTestId("data-source-status-fema-nri")).toHaveText("Embedded");
  await expect(page.getByTestId("data-source-status-ercot-queue")).toContainText(/Live|Cached|Embedded/);
  await expect(page.getByTestId("data-source-status-eia")).toHaveText("Embedded");
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

test("shows truthful ERCOT aggregates, named-record guard, and developer diagnostics", async ({ page }) => {
  await page.goto("/#brief");
  await expect(page.getByTestId("ercot-queue-statistics")).toBeVisible();
  await expect(page.getByTestId("ercot-total-queue-gw")).toContainText("GW");
  await expect(page.getByTestId("ercot-data-center-count")).toHaveText("Not published");
  await expect(page.getByTestId("ercot-source-attribution")).toContainText("Source: ERCOTQueue.com");

  await page.goto("/#evidence");
  await expect(page.getByTestId("ercot-grid-evidence")).toBeVisible();
  const matchCount = await page.getByTestId("ercot-matching-record").count();
  if (matchCount === 0) {
      await expect(page.getByTestId("ercot-no-named-match")).toContainText("No named Stargate, Oracle, or Crusoe");
    await expect(page.getByTestId("button-suggest-verified-grid")).toHaveCount(0);
  }

  await page.getByTestId("ercot-console-toggle").click();
  await expect(page.getByTestId("ercot-developer-console")).toBeVisible();
  await expect(page.getByTestId("ercot-developer-console")).toContainText("/api/ercot-queue");
  await page.getByTestId("ercot-console-raw-toggle").click();
  await expect(page.getByTestId("ercot-console-raw-json")).toContainText('"request"');
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

test("documents the three source integrations and the fallback rule in How It Works", async ({ page }) => {
  await page.goto("/#how-it-works");
  await page.getByTestId("tour-disclosure-sources").locator("summary").click();
  const register = page.getByTestId("tour-data-sources");
  await expect(register.getByRole("heading", { name: "Data Sources" })).toBeVisible();
  await expect(register).toContainText("ERCOTQueue.com");
  await expect(register).toContainText("U.S. Energy Information Administration (EIA)");
  await expect(register).toContainText("FEMA National Risk Index");
  await expect(register).toContainText(
    "All external feeds automatically fall back to cached values during an unavailable live demonstration.",
  );
});