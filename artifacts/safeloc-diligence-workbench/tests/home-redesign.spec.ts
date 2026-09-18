import { expect, test } from "@playwright/test";

test.describe("compact conference Home", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#home");
  });

  test("foregrounds the reviewed dossier set and keeps exploration secondary", async ({ page }) => {
    await expect(page.getByTestId("home-hero-heading")).toHaveText(
      "Review the evidence behind major AI data-center projects.",
    );
    await expect(page.getByText("Growth for Impact Conference · SafeLoc")).toBeVisible();
    await expect(page.getByTestId("button-run-stargate")).toHaveText(/Open Stargate Abilene/i);
    await expect(page.getByText(/Reviewed dossier · evidence as of Sep 30, 2025/i)).toBeVisible();
    await expect(page.getByTestId("home-dossier-stargate-abilene")).toBeVisible();
    await expect(page.getByTestId("home-dossier-project-kilby")).toContainText("Not modeled");
    await expect(page.getByTestId("home-dossier-microsoft-el-mirage")).toContainText("Not modeled");

    const exploration = page.getByTestId("home-explore-panel");
    await expect(exploration).toHaveAttribute("open", "");
    await expect(page.locator("[data-testid^='company-card-']")).toHaveCount(6);
    await expect(page.locator("[data-testid^='company-card-']").first()).toBeVisible();
    await expect(page.getByTestId("button-reset-default")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("labels custom research Beta and reveals all secondary exploration paths on request", async ({ page }) => {
    const exploration = page.getByTestId("home-explore-panel");
    await expect(exploration).toHaveAttribute("open", "");
    await expect(page.locator("[data-testid^='company-card-']")).toHaveCount(6);
    await expect(page.getByRole("button", { name: /Custom project research Beta/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Browse the facility directory" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View the AI Chain" })).toBeVisible();

    const customTrigger = page.getByTestId("button-analyze-another-project");
    await customTrigger.click();
    const dialog = page.getByTestId("custom-project-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/browser's local session/i)).toBeVisible();
    await expect(dialog.getByText(/local-server registry/i)).toBeVisible();
    await page.getByTestId("button-close-custom-project").click();
    await expect(dialog).toHaveCount(0);
    await expect(customTrigger).toBeFocused();
  });

  test("opens the curated Oracle relationship directly into Market Exposure", async ({ page }) => {
    await page.getByTestId("button-run-stargate").click();
    await expect(page).toHaveURL(/#analysis\/stargate-abilene$/);
    await expect(page.getByTestId("conference-view-market")).toBeVisible();
    await expect(page.getByTestId("tab-market")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("market-company")).toContainText("Oracle");
    await expect(page.getByTestId("market-exposure-chain")).toBeVisible();
    await expect(page.getByTestId("market-relationship-evidence")).toBeVisible();
  });

  test("reveals and closes a supported company exploration", async ({ page }) => {
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