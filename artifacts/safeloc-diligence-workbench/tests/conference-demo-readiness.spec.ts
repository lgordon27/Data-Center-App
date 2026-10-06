import { expect, test, type Page } from "@playwright/test";

function interceptedEiaResponse() {
  // Offline UI fixture only; these values and dates are not a claimed EIA observation.
  const priceHistory = Array.from({ length: 13 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 7 + index, 1));
    return {
      period: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      pricePerMwh: index === 12 ? 70.7 : 65 + (5.7 * index) / 12,
    };
  });
  const generation = {
    naturalGas: 55,
    wind: 20,
    solar: 10,
    nuclear: 10,
    coal: 5,
    other: 0,
  };
  const shares = { ...generation };
  return {
    status: "live",
    fetchedAt: "2026-09-15T12:00:00.000Z",
    sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
    freshness: "fresh",
    data: {
      priceHistory,
      priceCalculationHistory: priceHistory,
      generationHistory: [{
        period: "2026-08",
        generationMwh: generation,
        totalMwh: 100,
        shares,
      }],
      consumptionHistory: [{ period: "2026-08", consumptionMwh: 100 }],
      latestPrice: 70.7,
      latestPricePeriod: "2026-08",
    },
  };
}

async function installOfflineApi(page: Page, eiaState: "observation" | "unavailable" = "observation") {
  let eiaApiRequests = 0;
  let researchRequests = 0;
  await page.addInitScript(() => window.localStorage.clear());
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/eia/electricity") {
      eiaApiRequests += 1;
      if (eiaState === "unavailable") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "offline test fixture; no EIA provider call" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(interceptedEiaResponse()),
      });
      return;
    }
    if (pathname === "/api/research-project") researchRequests += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "offline test fixture; no provider or research call" }),
    });
  });
  return {
    eiaApiRequests: () => eiaApiRequests,
    researchRequests: () => researchRequests,
  };
}

test("transmission separates synthetic pricing from EIA context and opens the stress test by click", async ({ page }, testInfo) => {
  const apiCounts = await installOfflineApi(page);
  await page.goto("/#analysis");
  await page.getByTestId("tab-transmission").click();

  const electricityBasis = page.getByTestId("transmission-electricity-basis");
  await expect(electricityBasis).toBeVisible();
  await expect(page.getByTestId("transmission-primary-electricity-basis")).toContainText("$44.1/MWh");
  await expect(page.getByTestId("transmission-primary-electricity-basis")).toContainText("$42.0/MWh");
  await expect(page.getByTestId("transmission-primary-electricity-basis")).toContainText("not a sourced Stargate tariff");

  const eiaBasis = page.getByTestId("transmission-eia-electricity-basis");
  await expect(eiaBasis).toContainText("$70.7/MWh");
  await expect(eiaBasis).toContainText("Texas industrial retail-sales price series");
  await expect(eiaBasis).toContainText("observed period 2026-08");
  await expect(eiaBasis).toContainText("retrieved 2026-09-15");
  await expect(eiaBasis).toContainText("not a Stargate contract rate");

  const baselineIrr = await page.getByTestId("transmission-eia-baseline-irr").innerText();
  const stressIrr = await page.getByTestId("transmission-eia-stress-irr").innerText();
  expect(baselineIrr).not.toContain("Not available");
  expect(stressIrr).not.toContain("Not available");
  console.log(`Test-only $70.7/MWh EIA fixture IRRs — baseline: ${baselineIrr}; current-evidence stress: ${stressIrr}`);
  const stressToggle = page.getByRole("button", { name: /Illustrative Project Stress Test/i });
  await stressToggle.click();
  await expect(stressToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#illustrative-stress-test")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("transmission-readiness.png") });
  await page.getByTestId("transmission-electricity-basis").screenshot({
    path: testInfo.outputPath("electricity-basis.png"),
  });
  expect(apiCounts.eiaApiRequests()).toBeGreaterThan(0);
  expect(apiCounts.researchRequests()).toBe(0);
});

test("transmission labels the bundled rate as synthetic when no EIA observation is available", async ({ page }) => {
  const apiCounts = await installOfflineApi(page, "unavailable");
  await page.goto("/#analysis");
  await page.getByTestId("tab-transmission").click();

  await expect(page.getByTestId("transmission-primary-electricity-basis")).toContainText("$44.1/MWh");
  await expect(page.getByTestId("transmission-primary-electricity-basis")).toContainText("$42.0/MWh");
  const eiaBasis = page.getByTestId("transmission-eia-electricity-basis");
  await expect(eiaBasis).toContainText("No EIA provider observation is available");
  await expect(eiaBasis).toContainText("no statewide rate, observation period, or retrieval date is reported");
  await expect(page.getByTestId("transmission-eia-baseline-irr")).toContainText("Not available");
  await expect(page.getByTestId("transmission-eia-stress-irr")).toContainText("Not available");
  expect(apiCounts.eiaApiRequests()).toBeGreaterThan(0);
  expect(apiCounts.researchRequests()).toBe(0);
});
