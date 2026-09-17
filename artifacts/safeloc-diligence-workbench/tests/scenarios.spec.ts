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
  if (await page.getByTestId("conference-scenarios").count() === 0) {
    await page.getByTestId("rail-save-scenario").click();
    await expect(page.getByTestId("conference-scenarios")).toBeVisible();
  } else {
    await page.getByTestId("button-save-scenario").click();
  }
  const input = page.getByTestId("input-scenario-name");
  await expect(input).toBeVisible();
  await input.fill(name);
  await page.getByTestId("button-confirm-save-scenario").click();
  await expect(page.getByTestId("text-scenario-feedback")).toContainText(`Scenario “${name}” saved.`);
  await expect(input).toBeHidden();
  await page.waitForTimeout(250);
}

async function openFinancialTransmission(page: Page) {
  await page.getByTestId("tab-transmission").click();
  const stressTest = page.getByRole("button", { name: /Illustrative Project Stress Test/i });
  if (await stressTest.getAttribute("aria-expanded") === "false") await stressTest.click();
  await expect(stressTest).toHaveAttribute("aria-expanded", "true");
}

async function openEvidenceReview(page: Page) {
  await page.getByTestId("tab-reality").click();
  const evidenceReview = page.getByRole("button", { name: /Detailed Evidence Record/i });
  if (await evidenceReview.getAttribute("aria-expanded") === "false") await evidenceReview.click();
  await expect(evidenceReview).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId("filter-evidence-all").click();
}

async function openSavedScenarios(page: Page) {
  const disclosure = page.getByTestId("disclosure-saved-scenarios");
  if (await disclosure.getAttribute("open") === null) {
    await disclosure.locator(":scope > summary").click();
  }
  await expect(disclosure).toHaveAttribute("open", "");
}

test.describe("named scenario snapshots and comparisons", () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, "Scenario behavior only needs one browser viewport.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/#analysis");
    await openFinancialTransmission(page);
  });

  test("captures immutable snapshots and enforces the five-scenario limit", async ({ page }) => {
    await saveScenario(page, "Base case");
    const originalSnapshot = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios[0], scenariosKey);
    expect(originalSnapshot.metrics.projectIRR).not.toBe(Number(originalSnapshot.metrics.projectIRR.toFixed(1)));
    expect(originalSnapshot.metrics.moic).not.toBe(Number(originalSnapshot.metrics.moic.toFixed(2)));
    expect(originalSnapshot.metrics.npv).not.toBe(Number(originalSnapshot.metrics.npv.toFixed(0)));
    if (originalSnapshot.metrics.payback === null) {
      expect(originalSnapshot.metrics.payback).toBeNull();
    } else {
      expect(originalSnapshot.metrics.payback).not.toBe(Number(originalSnapshot.metrics.payback.toFixed(1)));
    }

    await openEvidenceReview(page);
    await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
    await openFinancialTransmission(page);

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
              metrics: { projectIRR: 10.04, moic: 1.504, npv: 12.49, cashOnCash: 8.24, payback: null, confidence: 40.04 },
            },
            {
              id: "second",
              name: "Second case",
              savedAt: "2026-08-29T12:05:00.000Z",
              classifications,
              metrics: { projectIRR: 8.46, moic: 1.495, npv: 9.11, cashOnCash: 8.26, payback: 4.54, confidence: 55.06 },
            },
          ],
        },
      },
    );
    await page.reload();
    await openFinancialTransmission(page);
    await page.getByTestId("rail-compare-scenarios").click();
    await expect(page.getByTestId("conference-scenarios")).toBeVisible();

    const expectedRows = {
      projectIRR: ["10.0%", "8.5%", "-1.6 pts"],
      moic: ["1.50x", "1.50x", "-0.01x"],
      npv: ["$12M", "$9M", "−$3M"],
      cashOnCash: ["8.2%", "8.3%", "+0.0%"],
      payback: ["Not reached", "4.5 years", "Unavailable"],
      confidence: ["40.0%", "55.1%", "+15.0%"],
    };

    for (const [metric, values] of Object.entries(expectedRows)) {
      const row = page.getByTestId(`row-scenario-comparison-${metric}`);
      for (const value of values) await expect(row).toContainText(value);
    }

    await expect(page.getByTestId("select-scenario-first")).toHaveValue("first");
    await expect(page.getByTestId("select-scenario-second")).toHaveValue("second");
    await openSavedScenarios(page);
    await expect(page.getByTestId("text-scenario-basis-first")).toHaveText("Legacy snapshot · primary basis not recorded");
    await expect(page.getByTestId("text-scenario-basis-second")).toHaveText("Legacy snapshot · primary basis not recorded");
    await page.getByTestId("button-rename-scenario-first").click();
    await page.getByTestId("input-rename-scenario-name").fill("First case migrated");
    await page.getByTestId("button-confirm-rename-scenario").click();
    const migrated = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), scenariosKey);
    expect(migrated.version).toBe(2);
    expect(migrated.scenarios.map((scenario: { id: string; name: string }) => ({ id: scenario.id, name: scenario.name }))).toEqual([
      { id: "first", name: "First case migrated" },
      { id: "second", name: "Second case" },
    ]);
    for (const scenario of migrated.scenarios) {
      expect(scenario.basis).toEqual({
        status: "legacy-unknown",
        scenarioId: null,
        evidenceBasis: "unknown",
        electricityBasis: "unknown",
        modelContractVersion: null,
        modelFingerprint: null,
      });
    }
    await expect(page.evaluate((key) => window.localStorage.getItem(key), currentSessionKey)).resolves.toBeNull();
  });

  test("renames a snapshot without changing its saved data and rejects invalid names", async ({ page }) => {
    await saveScenario(page, "Base case");
    await saveScenario(page, "Downside");
    const originalSnapshot = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios[0], scenariosKey);

    await openSavedScenarios(page);
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
    await openSavedScenarios(page);
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