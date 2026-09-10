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
  test("defaults to a concise conclusion and supports four-view keyboard navigation", async ({ page }) => {
    await openTransmission(page);
    const tabs = page.getByRole("tablist", { name: "Financial transmission views" });
    await expect(tabs.getByRole("tab")).toHaveCount(4);
    await expect(tabs.getByRole("tab").allTextContents()).resolves.toEqual(["Overview", "Key Drivers", "Cash Flows", "Assumptions"]);
    await expect(page.getByTestId("financial-tab-overview")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("impact-chain-baseline-irr")).toContainText("%");
    await expect(page.getByTestId("impact-chain-stress-irr")).toContainText("%");
    await expect(page.getByTestId("panel-impact-chain")).toContainText("Recommendation context");
    await expect(page.getByTestId("panel-impact-chain")).toContainText("Physical constraint");
    await expect(page.getByTestId("panel-impact-chain")).not.toContainText("Baseline equity CF");

    await page.getByTestId("financial-tab-overview").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("financial-tab-key-drivers")).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByTestId("financial-tab-assumptions")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByTestId("financial-tab-overview")).toBeFocused();
  });

  test("ranks traceable drivers, isolates zero effects, and uses energy units", async ({ page }) => {
    await openTransmission(page);
    await page.getByRole("tab", { name: "Key Drivers" }).click();
    const rows = page.locator("[data-testid^='impact-chain-row-']");
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toContainText(/Lower return|Higher return/);
    await expect(rows.first()).toContainText(/Verified|Management|Inference|Assumption|Missing/);
    await expect(page.getByTestId("disclosure-immaterial-drivers")).toContainText("No adjustment at current classification");
    await expect(page.getByTestId("row-materiality-electricity_cost")).toContainText(/\/MWh/);
    await expect(page.getByTestId("row-materiality-electricity_cost")).not.toContainText(/\$[0-9.]+M/);

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
    await expect(page.getByTestId("cash-flow-comparison-y0")).toContainText("Close / Year 0");
    await expect(page.getByTestId("cash-flow-comparison-y5")).toContainText("Operations, exit proceeds and debt repayment");
    await expect(page.locator("caption").filter({ hasText: "Five-year annual project cash-flow schedule in millions of dollars" })).toBeAttached();
    await expectNoPageOverflow(page);
  });
});