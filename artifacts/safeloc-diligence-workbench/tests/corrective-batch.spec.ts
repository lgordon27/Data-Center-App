import { expect, test } from "@playwright/test";

const currentSessionKey = "safeloc:diligence:current-session:v1";

function liveEiaEnvelope() {
  return {
    status: "live",
    fetchedAt: "2026-09-10T12:00:00.000Z",
    sourceUpdatedAt: "2026-09-01T00:00:00.000Z",
    data: {
      priceHistory: [{ period: "2026-08", pricePerMwh: 54.1 }],
      priceCalculationHistory: [{ period: "2026-08", pricePerMwh: 54.1 }],
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

test.describe("Batch 4 corrective walkthrough coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
  });

  test("keeps all six starting holdings visible with explicit relationship states", async ({ page }) => {
    await page.goto("/#analysis");

    await expect(page.getByTestId("market-holding-states")).toBeVisible();
    await expect(page.locator("[data-testid^='market-holding-state-']")).toHaveCount(6);
    await expect(page.getByTestId("market-holding-state-oracle")).toContainText("Source-backed");
    await expect(page.getByTestId("market-holding-state-nvidia")).toContainText("Source-backed");
    await expect(page.getByTestId("market-holding-state-microsoft")).toContainText("Discovery match");
    await expect(page.getByTestId("market-holding-state-meta")).toContainText("Research required");
    await expect(page.getByTestId("market-holding-state-google")).toContainText("Research required");
    await expect(page.getByTestId("market-holding-state-amazon")).toContainText("Research required");

    await page.getByTestId("market-holding-state-meta").click();
    await expect(page.getByTestId("market-no-relationship")).toContainText("No established company");
    await expect(page.getByTestId("market-relationship-state")).toContainText("Research required");
    await expect(page.getByTestId("market-relationship-state")).toContainText("No reviewed Stargate relationship");
    await expect(page.getByTestId("market-company")).toHaveText("Meta");
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").originatingCompany, currentSessionKey)).toBe("Meta");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("persists the selected originating company through Home reload and analysis handoff", async ({ page }) => {
    await page.goto("/#home");
    const explorePanel = page.getByTestId("home-explore-panel");
    if ((await explorePanel.getAttribute("open")) === null) await explorePanel.locator("summary").click();
    const oracleCard = page.getByTestId("company-card-oracle");
    await expect(oracleCard).toBeVisible();
    await oracleCard.scrollIntoViewIfNeeded();
    await oracleCard.click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").originatingCompany, currentSessionKey)).toBe("Oracle");
    await page.reload();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Oracle AI Infrastructure Exposure/i })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").originatingCompany, currentSessionKey)).toBe("Oracle");

    await page.goto("/#analysis");
    await expect(page.getByTestId("market-company")).toHaveText("Oracle");
    await expect(page.getByTestId("market-holding-state-oracle")).toContainText("Source-backed");
  });

  test("withholds returns while EIA is pending and labels the settled provider basis", async ({ page }) => {
    let releaseRequest!: () => void;
    const responseBlocked = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route("**/api/eia/electricity", async (route) => {
      await responseBlocked;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(liveEiaEnvelope()),
      });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.evaluate(() => { window.location.hash = "analysis"; });
    await page.getByTestId("tab-transmission").click();
    await expect(page.getByTestId("financial-inputs-updating")).toBeVisible();
    await expect(page.getByTestId("metric-project-irr")).toHaveCount(0);
    await expect(page.getByTestId("financial-inputs-updating")).toContainText("temporarily withheld");

    releaseRequest();
    await expect(page.getByTestId("financial-input-state")).toContainText("Live provider-based calculation");
    await expect(page.getByTestId("financial-input-state")).toContainText("$54.1/MWh");
    const stressTest = page.getByRole("button", { name: /Illustrative Project Stress Test/i });
    if (await stressTest.getAttribute("aria-expanded") === "false") await stressTest.click();
    await page.getByRole("tab", { name: "Cash Flows" }).click();
    await expect(page.getByTestId("metric-project-irr")).toBeVisible();
    await expect(page.getByTestId("financial-inputs-updating")).toHaveCount(0);
  });
});