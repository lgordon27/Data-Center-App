import { expect, test } from "@playwright/test";

test.describe("community agreement intelligence", () => {
  test("focuses the evidence group from Overview and expands one term at a time", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("button-review-community-terms").click();
    const group = page.getByTestId("community-agreements-group");
    await expect(group.locator("summary")).toBeFocused();
    await expect(group).toHaveAttribute("open", "");

    await page.getByTestId("community-term-row-community-fund").getByRole("button").first().click();
    await expect(page.getByTestId("community-term-detail-community-fund")).toBeVisible();
    await page.getByTestId("community-term-row-clawbacks").getByRole("button").first().click();
    await expect(page.getByTestId("community-term-detail-community-fund")).toBeHidden();
    await expect(page.getByTestId("community-term-detail-clawbacks")).toBeVisible();
  });

  test("requires a human action before an AI community proposal is applied", async ({ page }) => {
    await page.goto("/#analysis");
    const group = page.getByTestId("community-agreements-group");
    await group.locator("summary").click();
    await page.getByTestId("button-analyze-community-ai").click();
    await expect(page.getByTestId("community-ai-proposal-status")).toContainText("human action required");
    await page.getByTestId("community-term-row-community-fund").getByRole("button").first().click();
    await expect(page.getByTestId("community-ai-proposal-community-fund")).toBeVisible();
    await page.getByTestId("button-leave-community-community-fund").click();
    await expect(page.getByTestId("community-live-status")).toContainText("left unresolved");
  });

  test("shows community gaps through Decision Resolve and questions in Advisor Lens", async ({ page }) => {
    await page.goto("/#decision");
    await expect(page.getByTestId("community-material-gaps")).toBeVisible();
    await page.getByTestId("button-resolve-community-community-fund").click();
    await expect(page.getByTestId("community-agreements-group").locator("summary")).toBeFocused();
    await page.goto("/#advisor");
    await page.getByTestId("disclosure-community-questions").locator("summary").click();
    await expect(page.getByTestId("community-questions")).toBeVisible();
    await expect(page.getByTestId("advisor-community-relationship")).toContainText("Related");
  });
});