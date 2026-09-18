import { expect, test } from "@playwright/test";

const currentViews = [
  ["market-exposure", "market", "Market Exposure"],
  ["project-reality", "reality", "Project Reality"],
  ["financial-transmission", "transmission", "Financial Transmission"],
  ["advisor-brief", "advisor", "Advisor Brief"],
] as const;

test.describe("Batch 2 advisor tour and AI Chain", () => {
  test("presents the concise four-stage tour with collapsed methodology", async ({ page }) => {
    await page.goto("/#how-it-works");

    await expect(page.getByRole("heading", { name: /See how an infrastructure constraint could become an investment question/i })).toBeVisible();
    await expect(page.getByText(/Start with a documented company–project relationship/)).toBeVisible();
    await expect(page.getByTestId("button-open-stargate-demonstration")).toHaveText(/Open the reviewed Stargate dossier/);
    await expect(page.locator("[data-testid^='tour-stage-'] h3")).toHaveText(currentViews.map(([, , title]) => title));
    await expect(page.getByTestId("tour-stage-project-reality")).toContainText(/provenance.*conflicts.*gaps/i);
    await expect(page.getByTestId("tour-stage-financial-transmission")).toContainText(/Not modeled.*issuer, fund or portfolio returns/i);
    await expect(page.getByTestId("tour-stage-advisor-brief")).toContainText(/Financial Advisor.*Asset Manager/i);

    const stageTour = page.getByTestId("tour-stage-market-exposure").locator("..");
    await expect(stageTour).not.toContainText("Project Overview");
    await expect(stageTour).not.toContainText("Financial Impact");
    await expect(stageTour).not.toContainText("Decision");
    await expect(stageTour).not.toContainText("Advisor Lens");

    for (const id of ["classification", "sources", "freshness", "financial-model", "ai-research", "market-context", "builder"]) {
      await expect(page.getByTestId(`tour-disclosure-${id}`)).not.toHaveAttribute("open", "");
    }
    const viewportHeight = page.viewportSize()?.height ?? 900;
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    if ((page.viewportSize()?.width ?? 1280) >= 1024) {
      expect(pageHeight).toBeLessThanOrEqual(viewportHeight * 3);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const sourceDisclosure = page.getByTestId("tour-disclosure-sources");
    await sourceDisclosure.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(sourceDisclosure).toHaveAttribute("open", "");
    await expect(sourceDisclosure.getByRole("heading", { name: "Data Sources" })).toBeVisible();
  });

  test("opens every current analysis tab and moves focus to it", async ({ page }) => {
    for (const [stageId, tabId] of currentViews) {
      await page.goto("/#how-it-works");
      await page.getByTestId(`button-open-tour-stage-${stageId}`).click();
      await expect(page).toHaveURL(/#analysis$/);
      const tab = page.getByTestId(`tab-${tabId}`);
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(tab).toBeFocused();
    }
  });

  test("opens the reviewed PostgreSQL Stargate dossier with Oracle selected", async ({ page }) => {
    await page.goto("/#how-it-works");
    await page.getByTestId("button-open-stargate-demonstration").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("conference-summary")).toContainText("Oracle · Infrastructure review");
    await expect(page.getByTestId("conference-summary")).toContainText("Stargate Abilene");
    await expect(page.getByTestId("tab-market")).toHaveAttribute("aria-selected", "true");
  });

  test("keeps all seven stages, opens infrastructure first, and expands one stage at a time", async ({ page }) => {
    await page.goto("/#value-chain");
    await expect(page.getByRole("heading", { name: /Follow AI demand from chips to client portfolios/i })).toBeVisible();
    await expect(page.getByTestId("value-chain-stages").locator(":scope > li")).toHaveCount(7);

    const infrastructure = page.getByTestId("value-chain-stage-data-center-infrastructure").locator(":scope > details");
    await expect(infrastructure).toHaveAttribute("open", "");
    await expect(page.getByTestId("value-chain-stage-chip-fabrication").locator(":scope > details")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("value-chain-stage-chip-design").locator(":scope > details")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("value-chain-stage-hyperscaler-procurement").locator(":scope > details")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("value-chain-stage-ai-model-deployment").locator(":scope > details")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("value-chain-stage-ai-governance-regulation").locator(":scope > details")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("value-chain-stage-client-facing-ai-applications").locator(":scope > details")).not.toHaveAttribute("open", "");

    await expect(infrastructure).toContainText("Project-level evidence does not automatically establish issuer or portfolio materiality.");
    const infrastructureCitation = infrastructure.getByTestId("claim-citation-stargate-cancellation");
    await expect(infrastructureCitation).toBeVisible();
    await infrastructureCitation.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(infrastructureCitation.locator("a").first()).toBeVisible();
    await expect(infrastructureCitation.locator("a").first()).toHaveAttribute("href", /^https:\/\//);

    const chipDesign = page.getByTestId("value-chain-stage-chip-design").locator(":scope > details");
    await chipDesign.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(chipDesign).toHaveAttribute("open", "");
    await expect(infrastructure).not.toHaveAttribute("open", "");
    await expect(chipDesign).toContainText("NVIDIA · AMD · Broadcom");
    await expect(chipDesign.getByTestId("claim-citation-fund-usxf")).toBeVisible();

    await expect(page.getByText("Investors evaluating AI exposure increasingly need to understand the physical infrastructure and community conditions beneath public-company growth assumptions.")).toHaveCount(1);
    await expect(page.getByText("A documented infrastructure relationship is a starting point for diligence, not proof of security-level or fund-level materiality.")).toHaveCount(1);
    await expect(page.getByTestId("value-chain-supporting-context")).not.toHaveAttribute("open", "");
    const workflow = page.getByTestId("value-chain-evidence-workflow");
    await expect(workflow).toContainText("Candidate discovery");
    await expect(workflow).toContainText("Exact-project identity");
    await expect(workflow).toContainText("Bounded passages");
    await expect(workflow).toContainText("Human acceptance");
    await expect(workflow).toContainText("Eligible model inputs");
    await expect(workflow).toContainText("Financial Advisor and Asset Manager outputs");
    await expect(workflow).toContainText("AI does not automatically create verified facts, accepted inputs or investment conclusions.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});