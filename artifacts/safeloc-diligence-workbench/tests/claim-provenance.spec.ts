import { expect, test } from "@playwright/test";

test.describe("claim-level provenance", () => {
  test("shows exact source metadata and safe new-tab links on major routes", async ({ page }) => {
    for (const route of ["brief", "evidence", "advisor", "chain", "method", "decision"]) {
      await page.goto(`/#${route}`);
      await page.locator("details:not([data-testid^='claim-citation-'])").evaluateAll((details) => {
        for (const detail of details) detail.open = true;
      });
      const citation = page.locator("[data-testid^='claim-citation-']:visible").first();
      await expect(citation).toBeVisible();
      await citation.locator("summary").click();
      const source = citation.locator("[data-testid^='claim-source-']").first();
      if (await source.count()) {
        const link = source.locator("a").first();
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
        await expect(link).toHaveAttribute("aria-label", /in a new tab/i);
        await expect(source).toContainText("Last accessed:");
        await expect(source).toContainText("Access:");
        await expect(source).toContainText("Last verified:");
      }
    }
  });

  test("keeps synthetic economics and unresolved water intentionally uncited", async ({ page }) => {
    await page.goto("/#evidence");
    await page.locator("details:not([data-testid^='claim-citation-'])").evaluateAll((details) => {
      for (const detail of details) detail.open = true;
    });
    for (const claimId of ["synthetic-transaction", "unresolved-water", "analyst-inference"]) {
      const citation = page.locator(`[data-testid='claim-citation-${claimId}']:visible`).first();
      await expect(citation).toBeVisible();
      await citation.locator("summary").click();
      await expect(citation.getByTestId(`claim-citation-boundary-${claimId}`)).toContainText("No public-source link");
      await expect(citation.locator("a")).toHaveCount(0);
    }
  });

  test("displays the review date for a representative 2026 claim", async ({ page }) => {
    await page.goto("/#brief");
    const citation = page.getByTestId("claim-citation-stargate-cancellation").first();
    await citation.locator("summary").click();
    await expect(citation).toContainText("Last verified: Aug 30, 2026");
  });
});