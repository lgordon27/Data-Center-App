import { expect, test } from "@playwright/test";

test.describe("Advisor Lens", () => {
  test("shows the current advisor brief and its review actions", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("tab-advisor").click();

    const advisor = page.getByTestId("conference-view-advisor");
    await expect(advisor).toBeVisible();
    await expect(advisor.getByTestId("advisor-recommended-action")).toBeVisible();
    await expect(advisor.locator("[data-testid^='advisor-manager-question-']")).toHaveCount(3);
  });
});