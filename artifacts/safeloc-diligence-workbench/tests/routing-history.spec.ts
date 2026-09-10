import { expect, test, type Page } from "@playwright/test";

async function openAnalysisView(page: Page, view: "market" | "reality" | "transmission" | "advisor") {
  await page.goto("/#analysis");
  await page.getByTestId(`tab-${view}`).click();
  await expect(page.getByTestId(`tab-${view}`)).toHaveAttribute("aria-selected", "true");
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
}

test.describe("hash routing and browser history", () => {
  test("supports the current direct routes and normalizes invalid hashes", async ({ page }) => {
    for (const view of ["market", "reality", "transmission", "advisor"] as const) {
      await openAnalysisView(page, view);
      await expect(page).toHaveTitle("SafeLoc · Analysis");
      await expect(page.getByTestId("analysis-workbench")).toBeVisible();
      await expect(page.getByTestId(`conference-view-${view}`)).toBeVisible();
    }

    await page.goto("/");
    await expect(page).toHaveTitle("SafeLoc · Home");
    await expect(page.getByTestId("home-hero-heading")).toBeVisible();
    await page.goto("/#not-a-screen");
    await expect(page).toHaveURL(/#home$/);
    await expect(page.getByTestId("home-hero-heading")).toBeVisible();
  });

  test("keeps the four analysis views navigable without mounting retired pages", async ({ page }) => {
    await openAnalysisView(page, "market");
    await expect(page.getByTestId("conference-view-market")).toBeVisible();
    await page.getByTestId("tab-reality").click();
    await expect(page.getByTestId("conference-view-reality")).toBeVisible();
    await page.getByTestId("button-detailed-evidence").click();
    await expect(page.getByTestId("text-evidence-count")).toBeVisible();
    await page.getByTestId("tab-transmission").click();
    await expect(page.getByTestId("conference-view-transmission")).toBeVisible();
    await page.getByTestId("tab-advisor").click();
    await expect(page.getByTestId("conference-view-advisor")).toBeVisible();
    await expect(page.getByTestId("analysis-section-overview")).toHaveCount(0);
  });

  test("frames financial transmission as an explicit illustrative scenario", async ({ page }) => {
    await openAnalysisView(page, "transmission");
    await expect(page.getByTestId("conference-view-transmission")).toBeVisible();
    const scenarioButton = page.getByTestId("button-opt-in-scenario");
    if (await scenarioButton.count()) {
      await scenarioButton.click();
    }
    await expect(page.locator('[data-testid="financial-transmission-model"], [data-testid="financial-inputs-updating"]')).toBeVisible();
    await expect(page.locator("body")).toContainText(/illustrative|synthetic/i);
  });

  test("keeps the evidence and advisor views readable at configured browser sizes", async ({ page }) => {
    await openAnalysisView(page, "reality");
    await expect(page.getByTestId("conference-view-reality")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByTestId("tab-advisor").click();
    await expect(page.getByTestId("conference-view-advisor")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("opens and returns from the editorial tour", async ({ page }) => {
    await page.goto("/#how-it-works");
    await expect(page).toHaveTitle("SafeLoc · How It Works");
    await expect(page.getByTestId("tour-sri-context")).toBeVisible();
    await page.getByTestId("button-return-workbench-top").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("tab-market")).toHaveAttribute("aria-selected", "true");
  });

  test("keeps editorial route framing and the AI chain available", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("home-hero-heading")).toBeVisible();
    await page.goto("/#value-chain");
    await expect(page.getByTestId("value-chain-stages")).toBeVisible();
    await expect(page.getByTestId("value-chain-stage-data-center-infrastructure")).toContainText("YOU ARE HERE");
    await page.getByTestId("button-value-chain-return-hero").click();
    await expect(page).toHaveURL(/#analysis$/);
  });

  test("preserves browser history across the maintained top-level routes", async ({ page }) => {
    await page.goto("/#analysis");
    if (await page.getByTestId("button-open-menu").isVisible()) {
      await page.getByTestId("button-open-menu").click();
      await page.getByTestId("mobile-navigate-value-chain").click();
    } else {
      await page.getByTestId("button-open-value-chain").click();
    }
    await expect(page).toHaveURL(/#value-chain$/);
    await page.goBack();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("analysis-workbench")).toBeVisible();
    await page.goto("/#how-it-works");
    await page.getByTestId("button-return-workbench-bottom").click();
    await expect(page).toHaveURL(/#analysis$/);
  });

  test("opens the maintained tour through mobile navigation", async ({ page }) => {
    const menu = page.getByTestId("button-open-menu");
    if (!(await menu.isVisible())) return;
    await page.goto("/#analysis");
    await menu.click();
    await expect(page.getByTestId("mobile-navigation")).toBeVisible();
    await page.getByTestId("mobile-navigate-how-it-works").click();
    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page.getByTestId("tour-sri-context")).toBeVisible();
  });
});