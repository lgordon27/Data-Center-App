import { expect, test, type Page } from "@playwright/test";

async function openReality(page: Page) {
  await page.goto("/#analysis");
  await page.getByTestId("tab-reality").click();
  await expect(page.getByTestId("conference-view-reality")).toBeVisible();
}

test.describe("institutional workbench refinement", () => {
  test("context drawer opens from an evidence source and Escape returns focus to the trigger", async ({ page }) => {
    await openReality(page);
    await page.getByTestId("button-detailed-evidence").click();
    const row = page.getByTestId("row-evidence-water_rights");
    await row.locator("summary").first().click();
    const trigger = page.getByTestId("button-view-source-water_rights");
    await trigger.click();
    const drawer = page.getByTestId("context-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("View Source");
    await expect(drawer).toContainText("Water Rights");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("only one evidence row expands at a time and filters remain explicit", async ({ page }) => {
    await openReality(page);
    await page.getByTestId("button-detailed-evidence").click();
    await page.getByTestId("row-evidence-water_rights").locator("summary").first().click();
    await expect(page.getByTestId("row-evidence-water_rights")).toHaveJSProperty("open", true);
    await page.getByTestId("row-evidence-electricity_cost").locator("summary").first().click();
    await expect(page.getByTestId("row-evidence-electricity_cost")).toHaveJSProperty("open", true);
    await expect(page.getByTestId("row-evidence-water_rights")).toHaveJSProperty("open", false);
    await page.getByTestId("filter-evidence-material-gaps").click();
    await expect(page.getByTestId("evidence-filtered-list")).toBeVisible();
    await page.getByTestId("filter-evidence-all").click();
    await expect(page.getByTestId("evidence-filtered-list")).toBeHidden();
  });

  test("financial transmission remains a separate, explicit model view", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("tab-transmission").click();
    await expect(page.getByTestId("conference-view-transmission")).toBeVisible();
    const scenarioButton = page.getByTestId("button-opt-in-scenario");
    if (await scenarioButton.count()) await scenarioButton.click();
    await expect(page.locator('[data-testid="financial-transmission-model"], [data-testid="financial-inputs-updating"]')).toBeVisible();
    await expect(page.locator("body")).toContainText(/illustrative|synthetic/i);
  });

  test("advisor view keeps holdings context and recommendation posture visible", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("tab-advisor").click();
    await expect(page.getByTestId("conference-view-advisor")).toBeVisible();
    await expect(page.getByTestId("advisor-gap-summary")).toBeVisible();
    await expect(page.getByTestId("advisor-recommended-action")).toBeVisible();
    await expect(page.getByTestId("advisor-manager-question-0")).toBeVisible();
  });

  test("keyboard focus stays inside the open source drawer", async ({ page }) => {
    await openReality(page);
    await page.getByTestId("button-detailed-evidence").click();
    const row = page.getByTestId("row-evidence-water_rights");
    await row.locator("summary").first().click();
    await page.getByTestId("button-view-source-water_rights").click();
    const drawer = page.getByTestId("context-drawer");
    await expect(drawer).toBeVisible();

    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press("Tab");
      expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("reset remains available from the active workbench", async ({ page }) => {
    await page.goto("/#analysis");
    await expect(page.getByTestId("button-reset-default")).toBeVisible();
    await page.getByTestId("button-reset-default").click();
    await expect(page.getByTestId("button-confirm-reset-default")).toBeVisible();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page.getByTestId("tab-market")).toHaveAttribute("aria-selected", "true");
  });
});