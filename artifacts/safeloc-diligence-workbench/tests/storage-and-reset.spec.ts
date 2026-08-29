import { expect, test } from "@playwright/test";

const currentSessionKey = "safeloc:diligence:current-session:v1";
const scenariosKey = "safeloc:diligence:scenarios:v1";

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

    await page.reload();
    await expect(classification).toHaveValue("Missing Evidence");
    await expect(page.getByTestId("text-session-restored")).toHaveText("Session restored");
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId("text-session-restored")).toBeVisible();
    await expect(page.getByTestId("text-session-restored")).toBeHidden({ timeout: 2_000 });
  });

  test("falls back to defaults when current-session storage is malformed", async ({ page }) => {
    await page.evaluate((key) => window.localStorage.setItem(key, "{malformed"), currentSessionKey);
    await page.goto("/#evidence");
    await page.reload();

    await expect(page.getByTestId("select-classification-electricity_cost")).toHaveValue("Verified Evidence");
    await expect(page.getByTestId("text-session-restored")).toHaveCount(0);
  });

  test("requires reset confirmation and preserves named scenarios", async ({ page }) => {
    await page.goto("/#evidence");
    const classification = page.getByTestId("select-classification-electricity_cost");
    await classification.selectOption("Missing Evidence");

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
    await expect(classification).toHaveValue("Verified Evidence");
  });
});