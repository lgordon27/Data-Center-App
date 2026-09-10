import { expect, test } from "@playwright/test";

test.describe("community agreement intelligence", () => {
  test("focuses the evidence group from Overview and expands one term at a time", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("tab-reality").click();
    await page.getByTestId("button-detailed-evidence").click();
    const group = page.getByTestId("community-agreements-group");
    await group.locator("summary").click();
    await expect(group).toHaveAttribute("open", "");

    await page.getByTestId("community-term-row-community-fund").getByRole("button").first().click();
    await expect(page.getByTestId("community-term-detail-community-fund")).toBeVisible();
    await page.getByTestId("community-term-row-clawbacks").getByRole("button").first().click();
    await expect(page.getByTestId("community-term-detail-community-fund")).toBeHidden();
    await expect(page.getByTestId("community-term-detail-clawbacks")).toBeVisible();
  });

  test("requires a human action before an AI community proposal is applied", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("tab-reality").click();
    await page.getByTestId("button-detailed-evidence").click();
    const group = page.getByTestId("community-agreements-group");
    await group.locator("summary").click();
    await page.getByTestId("button-analyze-community-ai").click();
    await expect(page.getByTestId("community-ai-proposal-status")).toContainText("human action required");
    await page.getByTestId("community-term-row-community-fund").getByRole("button").first().click();
    await expect(page.getByTestId("community-ai-proposal-community-fund")).toBeVisible();
    await page.getByTestId("button-leave-community-community-fund").click();
    await expect(page.getByTestId("community-live-status")).toContainText("left unresolved");
  });

  test("shows exact external benchmark statuses and honest provenance links", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("tab-reality").click();
    await page.getByTestId("button-detailed-evidence").click();
    const group = page.getByTestId("community-agreements-group");
    await group.locator("summary").click();
    const expected: Record<string, string> = {
      "community-fund": "SHORT",
      clawbacks: "SHORT",
      "decommissioning-security": "SHORT",
      "grid-cost-allocation": "SHORT",
      "water-commitments": "SHORT",
      "noise-protections": "UNKNOWN",
      "binding-jobs": "MET",
      "local-contracting-road-repair": "UNKNOWN",
      "transparency-auditability": "SHORT",
      "tax-incentives": "UNKNOWN",
    };
    for (const [term, status] of Object.entries(expected)) {
      await expect(page.getByTestId(`community-benchmark-${term}`)).toHaveText(status);
    }
    await page.getByTestId("community-term-row-community-fund").getByRole("button").first().click();
    await expect(page.getByTestId("community-exact-language-community-fund")).toContainText("No exact quotation captured");
    await expect(page.getByTestId("community-source-summary-community-fund")).toContainText("Source summary (not a quotation)");
    await expect(page.getByRole("link", { name: "Open cited source record" })).toHaveAttribute("href", "https://futurepickleballcourt.com/#us-tx-abilene-2025");
    await expect(page.getByText("Original primary document URL not verified")).toBeVisible();
    await expect(page.locator("a", { hasText: "Open original document" })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("/agreements/");
  });

  test("shows community gaps through Decision Resolve and questions in Advisor Lens", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("tab-reality").click();
    await page.getByTestId("button-detailed-evidence").click();
    await expect(page.getByTestId("community-agreements-group")).toBeVisible();
    await page.getByTestId("community-agreements-group").locator("summary").click();
    await expect(page.getByTestId("community-agreements-group")).toHaveAttribute("open", "");
    await expect(page.getByTestId("community-canonical-relationships")).toBeVisible();
    await page.getByTestId("tab-advisor").click();
    await expect(page.getByTestId("conference-view-advisor")).toBeVisible();
  });
});