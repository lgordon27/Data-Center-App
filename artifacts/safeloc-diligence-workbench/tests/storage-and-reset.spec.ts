import { expect, test } from "@playwright/test";

const currentSessionKey = "safeloc:diligence:current-session:v1";
const scenariosKey = "safeloc:diligence:scenarios:v1";
const evidenceTipDismissedKey = "safeloc:diligence:evidence-room-tip-dismissed:v1";

test.describe("current-session recovery and reset isolation", () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, "Storage behavior only needs one browser viewport.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
  });

  test("persists a classification and shows restore feedback for three seconds", async ({ page }) => {
    await page.goto("/#evidence");
    const classification = page.getByTestId("select-classification-electricity_cost");

    await classification.selectOption("Missing Evidence");
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), currentSessionKey)).not.toBeNull();
    const marker = page.getByTestId("review-marker-electricity_cost");
    await expect(marker).toContainText("Reviewed by analyst");
    const storedReview = await page.evaluate((key) => {
      const session = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      return session.reviewMetadata?.electricity_cost;
    }, currentSessionKey);
    expect(storedReview.kind).toBe("manual");
    expect(storedReview.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    await page.reload();
    await expect(classification).toHaveValue("Missing Evidence");
    await expect(marker).toContainText("Reviewed by analyst");
    await expect(marker.locator("time")).toHaveAttribute("datetime", storedReview.reviewedAt);
    await expect(page.getByTestId("text-session-restored")).toHaveText("Session restored");
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId("text-session-restored")).toBeVisible();
    await expect(page.getByTestId("text-session-restored")).toBeHidden({ timeout: 2_000 });

    await page.goto("/#materiality");
    await page.goto("/#evidence");
    await expect(marker).toContainText("Reviewed by analyst");
  });

  test("guides the first classification interaction and remembers the tip dismissal", async ({ page }) => {
    await page.goto("/#evidence");

    const evidenceTip = page.getByTestId("evidence-classification-tip");
    await expect(evidenceTip).toBeVisible();
    await expect(evidenceTip).toContainText("Try it: Click any dropdown and change a classification. Watch what happens.");
    await expect(page.getByTestId("select-classification-electricity_cost")).toBeVisible();

    await page.getByTestId("button-dismiss-evidence-classification-tip").click();
    await expect(evidenceTip).toBeHidden();
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), evidenceTipDismissedKey)).toBe("true");

    await page.reload();
    await expect(page.getByTestId("evidence-classification-tip")).toHaveCount(0);
  });

  test("removes the materiality prompt after a classification recalculates the return", async ({ page }) => {
    await page.goto("/#materiality");
    await expect(page.getByTestId("materiality-classification-prompt")).toContainText("Change a classification to see the return update.");

    await page.goto("/#evidence");
    await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
    await expect(page.getByTestId("toast-reclassification")).toContainText("Return updated");

    await page.goto("/#materiality");
    await expect(page.getByTestId("materiality-classification-prompt")).toHaveCount(0);
    await expect(page.getByTestId("live-current-irr")).toContainText("Current IRR is now");
    await page.reload();
    await expect(page.getByTestId("materiality-classification-prompt")).toHaveCount(0);
  });

  test("falls back to defaults when current-session storage is malformed", async ({ page }) => {
    await page.evaluate((key) => window.localStorage.setItem(key, "{malformed"), currentSessionKey);
    await page.goto("/#evidence");
    await page.reload();

    await expect(page.getByTestId("select-classification-electricity_cost")).toHaveValue("User Assumption");
    await expect(page.getByTestId("text-session-restored")).toHaveCount(0);
  });

  test("migrates stale audited defaults while preserving intentional overrides", async ({ page }) => {
    const legacyClassifications = {
      electricity_cost: "Verified Evidence",
      water_consumption: "Verified Evidence",
      grid_interconnection: "Verified Evidence",
      water_escalation: "Model Inference",
      community_risk: "Verified Evidence",
      renewable_percentage: "Management Assertion",
      cooling_capex: "User Assumption",
      electricity_escalation: "Verified Evidence",
      carbon_compliance: "Model Inference",
      permitting_timeline: "Management Assertion",
      customer_concentration: "Missing Evidence",
      water_rights: "Missing Evidence",
      site_hazard_exposure: "Verified Evidence",
      backup_power_capacity: "Management Assertion",
      water_source_resilience: "Model Inference",
      downtime_cost: "User Assumption",
    };
    await page.evaluate(
      ({ key, classifications }) => window.localStorage.setItem(key, JSON.stringify({
        version: 1,
        hasChangedClassification: true,
        classifications,
        reviewMetadata: {
          water_consumption: { kind: "not-a-review-kind", reviewedAt: "2026-08-31T12:00:00.000Z" },
          grid_interconnection: { kind: "manual", reviewedAt: "not-a-date" },
        },
      })),
      { key: currentSessionKey, classifications: legacyClassifications },
    );

    await page.goto("/#evidence");
    await page.reload();

    await expect(page.getByTestId("select-classification-electricity_cost")).toHaveValue("User Assumption");
    await expect(page.getByTestId("select-classification-electricity_escalation")).toHaveValue("Model Inference");
    await expect(page.getByTestId("select-classification-customer_concentration")).toHaveValue("Missing Evidence");
    await expect(page.getByTestId("select-classification-water_consumption")).toHaveValue("Verified Evidence");
    await expect(page.getByTestId("text-session-restored")).toHaveText("Session updated to audited defaults");

    const migrated = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), currentSessionKey);
    expect(migrated.version).toBe(2);
    expect(migrated.canonicalProvenanceVersion).toBe(2);
    expect(migrated.overrides).toEqual({
      customer_concentration: "Missing Evidence",
      water_consumption: "Verified Evidence",
    });
    expect(migrated.reviewMetadata).toEqual({});
    await expect(page.locator("[data-testid^='review-marker-']")).toHaveCount(0);
  });

  test("requires reset confirmation and preserves named scenarios", async ({ page }) => {
    await page.goto("/#evidence");
    const classification = page.getByTestId("select-classification-electricity_cost");
    await classification.selectOption("Missing Evidence");
    await expect(page.getByTestId("review-marker-electricity_cost")).toContainText("Reviewed by analyst");

    const savedScenarios = JSON.stringify({
      version: 1,
      scenarios: [
        {
          id: "kept-scenario",
          name: "Keep me",
          savedAt: "2026-08-29T12:00:00.000Z",
          classifications: await page.evaluate((key) => {
            const session = JSON.parse(window.localStorage.getItem(key) ?? "{}");
            return session.classifications;
          }, currentSessionKey),
          metrics: { projectIRR: 10, moic: 1.5, npv: 12, cashOnCash: 8, payback: 4, confidence: 50 },
        },
      ],
    });
    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), { key: scenariosKey, value: savedScenarios });
    await page.reload();

    await page.getByTestId("button-reset-default").click();
    await expect(page.getByRole("heading", { name: "Reset to Default?" })).toBeVisible();
    await expect(page.getByText("Named scenarios are kept.")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(classification).toHaveValue("Missing Evidence");
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), currentSessionKey)).not.toBeNull();

    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#brief$/);
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), currentSessionKey)).toBeNull();
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios?.[0]?.name, scenariosKey)).toBe("Keep me");

    await page.goto("/#evidence");
    await expect(classification).toHaveValue("User Assumption");
    await expect(page.getByTestId("review-marker-electricity_cost")).toHaveCount(0);
    await page.goto("/#materiality");
    await expect(page.getByTestId("materiality-classification-prompt")).toBeVisible();
  });
});