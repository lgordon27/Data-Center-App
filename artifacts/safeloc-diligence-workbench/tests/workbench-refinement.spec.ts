import { expect, test } from "@playwright/test";

test.describe("institutional workbench refinement", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#analysis");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test("context drawer opens from a source excerpt and Escape returns focus to the trigger", async ({ page }) => {
    await page.goto("/#evidence");
    const row = page.getByTestId("row-evidence-water_rights");
    await row.locator("summary").first().click();
    const trigger = page.getByTestId("button-view-source-water_rights");
    await trigger.click();
    const drawer = page.getByTestId("context-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("View Source");
    await expect(drawer).toContainText("Water Rights");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("only one evidence row expands at a time and filters stay honest", async ({ page }) => {
    await page.goto("/#evidence");
    await page.getByTestId("row-evidence-water_rights").locator("summary").first().click();
    await expect(page.getByTestId("row-evidence-water_rights")).toHaveJSProperty("open", true);
    await page.getByTestId("row-evidence-electricity_cost").locator("summary").first().click();
    await expect(page.getByTestId("row-evidence-electricity_cost")).toHaveJSProperty("open", true);
    await expect(page.getByTestId("row-evidence-water_rights")).toHaveJSProperty("open", false);
    await page.getByTestId("filter-evidence-material-gaps").click();
    await expect(page.getByTestId("evidence-filtered-list")).toBeVisible();
    await expect(page.getByTestId("row-evidence-water_rights")).toBeVisible();
    await page.getByTestId("filter-evidence-all").click();
    await expect(page.getByTestId("evidence-filtered-list")).toBeHidden();
  });

  test("guided action leads to a focused approval queue with distinct decisions", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Agent review flow only needs one browser viewport.");

    await expect(page.getByTestId("analysis-summary-rail").getByTestId("guided-next-step")).toBeVisible();
    await page.getByTestId("button-run-diligence-agent").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review ready", { timeout: 5_000 });
    await expect(page.getByTestId("agent-results-summary")).toBeVisible();

    await page.getByTestId("button-review-proposed-findings").click();
    const reviewHeading = page.locator("#agent-review-heading");
    await expect(reviewHeading).toBeInViewport();
    await expect(reviewHeading).toBeFocused();

    await page.getByTestId("agent-decision-agent-finding-grid-accepted").click();
    await expect(page.getByTestId("agent-finding-agent-finding-grid")).toContainText("Accepted");

    await page.getByTestId("button-agent-finding-details-agent-finding-grid").click();
    const drawer = page.getByTestId("context-drawer");
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // Return metrics stay untouched until a human approves a reclassification.
    await page.goto("/#materiality");
    await expect(page.getByTestId("metric-project-irr")).toBeVisible();
  });

  test("lens selector shows one investment lens at a time", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Lens selector only needs one browser viewport.");

    await page.getByTestId("button-run-diligence-agent").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review ready", { timeout: 5_000 });
    await expect(page.getByTestId("agent-lenses")).toBeVisible();

    await page.getByTestId("agent-lens-tab-project-investor").click();
    await expect(page.getByTestId("agent-lens-tab-project-investor")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("agent-lens-panel")).toContainText("Project Investor");

    await page.getByTestId("agent-lens-tab-asset-manager").click();
    await expect(page.getByTestId("agent-lens-panel")).toContainText("Asset Manager");

    await page.getByTestId("agent-lens-tab-financial-advisor").click();
    await expect(page.getByTestId("agent-lens-panel")).toContainText("Financial Advisor");
  });

  test("entering from the NVIDIA flow defaults the lens selector to Financial Advisor", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Lens default only needs one browser viewport.");

    await page.goto("/");
    await page.getByTestId("button-start-nvidia").click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    await page.getByTestId("company-project-open-curated-stargate-nvidia").click();
    await expect(page).toHaveURL(/#analysis$/);

    await page.getByTestId("button-run-diligence-agent").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review ready", { timeout: 5_000 });
    await expect(page.getByTestId("agent-lens-tab-financial-advisor")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("agent-lens-panel")).toContainText("no trading recommendation");
  });

  test("financial trace opens in the drawer from an evidence-adjusted input", async ({ page }) => {
    await page.goto("/#materiality");
    const trigger = page.getByTestId("button-trace-materiality-electricity_cost");
    await trigger.click();
    const drawer = page.getByTestId("context-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Financial Effect trace");
    await expect(drawer).toContainText("Approving action");
    await page.getByTestId("button-close-context-drawer").click();
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("a materiality-row trace reports the row's own sensitivity when inputs interact", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Numerical trace regression needs a single viewport run.");

    // Interacting inputs: grid interconnection and the build timeline both feed
    // revenue timing, so waterfall attribution and single-input sensitivity diverge.
    await page.goto("/#evidence");
    await page.getByTestId("row-evidence-grid_interconnection").locator("summary").first().click();
    await page.getByTestId("select-classification-grid_interconnection").selectOption("Management Assertion");
    await page.getByTestId("row-evidence-permitting_timeline").locator("summary").first().click();
    await page.getByTestId("select-classification-permitting_timeline").selectOption("User Assumption");

    await page.goto("/#materiality");
    const rowEffect = (await page.getByTestId("materiality-impact-grid_interconnection").textContent())?.trim();
    expect(rowEffect).toBeTruthy();

    await page.getByTestId("button-trace-materiality-grid_interconnection").click();
    const drawer = page.getByTestId("context-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Single-input sensitivity");
    await expect(drawer.getByTestId("trace-effect-grid_interconnection")).toContainText(rowEffect ?? "");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // The waterfall trace is explicitly labeled as sequential attribution.
    await page.getByRole("button", { name: "Stress Waterfall" }).click();
    await page.getByTestId("button-trace-grid_interconnection").click();
    await expect(drawer).toContainText("Sequential attribution");
    await expect(drawer.getByTestId("trace-seq-effect-grid_interconnection")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("typed relationship chain links open their evidence in the drawer", async ({ page }) => {
    await page.goto("/#advisor");
    await page.getByTestId("exposure-link-1").click();
    const drawer = page.getByTestId("context-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Ownership");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    await page.getByTestId("exposure-link-5").click();
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("No Direct Public Agreement Located");
    await page.keyboard.press("Escape");
  });

  test("opening and closing the desktop drawer preserves the reviewer's scroll position", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Desktop overlay regression needs the desktop viewport.");

    await page.goto("/#evidence");
    const row = page.getByTestId("row-evidence-water_rights");
    await row.locator("summary").first().click();
    const trigger = page.getByTestId("button-view-source-water_rights");
    await trigger.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await trigger.click();
    await expect(page.getByTestId("context-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("context-drawer")).toBeHidden();

    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(4);
    await expect(trigger).toBeFocused();
    await expect(trigger).toBeInViewport();
  });

  test("keyboard Tab and Shift+Tab stay trapped inside the open drawer", async ({ page }) => {
    await page.goto("/#evidence");
    const row = page.getByTestId("row-evidence-water_rights");
    await row.locator("summary").first().click();
    await page.getByTestId("button-view-source-water_rights").click();
    const drawer = page.getByTestId("context-drawer");
    await expect(drawer).toBeVisible();

    const focusIsInsideDrawer = () => page.evaluate(() => {
      const panel = document.querySelector("[data-testid='context-drawer']");
      return panel !== null && panel.contains(document.activeElement);
    });

    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press("Tab");
      expect(await focusIsInsideDrawer()).toBe(true);
    }
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusIsInsideDrawer()).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("resolve navigation reveals a record hidden by the active evidence filter", async ({ page }) => {
    await page.goto("/#evidence");
    await page.getByTestId("filter-evidence-verified").click();
    await expect(page.getByTestId("evidence-filtered-list")).toBeVisible();
    await expect(page.getByTestId("row-evidence-water_rights")).toHaveCount(0);

    await page.getByTestId("button-resolve-water_rights").click();
    await expect(page.getByTestId("filter-evidence-all")).toHaveAttribute("aria-pressed", "true");
    const target = page.getByTestId("row-evidence-water_rights");
    await expect(target).toBeVisible();
    await expect(target).toHaveJSProperty("open", true);
  });
});
