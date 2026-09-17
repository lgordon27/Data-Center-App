import { expect, test } from "@playwright/test";

async function captureReturnState(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const capture = (window as Window & {
      __safelocCaptureReturnDiscrepancyState?: () => Promise<{
        classifications: Record<string, string>;
        providerProvenance: { eia: { status: string; dataOrigin: string } };
        modelInputs: { fingerprint: string };
        financialScenarios: {
          primaryScenarioId: string;
          scenarios: Record<string, {
            role: string;
            evidenceBasis: string;
            electricityBasis: string;
            provider: { state: string; period: string | null; sourceUpdatedAt: string | null };
            inputs: { rawElectricityRate: number; appliedElectricityRate: number };
            returns: { projectIRR: number | null };
            modelFingerprint: string;
          } | null>;
        };
      }>;
    }).__safelocCaptureReturnDiscrepancyState;
    if (!capture) throw new Error("Return discrepancy capture hook is unavailable.");
    return capture();
  });
}

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
    const capture = await captureReturnState(page);
    expect(capture.providerProvenance.eia).toMatchObject({ status: "live", dataOrigin: "provider" });
    expect(Object.keys(capture.classifications)).toHaveLength(16);
    expect(capture.modelInputs.fingerprint).toMatch(/^fnv1a-/);
    expect(capture.financialScenarios.primaryScenarioId).toBe("synthetic-current");
    expect(capture.financialScenarios.scenarios["synthetic-verified"]?.returns.projectIRR).toBeCloseTo(13.343171792288588, 9);
    expect(capture.financialScenarios.scenarios["synthetic-current"]?.returns.projectIRR).toBeCloseTo(9.086986530041251, 9);
    expect(capture.financialScenarios.scenarios["synthetic-current"]).toMatchObject({
      role: "primary",
      evidenceBasis: "current",
      electricityBasis: "synthetic",
    });
    expect(capture.financialScenarios.scenarios["eia-current"]).toMatchObject({
      role: "sensitivity",
      electricityBasis: "eia",
      provider: { state: "live", period: "2026-08", sourceUpdatedAt: "2026-08-01T00:00:00.000Z" },
      inputs: { rawElectricityRate: 54.1, appliedElectricityRate: 56.80500000000001 },
    });

    const classification = page.getByTestId("select-classification-electricity_cost");
    await classification.selectOption("User Assumption");
    await expect(classification).toHaveValue("User Assumption");
    await expect(page.getByTestId("button-suggest-verified-eia")).toBeEnabled();
    await page.getByTestId("button-suggest-verified-eia").click();
    await expect(classification).toHaveValue("Verified Evidence");

    await page.goto("/#analysis");
    await page.getByTestId("tab-transmission").click();
    const liveScenario = page.getByTestId("button-opt-in-scenario");
    if (await liveScenario.count()) await liveScenario.click();
    await page.getByTestId("financial-tab-assumptions").click();
    await expect(page.getByTestId("model-electricity-attribution")).toHaveText("Electricity cost: $44.1/MWh (embedded estimate)");
    await expect(page.getByTestId("scenario-synthetic-verified")).toContainText("13.3%");
    await expect(page.getByTestId("scenario-synthetic-current")).toContainText("9.1%");
    await expect(page.getByTestId("scenario-eia-current")).toContainText("Optional market sensitivity");
    await expect(page.getByTestId("footer-eia-attribution")).toHaveText("Electricity: U.S. Energy Information Administration Open Data");
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

    await page.goto("/#analysis");
    await page.getByTestId("tab-transmission").click();
    const cachedScenario = page.getByTestId("button-opt-in-scenario");
    if (await cachedScenario.count()) await cachedScenario.click();
    await page.getByTestId("financial-tab-assumptions").click();
    await expect(page.getByTestId("model-electricity-attribution")).toHaveText("Electricity cost: $44.1/MWh (embedded estimate)");
    await expect(page.getByTestId("scenario-synthetic-verified")).toContainText("13.3%");
    await expect(page.getByTestId("scenario-synthetic-current")).toContainText("9.1%");
    await expect(page.getByTestId("scenario-eia-current")).toContainText("Optional market sensitivity");
    const capture = await captureReturnState(page);
    expect(capture.providerProvenance.eia).toMatchObject({ status: "cached", dataOrigin: "provider" });
    expect(Object.keys(capture.classifications)).toHaveLength(16);
    expect(capture.financialScenarios.scenarios["synthetic-current"]?.returns.projectIRR).toBeCloseTo(9.086986530041251, 9);
    expect(capture.financialScenarios.scenarios["eia-current"]?.provider.state).toBe("cached");
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

    await page.goto("/#analysis");
    await page.getByTestId("tab-transmission").click();
    const fallbackScenario = page.getByTestId("button-opt-in-scenario");
    if (await fallbackScenario.count()) await fallbackScenario.click();
    await page.getByTestId("financial-tab-assumptions").click();
    await expect(page.getByTestId("model-electricity-attribution")).toHaveText("Electricity cost: $44.1/MWh (embedded estimate)");
    const capture = await captureReturnState(page);
    expect(capture.providerProvenance.eia).toMatchObject({ status: "fallback", dataOrigin: "embedded" });
    expect(Object.keys(capture.classifications)).toHaveLength(16);
  });
});