import { expect, test } from "@playwright/test";

test.describe("compact conference Home", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#home");
  });

  test("foregrounds one curated conference walkthrough and keeps exploration secondary", async ({ page }) => {
    await expect(page.getByTestId("home-hero-heading")).toHaveText(
      "Follow the evidence behind an AI data center.",
    );
    await expect(page.getByText("Growth for Impact Conference · SafeLoc")).toBeVisible();
    await expect(page.getByTestId("button-run-stargate")).toHaveText(/Open the Stargate demo/i);
    await expect(page.getByText("Curated public-source case · Oracle relationship · Abilene, Texas")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stargate Abilene" })).toBeVisible();
    await expect(page.getByText("Frame the project")).toBeVisible();
    await expect(page.getByText("Inspect the evidence")).toBeVisible();
    await expect(page.getByText("Review the decision path")).toBeVisible();

    const exploration = page.getByTestId("home-explore-panel");
    await expect(exploration).not.toHaveAttribute("open", "");
    await expect(page.locator("[data-testid^='company-card-']")).toHaveCount(6);
    await expect(page.locator("[data-testid^='company-card-']").first()).toBeHidden();
    await expect(page.getByTestId("button-reset-default")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("labels custom research Beta and reveals all secondary exploration paths on request", async ({ page }) => {
    const exploration = page.getByTestId("home-explore-panel");
    await exploration.locator("summary").click();
    await expect(exploration).toHaveAttribute("open", "");
    await expect(page.locator("[data-testid^='company-card-']")).toHaveCount(6);
    await expect(page.getByRole("button", { name: /Custom project research Beta/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Browse the facility directory" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View the AI Chain" })).toBeVisible();

    const customTrigger = page.getByTestId("button-analyze-another-project");
    await customTrigger.click();
    const dialog = page.getByTestId("custom-project-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/session-only/i)).toBeVisible();
    await page.getByTestId("button-close-custom-project").click();
    await expect(dialog).toHaveCount(0);
    await expect(customTrigger).toBeFocused();
  });

  test("opens the curated Oracle relationship directly into Market Exposure", async ({ page }) => {
    await page.getByTestId("button-run-stargate").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("conference-view-market")).toBeVisible();
    await expect(page.getByTestId("tab-market")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("market-company")).toContainText("Oracle");
    await expect(page.getByTestId("market-exposure-chain")).toBeVisible();
    await expect(page.getByTestId("market-relationship-evidence")).toBeVisible();
  });

  test("reveals and closes a supported company exploration", async ({ page }) => {
    await page.getByTestId("home-explore-panel").locator("summary").click();
    const trigger = page.getByTestId("company-card-nvidia");
    await trigger.click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: "NVIDIA AI Infrastructure Exposure" })).toBeVisible();
    await expect(page.getByTestId("company-connection-note")).toContainText(
      "not the magnitude of financial exposure",
    );
    await page.getByTestId("button-company-back").click();
    await expect(page.getByTestId("company-exposure-view")).toHaveCount(0);
  });
});