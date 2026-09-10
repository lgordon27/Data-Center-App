import { expect, test } from "@playwright/test";

test.describe("governed diligence agent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#analysis");
  });

  test("keeps the retired agent surface out of the maintained workbench", async ({ page }) => {
    await expect(page.getByTestId("conference-view-market")).toBeVisible();
    await expect(page.getByTestId("button-run-diligence-agent")).toHaveCount(0);
    await page.getByTestId("tab-advisor").click();
    await expect(page.getByTestId("conference-view-advisor")).toBeVisible();
  });

  test("keeps the current advisor view usable on narrow screens", async ({ page }) => {
    await page.getByTestId("tab-advisor").click();
    await expect(page.getByTestId("conference-view-advisor")).toBeVisible();
    await expect(page.getByTestId("conference-view-advisor")).toBeInViewport();
  });

  test("keeps reset available from the active analysis", async ({ page }) => {
    await expect(page.getByTestId("button-reset-default")).toBeVisible();
    await page.getByTestId("button-reset-default").click();
    await expect(page.getByTestId("button-confirm-reset-default")).toBeVisible();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page).toHaveURL(/#analysis$/);
  });
});