import { expect, test } from "@playwright/test";

const DOSSIERS = [
  ["stargate-abilene", "Stargate Abilene", "Oracle", "Crusoe announces flagship Abilene data center is live"],
  ["project-kilby", "Project Kilby", "Microsoft", "Chevron Signs 20-Year Power Agreement with Microsoft for West Texas Data Center"],
  ["microsoft-el-mirage", "Microsoft El Mirage datacenter campus", "Microsoft", "Microsoft Builds World-Class Datacenter Campus in Goodyear"],
] as const;

test.describe("canonical PostgreSQL dossiers", () => {
  for (const [slug, name, company, sourceTitle] of DOSSIERS) {
    test(`${name} loads in a fresh browser and traverses all four stages`, async ({ page }) => {
      await page.goto("/#analysis");
      const selector = page.getByTestId("canonical-dossier-select");
      await expect(selector).toBeVisible();
      await selector.selectOption(slug);
      await expect(page.getByTestId("conference-summary").getByRole("heading", { name })).toBeVisible();
      await expect(page.getByTestId("canonical-dossier-version")).toContainText("evidence as of");
      await expect(page.getByTestId("conference-research-status")).toHaveText("Canonical evidence review");
      await expect(page.getByTestId("market-company")).toHaveText(company);

      for (const stage of ["market", "reality", "transmission", "advisor"]) {
        await page.getByTestId(`tab-${stage}`).click();
        await expect(page.getByTestId(`tab-${stage}`)).toHaveAttribute("aria-selected", "true");
      }
      await expect(page.getByTestId("financial-advisor-coverage")).toContainText(
        "Client conversation brief · material gaps remain",
      );
      await expect(page.getByTestId("asset-manager-brief")).toContainText("Portfolio materiality");
      await expect(page.getByTestId("asset-manager-provenance")).toContainText(sourceTitle);
      await expect(page.getByTestId("advisor-monitoring-considerations")).toBeVisible();

      await page.getByTestId("tab-reality").click();
      await expect(page.getByTestId("conference-view-reality")).toContainText("Top accepted findings");
      await expect(page.getByTestId("conference-view-reality")).not.toContainText("No source-backed verified facts established");
      const detailedEvidence = page.getByTestId("button-detailed-evidence");
      if (await detailedEvidence.getAttribute("aria-expanded") !== "true") {
        await detailedEvidence.click();
      }
      await expect(page.locator('[data-testid^="select-classification-"]').first()).toBeDisabled();

      await page.getByTestId("tab-transmission").click();
      if (slug === "stargate-abilene") {
        await expect(page.getByTestId("conference-primary-case")).toContainText("9.1% IRR");
        await expect(page.getByTestId("canonical-financial-not-modeled")).toHaveCount(0);
      } else {
        await expect(page.getByTestId("canonical-financial-not-modeled")).toContainText("Not modeled");
        await expect(page.getByTestId("canonical-financial-required-inputs")).toContainText("Approved transaction price and capital structure");
        await expect(page.getByTestId("conference-view-transmission")).not.toContainText("-16.7%");
        await expect(page.getByTestId("conference-view-transmission")).not.toContainText("9.1% IRR");
        await expect(page.getByTestId("conference-view-transmission")).not.toContainText("13.3% IRR");
      }

      await page.getByTestId("tab-advisor").click();
      if (slug === "stargate-abilene") {
        await expect(page.getByTestId("advisor-primary-case")).toContainText("9.1% IRR");
      } else {
        await expect(page.getByTestId("advisor-primary-case")).toContainText("NOT MODELED");
        await expect(page.getByTestId("advisor-primary-case")).not.toContainText("-16.7%");
      }
    });
  }

  test("switching dossiers replaces identity and never restores stale Kilby directory facts", async ({ page }) => {
    await page.goto("/#analysis");
    const selector = page.getByTestId("canonical-dossier-select");
    await selector.selectOption("stargate-abilene");
    await selector.selectOption("project-kilby");
    await expect(page.getByTestId("market-selected-project-identity")).toContainText("Reeves County, West Texas");
    await expect(page.getByTestId("conference-view-market")).not.toContainText("Public location not disclosed");
    await selector.selectOption("microsoft-el-mirage");
    await expect(page.getByTestId("conference-summary")).toContainText("CenterPoint Logistics Park");
    await expect(page.getByTestId("conference-view-market")).not.toContainText("Project Kilby appears in current market context");
  });

  test("Stargate canonical navigation renders every financial view without missing driver metadata", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/#analysis");
    await page.getByTestId("canonical-dossier-select").selectOption("stargate-abilene");
    await page.getByTestId("tab-transmission").click();
    const stressModel = page.getByRole("button", { name: /Illustrative Project Stress Test/i });
    if (await stressModel.getAttribute("aria-expanded") !== "true") await stressModel.click();

    await expect(page.getByTestId("impact-chain-baseline-irr")).toHaveText("13.3%");
    await expect(page.getByTestId("impact-chain-stress-irr")).toHaveText("9.1%");

    for (const tab of ["Overview", "Key Drivers", "Cash Flows", "Assumptions"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true");
    }

    await expect(page.getByTestId("conference-view-transmission")).toContainText("BLOCKED");
    expect(pageErrors.filter((message) => message !== "WebSocket closed without opened.")).toEqual([]);
  });
});