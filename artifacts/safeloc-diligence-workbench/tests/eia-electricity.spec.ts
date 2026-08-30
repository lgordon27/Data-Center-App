import { expect, test } from "@playwright/test";

function monthSeries() {
  return Array.from({ length: 25 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 7 + index, 1));
    return {
      period: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      pricePerMwh: 38 + index * 0.7,
    };
  });
}

function eiaEnvelope(status: "live" | "cached") {
  const priceHistory = monthSeries();
  return {
    status,
    fetchedAt: "2026-08-30T12:00:00.000Z",
    sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
    data: {
      priceHistory: priceHistory.slice(-24),
      priceCalculationHistory: priceHistory,
      latestPrice: 54.1,
      latestPricePeriod: "2026-08",
      generationHistory: [{
        period: "2026-08",
        generationMwh: { naturalGas: 42, wind: 24, solar: 11, nuclear: 9, coal: 6, other: 8 },
        totalMwh: 100,
        shares: { naturalGas: 42, wind: 24, solar: 11, nuclear: 9, coal: 6, other: 8 },
      }],
      consumptionHistory: [{ period: "2026-08", consumptionMwh: 120_000 }],
    },
  };
}

test.describe("EIA electricity evidence", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test("uses live EIA evidence without overwriting the analyst classification", async ({ page }) => {
    await page.route("**/api/eia/electricity", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(eiaEnvelope("live")),
    }));
    await page.goto("/#evidence");

    await expect(page.getByTestId("eia-evidence-source-status")).toContainText("Live");
    await expect(page.getByTestId("eia-latest-rate")).toHaveText("$54.1");
    await expect(page.getByTestId("eia-price-history").locator("svg")).toHaveAttribute("aria-label", /24 months/);
    await expect(page.getByTestId("eia-generation-mix")).toContainText("Statewide generation mix is market context only");
    await expect(page.getByTestId("eia-mix-wind")).toHaveText("24.0%");

    const classification = page.getByTestId("select-classification-electricity_cost");
    await classification.selectOption("User Assumption");
    await expect(classification).toHaveValue("User Assumption");
    await expect(page.getByTestId("button-suggest-verified-eia")).toBeEnabled();
    await page.getByTestId("button-suggest-verified-eia").click();
    await expect(classification).toHaveValue("Verified Evidence");

    await page.goto("/#materiality");
    await expect(page.getByTestId("model-electricity-attribution")).toContainText("U.S. Energy Information Administration Open Data, live");
    await expect(page.getByTestId("model-electricity-attribution")).toContainText("$54.1/MWh");
    await expect(page.getByTestId("footer-eia-attribution")).toHaveText("Electricity data: U.S. Energy Information Administration Open Data");
  });

  test("labels a server-cached EIA observation and does not offer live verification", async ({ page }) => {
    await page.route("**/api/eia/electricity", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(eiaEnvelope("cached")),
    }));
    await page.goto("/#evidence");

    await expect(page.getByTestId("eia-evidence-source-status")).toContainText("Cached");
    await expect(page.getByTestId("eia-price-history")).toContainText("Cached federal observation");
    await expect(page.getByTestId("button-suggest-verified-eia")).toHaveCount(0);

    await page.goto("/#materiality");
    await expect(page.getByTestId("model-electricity-attribution")).toContainText("cached");
    await expect(page.getByTestId("model-electricity-attribution")).toContainText("$54.1/MWh");
  });

  test("keeps the hardcoded model usable when EIA and cache are unavailable", async ({ page }) => {
    await page.route("**/api/eia/electricity", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        status: "unavailable",
        diagnostics: { error: "EIA_API_KEY is not configured on the server." },
      }),
    }));
    await page.goto("/#evidence");

    await expect(page.getByTestId("eia-fallback-state")).toContainText("embedded $42/MWh underwriting assumption");
    await expect(page.getByTestId("eia-fallback-state")).toContainText("not presented as current federal data");

    await page.goto("/#materiality");
    await expect(page.getByTestId("model-electricity-attribution")).toHaveText("Electricity cost: $42/MWh (embedded estimate)");
  });
});