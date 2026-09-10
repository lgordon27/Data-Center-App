import { expect, test, type Page } from "@playwright/test";

async function openTransmission(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/#analysis");
  await page.getByTestId("tab-transmission").click();
  await expect(page.getByRole("button", { name: /Illustrative Project Stress Test/i })).toHaveAttribute("aria-expanded", "true");
}

async function expectNoPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    body: document.body.scrollWidth <= window.innerWidth + 1,
    document: document.documentElement.scrollWidth <= window.innerWidth + 1,
  }))).toEqual({ body: true, document: true });
}

test.describe("Batch 3 Financial Transmission", () => {
  test("shows the pathway once in Overview and supports four-view keyboard navigation", async ({ page }) => {
    await openTransmission(page);
    const tabs = page.getByRole("tablist", { name: "Financial transmission views" });
    await expect(tabs.getByRole("tab")).toHaveCount(4);
    await expect(tabs.getByRole("tab").allTextContents()).resolves.toEqual(["Overview", "Key Drivers", "Cash Flows", "Assumptions"]);
    await expect(page.getByTestId("financial-tab-overview")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("impact-chain-baseline-irr")).toContainText("%");
    await expect(page.getByTestId("impact-chain-stress-irr")).toContainText("%");
    await expect(page.getByTestId("panel-impact-chain")).toContainText("Recommendation context");
    await expect(page.getByTestId("transmission-pathway")).toContainText("Real factor");
    await expect(page.getByTestId("transmission-pathway")).toContainText("Potential issuer implication");
    await expect(page.getByTestId("transmission-pathway")).toHaveCount(1);
    await expect(page.getByTestId("panel-impact-chain")).not.toContainText("Baseline equity CF");

    await page.getByTestId("financial-tab-overview").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("financial-tab-key-drivers")).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByTestId("financial-tab-assumptions")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByTestId("financial-tab-overview")).toBeFocused();

    for (const tab of ["Key Drivers", "Cash Flows", "Assumptions"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByTestId("transmission-pathway")).toHaveCount(0);
    }
  });

  test("promotes exactly five drivers and keeps truthful minor effects traceable", async ({ page }) => {
    await openTransmission(page);
    await page.getByRole("tab", { name: "Key Drivers" }).click();
    const rows = page.locator("[data-testid^='impact-chain-row-']");
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText(/Lower return|Higher return/);
    await expect(rows.first()).toContainText(/Verified|Management|Inference|Assumption|Missing/);
    const additional = page.getByTestId("disclosure-additional-minor-effects");
    await expect(additional).not.toHaveAttribute("open", "");
    await additional.locator(":scope > summary").click();
    const minorRows = additional.locator("[data-testid^='minor-impact-row-']");
    await expect(minorRows.first()).toBeVisible();
    await expect(minorRows.filter({ hasText: "No adjustment at current classification" }).first()).toBeVisible();
    await expect(minorRows.filter({ hasText: "nonzero, below prominent-display materiality" }).first()).toBeVisible();
    await expect(additional.locator("[data-testid^='button-trace-minor-']")).toHaveCount(await minorRows.count());

    const electricity = page.getByTestId("row-materiality-electricity_cost");
    await expect(electricity).toContainText(/\/MWh/);
    await expect(electricity).not.toContainText(/\$[0-9.]+M/);

    const modeledTreatment = page.getByTestId("driver-treatment-site_hazard_exposure");
    await expect(modeledTreatment).toContainText("Evidence: Verified Evidence");
    await expect(modeledTreatment).toContainText("Modeled as: Model Inference");
    await expect(modeledTreatment).toContainText("Reason:");

    await page.getByRole("tab", { name: "Assumptions" }).click();
    await expect(page.getByTestId("model-electricity-attribution")).toContainText(/\/MWh/);
    await expect(page.getByTestId("model-electricity-attribution")).not.toContainText(/\$[0-9.]+M/);
    await expect(page.getByTestId("financial-panel-assumptions")).toContainText("not reported");
  });

  test("keeps cash-flow density inside its own responsive view", async ({ page }) => {
    await openTransmission(page);
    await page.getByRole("tab", { name: "Cash Flows" }).click();
    await expect(page.getByTestId("metric-project-irr")).toBeVisible();
    await expect(page.getByTestId("metric-moic")).toBeVisible();
    await expect(page.getByTestId("metric-npv")).toContainText("−$");
    await expect(page.getByTestId("metric-npv")).toContainText("Value relative to 10% discount rate");
    await expect(page.getByTestId("metric-npv")).not.toContainText("value created");
    await expect(page.getByTestId("cash-flow-comparison-y0")).toContainText("Close / Year 0");
    await expect(page.getByTestId("cash-flow-comparison-y5")).toContainText("Operations, exit proceeds and debt repayment");
    await expect(page.locator("caption").filter({ hasText: "Five-year annual project cash-flow schedule in millions of dollars" })).toBeAttached();
    await expectNoPageOverflow(page);
  });

  test("moves focus after every financial Next action", async ({ page }) => {
    await openTransmission(page);
    await page.getByTestId("financial-next-key-drivers").click();
    await expect(page.getByTestId("financial-tab-key-drivers")).toBeFocused();
    await page.getByTestId("financial-next-cash-flows").click();
    await expect(page.getByTestId("financial-tab-cash-flows")).toBeFocused();
    await page.getByTestId("financial-next-assumptions").click();
    await expect(page.getByTestId("financial-tab-assumptions")).toBeFocused();
    await page.getByTestId("financial-next-advisor").click();
    await expect(page.getByTestId("tab-advisor")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#conference-panel")).toBeFocused();
  });

  test("keeps every financial view within the page width", async ({ page }) => {
    await openTransmission(page);
    for (const tab of ["Overview", "Key Drivers", "Cash Flows", "Assumptions"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expectNoPageOverflow(page);
    }
  });
});