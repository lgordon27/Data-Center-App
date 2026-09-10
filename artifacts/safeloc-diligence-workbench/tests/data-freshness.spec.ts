import { expect, test, type Page } from "@playwright/test";

const workbenchRoutes = ["analysis"] as const;
const nonWorkbenchRoutes = ["home", "value-chain", "how-it-works"] as const;
const eiaEndpoint = "**/api/eia/electricity";
const liveEiaResponse = {
  status: "live",
  fetchedAt: "2026-09-10T12:00:00.000Z",
  sourceUpdatedAt: "2026-06-01T00:00:00.000Z",
  data: {
    priceHistory: [{ period: "2026-05", pricePerMwh: 55 }],
    latestPrice: 55,
    latestPricePeriod: "2026-05",
    generationHistory: [{
      period: "2026-05",
      generationMwh: { naturalGas: 1, wind: 1, solar: 1, nuclear: 1, coal: 1, other: 1 },
      totalMwh: 6,
      shares: { naturalGas: 1 / 6, wind: 1 / 6, solar: 1 / 6, nuclear: 1 / 6, coal: 1 / 6, other: 1 / 6 },
    }],
    consumptionHistory: [{ period: "2026-05", consumptionMwh: 6 }],
  },
};

async function openAnalysisView(page: Page, view: "market" | "reality" | "transmission") {
  await page.goto("/#analysis");
  await page.getByTestId(`tab-${view}`).click();
}

test("shows the expandable three-source bar only on workbench routes", async ({ page }) => {
  await page.route(eiaEndpoint, (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ diagnostics: { error: "deterministic embedded fallback" } }),
  }));

  for (const route of workbenchRoutes) {
    await page.goto(`/#${route}`);
    await expect(page.getByTestId("data-sources")).toBeVisible();
    await expect(page.locator("[data-testid^='data-source-']:not([data-testid^='data-source-status-'])")).toHaveCount(3);
  }

  await page.goto("/#analysis");
  await expect(page.getByTestId("data-source-status-fema-nri")).toHaveText("Embedded");
  await expect(page.getByTestId("data-source-status-ercot-queue")).toContainText(/Live|Cached|Embedded/);
  await expect(page.getByTestId("data-source-status-eia")).toHaveText("Embedded");
  await page.getByTestId("data-sources-toggle").click();
  await expect(page.getByTestId("data-sources-details")).toBeVisible();
  await expect(page.getByTestId("source-detail-fema-nri")).toContainText("v1.20");
  await expect(page.getByTestId("data-sources-fallback")).toHaveText(
    "All external feeds automatically fall back to cached values during an unavailable live demonstration.",
  );

  await page.unroute(eiaEndpoint);
  await page.route(eiaEndpoint, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(liveEiaResponse),
  }));
  await page.reload();
  await expect(page.getByTestId("data-source-status-eia")).toHaveText("Live · Jun 1, 2026");

  for (const route of nonWorkbenchRoutes) {
    await page.goto(`/#${route}`);
    await expect(page.getByTestId("data-sources")).toHaveCount(0);
  }
});

test("shows truthful ERCOT aggregates, named-record guard, and developer diagnostics", async ({ page }) => {
  await page.goto("/#value-chain");
  await page.getByTestId("value-chain-supporting-context").locator("summary").first().click();
  await expect(page.getByTestId("shared-provider-queue-snapshot")).toContainText("GW");
  await expect(page.getByTestId("shared-provider-queue-snapshot")).toContainText("aggregate values as of");

  await openAnalysisView(page, "reality");
  await page.getByTestId("button-detailed-evidence").click();
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
  await openAnalysisView(page, "reality");
  await page.getByTestId("button-detailed-evidence").click();
  for (const id of ["electricity_cost", "grid_interconnection", "site_hazard_exposure", "water_consumption"]) {
    const status = page.getByTestId(`evidence-source-status-${id}`);
    if (await status.count()) {
      await expect(status).toHaveText(/Live|Cached|Embedded|No validated source/);
    } else {
      await expect(page.getByTestId(`evidence-origin-${id}`)).toHaveText("Embedded");
    }
  }

  await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
  await expect(page.getByTestId("evidence-source-status-electricity_cost")).toHaveText(/Live|Cached|Embedded|No validated source/);

  await openAnalysisView(page, "transmission");
  const scenario = page.getByTestId("button-opt-in-scenario");
  if (await scenario.count()) await scenario.click();
  await page.getByTestId("financial-tab-assumptions").click();
  await expect(page.getByTestId("model-electricity-attribution")).toContainText("Electricity cost: $");
  await expect(page.getByTestId("model-electricity-attribution")).toContainText("/MWh");
  await expect(page.getByTestId("model-electricity-attribution")).toContainText("U.S. Energy Information Administration Open Data");
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