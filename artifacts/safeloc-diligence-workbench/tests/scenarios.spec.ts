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
  "site_hazard_exposure",
  "backup_power_capacity",
  "water_source_resilience",
  "downtime_cost",
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

  test("renames a snapshot without changing its saved data and rejects invalid names", async ({ page }) => {
    await saveScenario(page, "Base case");
    await saveScenario(page, "Downside");
    const originalSnapshot = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios[0], scenariosKey);

    await page.getByTestId(`button-rename-scenario-${originalSnapshot.id}`).click();
    const input = page.getByTestId("input-rename-scenario-name");
    await expect(input).toBeVisible();
    await input.fill("   ");
    await page.getByTestId("button-confirm-rename-scenario").click();
    await expect(page.getByTestId("text-rename-scenario-dialog-error")).toContainText("A scenario name is required.");

    await input.fill("Downside");
    await page.getByTestId("button-confirm-rename-scenario").click();
    await expect(page.getByTestId("text-rename-scenario-dialog-error")).toContainText("A scenario with that name already exists.");

    await input.fill("Base case renamed");
    await page.getByTestId("button-confirm-rename-scenario").click();
    await expect(page.getByTestId("text-scenario-feedback")).toContainText("Scenario “Base case renamed” renamed.");

    const renamedSnapshot = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios[0], scenariosKey);
    expect(renamedSnapshot).toEqual({ ...originalSnapshot, name: "Base case renamed" });
  });

  test("confirms removal, persists it, and updates comparison choices", async ({ page }) => {
    await saveScenario(page, "Base case");
    await saveScenario(page, "Downside");
    const snapshots = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios, scenariosKey);

    await page.getByTestId("button-compare-scenarios").click();
    await expect(page.getByTestId("select-scenario-first")).toHaveValue(snapshots[0].id);
    await page.getByTestId(`button-remove-scenario-${snapshots[0].id}`).click();
    await expect(page.getByRole("alertdialog")).toContainText("Your live evidence classifications will not change.");
    await page.getByTestId("button-cancel-remove-scenario").click();
    await expect(page.getByTestId(`scenario-card-${snapshots[0].id}`)).toBeVisible();

    await page.getByTestId(`button-remove-scenario-${snapshots[0].id}`).click();
    await page.getByTestId("button-confirm-remove-scenario").click();
    await expect(page.getByTestId("text-scenario-feedback")).toContainText("Scenario “Base case” removed.");
    await expect(page.getByTestId(`scenario-card-${snapshots[0].id}`)).toBeHidden();
    await expect(page.getByTestId("panel-scenario-comparison")).toContainText("At least two saved scenarios are required.");
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios.length, scenariosKey)).toBe(1);
    await expect(page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios[0].name, scenariosKey)).resolves.toBe("Downside");
  });
});