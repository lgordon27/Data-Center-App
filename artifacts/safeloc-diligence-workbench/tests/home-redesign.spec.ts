import { expect, test } from "@playwright/test";

test.describe("SafeLoc product-first Home", () => {
  test("keeps public navigation compact and removes the old launch-brief hierarchy", async ({ page }) => {
    await page.goto("/#home");

    await expect(page.getByTestId("home-hero-heading")).toBeVisible();
    await expect(page.getByTestId("home-stargate-preview")).toBeVisible();
    await expect(page.getByTestId("home-entry-paths")).toContainText("One evidence engine. Two ways to begin.");
    await expect(page.getByTestId("home-governed-ai")).toBeVisible();
    await expect(page.getByTestId("home-trust-strip")).toBeVisible();
    await expect(page.getByRole("banner").getByTestId("button-home-value-chain")).toContainText("The AI Chain");
    await expect(page.getByRole("banner").getByTestId("button-home-directory")).toContainText("Facility Directory");
    await expect(page.getByTestId("button-home-analyze-project")).toContainText("Analyze a Project");
    await expect(page.getByTestId("button-reset-default")).toHaveCount(0);
    await expect(page.getByText("Launch brief · 2026")).toHaveCount(0);
    await expect(page.locator("[data-testid='button-analyze-stargate']")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("reveals holding context and restores focus after the existing project dialog", async ({ page }) => {
    await page.goto("/#home");

    await page.getByTestId("button-start-nvidia").click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: "NVIDIA AI Infrastructure Exposure" })).toBeVisible();
    await expect(page.getByTestId("company-connection-note")).toContainText("not the magnitude of financial exposure");
    await expect(page.getByTestId("home-company-announcement")).toContainText("NVIDIA holding context selected");

    const trigger = page.getByTestId("button-analyze-another-project");
    await trigger.focus();
    await trigger.click();
    const dialog = page.getByTestId("custom-project-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("button-close-custom-project")).toBeFocused();
    await page.getByTestId("button-close-custom-project").click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("routes the two directory links without creating another analysis form", async ({ page }) => {
    await page.goto("/#home");
    await expect(page.getByTestId("home-project-path")).toBeVisible();
    await expect(page.getByTestId("home-custom-analysis")).toHaveCount(0);

    await page.getByTestId("button-browse-texas-facilities").click();
    await expect(page).toHaveURL(/#directory$/);
    await expect(page.getByTestId("compute-atlas-page")).toBeVisible();
  });
});