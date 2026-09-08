import { expect, test } from "@playwright/test";

test.describe("Financial Impact Chain", () => {
  test("opens on the live marginal chain with a baseline/stress cash-flow comparison", async ({ page }) => {
    await page.goto("/#materiality");

    await expect(page.getByTestId("panel-impact-chain")).toBeVisible();
    await expect(page.getByTestId("impact-chain-baseline-irr")).toContainText("%");
    await expect(page.getByTestId("impact-chain-stress-irr")).toContainText("%");
    await expect(page.getByTestId("impact-chain-evidence-gap")).toContainText("gap");
    await expect(page.getByTestId("cash-flow-comparison-y0")).toContainText("Close / Year 0");
    await expect(page.getByTestId("cash-flow-comparison-y5")).toBeVisible();
    await expect(page.getByTestId("metric-project-irr")).toBeVisible();

    await page.getByRole("button", { name: "Stress Waterfall" }).click();
    await expect(page.getByTestId("panel-impact-chain")).toBeHidden();
    await expect(page.getByTestId("panel-irr-waterfall")).toBeVisible();
    await expect(page.getByTestId("waterfall-methodology")).toContainText("weaker evidence");

    await page.getByRole("button", { name: "Full Assumptions" }).click();
    await expect(page.getByTestId("disclosure-full-model-detail")).toHaveAttribute("open", "");
    await page.getByRole("button", { name: "Stress Waterfall" }).click();
    await expect(page.getByTestId("panel-irr-waterfall")).toBeVisible();
    await expect(page.getByRole("button", { name: "Stress Waterfall" })).toHaveAttribute("aria-pressed", "true");
  });

  test("drawer explains marginal treatment and reclassification updates the chain", async ({ page }) => {
    await page.goto("/#materiality");
    const row = page.getByTestId("impact-chain-row-electricity_cost");
    await expect(row).toContainText("User Assumption");
    await row.getByTestId("button-trace-impact-chain-electricity_cost").click();

    const drawer = page.getByTestId("context-drawer");
    await expect(drawer).toContainText("Baseline treatment");
    await expect(drawer).toContainText("Current treatment");
    await expect(drawer).toContainText("Marginal dollar impact");
    await expect(drawer).toContainText("Recurring annual line effect (excludes exit)");
    await expect(drawer).toContainText("higher cost");
    await page.keyboard.press("Escape");

    await page.goto("/#evidence");
    await page.getByTestId("row-evidence-electricity_cost").locator("summary").first().click();
    await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
    await page.goto("/#materiality");
    await expect(page.getByTestId("impact-chain-row-electricity_cost")).toContainText("Missing");
  });

  test("decision consequences and advisor transmission preserve role boundaries", async ({ page }) => {
    await page.goto("/#decision");
    await expect(page.getByTestId("decision-consequence-register")).toBeVisible();
    await expect(page.getByTestId("decision-consequence-water_rights")).toContainText("no direct modeled adjustment");
    await expect(page.getByTestId("decision-consequence-site_hazard_exposure")).toContainText("modeled treatment: Model Inference");

    await page.goto("/#advisor");
    await expect(page.getByTestId("advisor-transmission-bridge")).toBeVisible();
    await expect(page.getByTestId("advisor-bridge-project-model")).toContainText("stress");
    await expect(page.getByTestId("advisor-bridge-public-context")).toContainText("Public-source context");
    await expect(page.getByTestId("advisor-bridge-analyst-scenario")).toContainText("Do not convert");
  });
});