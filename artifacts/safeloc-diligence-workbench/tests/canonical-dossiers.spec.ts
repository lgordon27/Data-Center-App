import { expect, test } from "@playwright/test";

const DOSSIERS = [
  ["stargate-abilene", "Stargate Abilene"],
  ["project-kilby", "Project Kilby"],
  ["microsoft-el-mirage", "Microsoft El Mirage datacenter campus"],
] as const;

test.describe("canonical PostgreSQL dossiers", () => {
  for (const [slug, name] of DOSSIERS) {
    test(`${name} loads in a fresh browser and traverses all four stages`, async ({ page }) => {
      await page.goto("/#analysis");
      const selector = page.getByTestId("canonical-dossier-select");
      await expect(selector).toBeVisible();
      await selector.selectOption(slug);
      await expect(page.getByTestId("conference-summary").getByRole("heading", { name })).toBeVisible();
      await expect(page.getByTestId("canonical-dossier-version")).toContainText("evidence as of");

      for (const stage of ["market", "reality", "transmission", "advisor"]) {
        await page.getByTestId(`tab-${stage}`).click();
        await expect(page.getByTestId(`tab-${stage}`)).toHaveAttribute("aria-selected", "true");
      }
      await expect(page.getByTestId("financial-advisor-coverage")).toContainText(
        "Client conversation brief · material gaps remain",
      );
      await expect(page.getByTestId("asset-manager-brief")).toContainText("Portfolio materiality");
    });
  }
});