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

  test("retires the obsolete agent-run storage entry on restore", async ({ page }) => {
    const legacyAgentRunKey = "safeloc:diligence:agent-run:v1";
    await page.evaluate((key) => {
      window.localStorage.setItem(key, JSON.stringify({
        version: 2,
        status: "review-ready",
        stages: [],
        proposedFindings: [],
      }));
    }, legacyAgentRunKey);
    await page.reload();

    await expect(page.getByTestId("conference-view-market")).toBeVisible();
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), legacyAgentRunKey)).toBeNull();
    await expect(page.getByTestId("button-run-diligence-agent")).toHaveCount(0);
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