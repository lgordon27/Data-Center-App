import { expect, test, type Page } from "@playwright/test";

const currentSessionKey = "safeloc:diligence:current-session:v1";
const scenariosKey = "safeloc:diligence:scenarios:v1";
const evidenceIds = [
  "electricity_cost",
  "water_consumption",
  "grid_interconnection",
  "water_escalation",
  "community_risk",
  "renewable_percentage",
  "cooling_capex",
  "electricity_escalation",
  "carbon_compliance",
  "permitting_timeline",
  "customer_concentration",
  "water_rights",
] as const;

async function saveScenario(page: Page, name: string) {
  await page.getByTestId("button-save-scenario").click();
  const input = page.getByTestId("input-scenario-name");
  await expect(input).toBeVisible();
  await input.fill(name);
  await page.getByTestId("button-confirm-save-scenario").click();
  await expect(page.getByTestId("text-scenario-feedback")).toContainText(`Scenario “${name}” saved.`);
  await expect(input).toBeHidden();
  await page.waitForTimeout(250);
}

test.describe("named scenario snapshots and comparisons", () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, "Scenario behavior only needs one browser viewport.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/#decision");
  });

  test("captures immutable snapshots and enforces the five-scenario limit", async ({ page }) => {
    await saveScenario(page, "Base case");
    const originalSnapshot = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios[0], scenariosKey);

    await page.goto("/#evidence");
    await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
    await page.goto("/#decision");

    const unchangedSnapshot = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios[0], scenariosKey);
    expect(unchangedSnapshot).toEqual(originalSnapshot);

    for (const name of ["Downside", "Upside", "Committee", "Final"]) {
      await saveScenario(page, name);
    }

    await expect(page.getByTestId("text-scenario-capacity")).toContainText("Scenario capacity reached (5/5)");
    await expect(page.getByTestId("button-save-scenario")).toBeDisabled();
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios.length, scenariosKey)).toBe(5);
  });

  test("renders every comparison metric with signed units and unavailable labels", async ({ page }) => {
    const classifications = Object.fromEntries(evidenceIds.map((id) => [id, "Verified Evidence"]));
    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
      {
        key: scenariosKey,
        value: {
          version: 1,
          scenarios: [
            {
              id: "first",
              name: "First case",
              savedAt: "2026-08-29T12:00:00.000Z",
              classifications,
              metrics: { projectIRR: 10, moic: 1.5, npv: 12.3, cashOnCash: 8.2, payback: null, confidence: 40 },
            },
            {
              id: "second",
              name: "Second case",
              savedAt: "2026-08-29T12:05:00.000Z",
              classifications,
              metrics: { projectIRR: 8.5, moic: 1.5, npv: 9.1, cashOnCash: 8.2, payback: 4.5, confidence: 55 },
            },
          ],
        },
      },
    );
    await page.reload();
    await page.getByTestId("button-compare-scenarios").click();

    const expectedRows = {
      projectIRR: ["10.0%", "8.5%", "-1.5 pts"],
      moic: ["1.50x", "1.50x", "+0.00x"],
      npv: ["$12.3M", "$9.1M", "−$3.2M"],
      cashOnCash: ["8.2%", "8.2%", "+0.0%"],
      payback: ["Not reached", "4.50 yrs", "Unavailable"],
      confidence: ["40.0%", "55.0%", "+15.0%"],
    };

    for (const [metric, values] of Object.entries(expectedRows)) {
      const row = page.getByTestId(`row-scenario-comparison-${metric}`);
      for (const value of values) await expect(row).toContainText(value);
    }

    await expect(page.getByTestId("select-scenario-first")).toHaveValue("first");
    await expect(page.getByTestId("select-scenario-second")).toHaveValue("second");
    await expect(page.evaluate((key) => window.localStorage.getItem(key), currentSessionKey)).resolves.toBeNull();
  });
});