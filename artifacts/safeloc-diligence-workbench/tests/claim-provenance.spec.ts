import { expect, test, type Page } from "@playwright/test";

async function openAnalysisView(page: Page, view: "market" | "reality" | "transmission" | "advisor") {
  await page.goto("/#analysis");
  await page.getByTestId(`tab-${view}`).click();
}

test.describe("claim-level provenance", () => {
  test("shows exact source metadata and safe new-tab links on major routes", async ({ page }) => {
    for (const route of ["value-chain", "reality"] as const) {
      if (route === "value-chain") {
        await page.goto("/#value-chain");
      } else {
        await openAnalysisView(page, "reality");
        await page.getByTestId("button-detailed-evidence").click();
      }
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
    await openAnalysisView(page, "reality");
    await page.getByTestId("button-detailed-evidence").click();
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
    await page.goto("/#value-chain");
    await page.getByTestId("value-chain-supporting-context").locator("summary").first().click();
    const citation = page.getByTestId("claim-citation-stargate-cancellation").first();
    await citation.locator("summary").click();
    await expect(citation).toContainText("Last verified: Aug 30, 2026");
  });
});