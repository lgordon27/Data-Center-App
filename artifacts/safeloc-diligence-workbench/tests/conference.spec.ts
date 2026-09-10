import { expect, test, type Locator, type Page } from "@playwright/test";

const conferenceViews = [
  "market",
  "reality",
  "transmission",
  "advisor",
] as const;
const scenariosKey = "safeloc:diligence:scenarios:v1";

async function expectOnlyConferenceView(page: Page, view: typeof conferenceViews[number]) {
  const mountedViews = page.locator("[data-testid^='conference-view-']");
  await expect(mountedViews).toHaveCount(1);
  await expect(page.getByTestId(`conference-view-${view}`)).toBeVisible();

  for (const candidate of conferenceViews) {
    await expect(page.getByTestId(`tab-${candidate}`)).toHaveAttribute(
      "aria-selected",
      candidate === view ? "true" : "false",
    );
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    body: document.body.scrollWidth <= window.innerWidth + 1,
    document: document.documentElement.scrollWidth <= window.innerWidth + 1,
    main: (() => {
      const main = document.querySelector("main");
      return main ? main.scrollWidth <= main.clientWidth + 1 : false;
    })(),
  }))).toEqual({ body: true, document: true, main: true });
}

async function ensureStressModelOpen(page: Page) {
  const toggle = page.getByRole("button", { name: /Illustrative Project Stress Test/i });
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
}

function exactTestIdPrefix(scope: Locator, prefix: string) {
  return scope.locator(
    `[data-testid^="${prefix}"]:not([data-testid^="${prefix}detail-"])`,
  );
}

test.describe("analysis conference", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/#analysis");
  });

  test("opens on Market Exposure and mounts exactly one main view", async ({ page, viewport }) => {
    await expectOnlyConferenceView(page, "market");
    await expect(page.getByTestId("conference-back")).toBeDisabled();
    await expect(page.getByTestId("conference-next")).toBeEnabled();
    await expectNoHorizontalOverflow(page);

    if (viewport?.width === 1440) {
      const defaultViewHeight = await page.getByTestId("conference-view-market").evaluate(
        (element) => element.getBoundingClientRect().height,
      );
      expect(defaultViewHeight).toBeLessThanOrEqual((viewport?.height ?? 900) * 2.1);
    }
  });

  test("supports direct tabs and sequential conference navigation without retaining old views", async ({ page }) => {
    for (const view of conferenceViews) {
      await page.getByTestId(`tab-${view}`).click();
      await expectOnlyConferenceView(page, view);
      await expectNoHorizontalOverflow(page);
    }

    await expect(page.getByTestId("conference-next")).toBeDisabled();
    await page.getByTestId("conference-back").click();
    await expectOnlyConferenceView(page, "transmission");
    await page.getByTestId("conference-back").click();
    await expectOnlyConferenceView(page, "reality");
    await page.getByTestId("conference-next").click();
    await expectOnlyConferenceView(page, "transmission");
  });

  test("keeps the conference within a tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();

    for (const view of conferenceViews) {
      await page.getByTestId(`tab-${view}`).click();
      await expectOnlyConferenceView(page, view);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("keeps project reality cited and transmission conclusions at project level", async ({ page }) => {
    await page.getByTestId("tab-reality").click();
    const reality = page.getByTestId("conference-view-reality");
    await expect(reality).toContainText("Stargate Abilene");
    const power = reality.getByTestId("reality-category-power");
    await power.locator(":scope > summary").click();
    const grid = power.locator("article").filter({ hasText: "Grid Interconnection Timeline" });
    await expect(grid).toContainText(/grid delays exceeded 12 months/i);
    await expect(grid.getByTestId("claim-citation-stargate-cancellation")).toBeVisible();

    const water = reality.getByTestId("reality-category-water");
    await water.locator(":scope > summary").click();
    const waterRights = water.locator("article").filter({ hasText: "Local Water Rights & Allocation" });
    await expect(waterRights).toContainText(/not disclosed/i);
    await expect(waterRights.getByTestId("claim-citation-unresolved-water")).toBeVisible();

    const climate = reality.getByTestId("reality-category-climate");
    await climate.locator(":scope > summary").click();
    const hazard = climate.locator("article").filter({ hasText: "Site Hazard Exposure Profile" });
    await expect(hazard).toContainText(/FEMA/i);
    await expect(hazard.getByTestId("claim-citation-fema-taylor-county")).toBeVisible();

    await page.getByTestId("tab-transmission").click();
    const transmission = page.getByTestId("conference-view-transmission");
    await expect(transmission).toContainText(/project|facility/i);
    await expect(transmission).not.toContainText(/\b(?:HIGH|MODERATE|LOW)\b/);
    await expect(transmission).not.toContainText(/fund-level (?:risk|conclusion|rating)/i);
  });

  test("closes every model output with the stress disclosure and keyboard navigation", async ({ page }) => {
    await expect(page.getByTestId("live-current-irr")).toHaveCount(0);
    await page.getByTestId("tab-transmission").click();
    const toggle = page.getByRole("button", { name: /Illustrative Project Stress Test/i });
    await page.getByTestId("rail-compare-scenarios").click();
    await expect(page.getByTestId("conference-scenarios")).toBeVisible();
    await toggle.click();
    await expect(page.getByTestId("conference-scenarios")).toHaveCount(0);
    await expect(page.getByTestId("metric-project-irr")).toHaveCount(0);
    await expect(page.getByTestId("live-current-irr")).toHaveCount(0);
    await toggle.click();
    await page.getByTestId("rail-compare-scenarios").click();
    await page.getByTestId("tab-transmission").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("tab-advisor")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("conference-scenarios")).toHaveCount(0);
    await expect(page.getByTestId("live-current-irr")).toHaveCount(1);
  });

  test("delivers a one-page Advisor Brief with three manager questions and one action", async ({ page, viewport }) => {
    await page.getByTestId("tab-advisor").click();
    const brief = page.getByTestId("conference-view-advisor");
    await expect(brief).toContainText("Advisor Brief");

    await expect(exactTestIdPrefix(brief, "advisor-manager-question-")).toHaveCount(3);
    await expect(brief.getByTestId("advisor-recommended-action")).toHaveCount(1);
    await expect(brief).not.toContainText(/\b(?:HIGH|MODERATE|LOW)\b/);

    if (viewport?.width === 1440) {
      const briefHeight = await brief.evaluate((element) => element.getBoundingClientRect().height);
      expect(briefHeight).toBeLessThanOrEqual((viewport?.height ?? 900) * 1.1);
    }
  });

  test("preserves live calculations and session state while moving between conference views", async ({ page }) => {
    await page.getByTestId("tab-transmission").click();
    await ensureStressModelOpen(page);
    await page.getByRole("tab", { name: "Cash Flows" }).click();
    const initialIrr = await page.getByTestId("metric-project-irr").textContent();
    expect(initialIrr).toContain("%");

    await page.getByTestId("tab-reality").click();
    await page.getByRole("button", { name: /Detailed Evidence Record/i }).click();
    await page.getByTestId("filter-evidence-all").click();
    await page.getByTestId("row-evidence-electricity_cost").locator(":scope > summary").click();
    await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
    await expect(page.getByTestId("review-marker-electricity_cost")).toContainText("Reviewed by analyst");

    await page.getByTestId("tab-transmission").click();
    await ensureStressModelOpen(page);
    await page.getByRole("tab", { name: "Cash Flows" }).click();
    await expect(page.getByTestId("metric-project-irr")).not.toHaveText(initialIrr ?? "");
    const recalculatedIrr = await page.getByTestId("metric-project-irr").textContent();

    await page.reload();
    await page.getByTestId("tab-reality").click();
    await page.getByRole("button", { name: /Detailed Evidence Record/i }).click();
    await page.getByTestId("filter-evidence-all").click();
    await page.getByTestId("row-evidence-electricity_cost").locator(":scope > summary").click();
    await expect(page.getByTestId("select-classification-electricity_cost")).toHaveValue("Missing Evidence");
    await page.getByTestId("tab-transmission").click();
    await ensureStressModelOpen(page);
    await page.getByRole("tab", { name: "Cash Flows" }).click();
    await expect(page.getByTestId("metric-project-irr")).toHaveText(recalculatedIrr ?? "");

    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await expectOnlyConferenceView(page, "market");
    await page.getByTestId("tab-reality").click();
    await page.getByRole("button", { name: /Detailed Evidence Record/i }).click();
    await page.getByTestId("filter-evidence-all").click();
    await page.getByTestId("row-evidence-electricity_cost").locator(":scope > summary").click();
    await expect(page.getByTestId("select-classification-electricity_cost")).toHaveValue("User Assumption");
  });

  test("preserves save, compare, rename, and remove behavior in the conference scenario workspace", async ({ page }) => {
    await page.getByTestId("tab-transmission").click();
    await ensureStressModelOpen(page);
    await page.getByTestId("rail-save-scenario").click();
    await expect(page.getByTestId("conference-scenarios")).toBeVisible();

    const saveNamedScenario = async (name: string) => {
      const input = page.getByTestId("input-scenario-name");
      await expect(input).toBeVisible();
      await input.fill(name);
      await page.getByTestId("button-confirm-save-scenario").click();
      await expect(page.getByTestId("text-scenario-feedback")).toContainText(`Scenario “${name}” saved.`);
    };

    await saveNamedScenario("Conference base");
    await page.getByTestId("rail-save-scenario").click();
    await saveNamedScenario("Conference comparison");
    await page.getByTestId("rail-compare-scenarios").click();
    await expect(page.getByTestId("panel-scenario-comparison")).toBeVisible();

    const snapshots = await page.evaluate(
      (key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios,
      scenariosKey,
    );
    expect(snapshots).toHaveLength(2);
    await expect(page.getByTestId("select-scenario-first")).toHaveValue(snapshots[0].id);
    await expect(page.getByTestId("select-scenario-second")).toHaveValue(snapshots[1].id);

    await page.getByTestId("disclosure-saved-scenarios").locator(":scope > summary").click();
    await page.getByTestId(`button-rename-scenario-${snapshots[0].id}`).click();
    await page.getByTestId("input-rename-scenario-name").fill("Conference base renamed");
    await page.getByTestId("button-confirm-rename-scenario").click();
    await expect(page.getByTestId("text-scenario-feedback")).toContainText("Conference base renamed");

    await page.getByTestId(`button-remove-scenario-${snapshots[1].id}`).click();
    await page.getByTestId("button-confirm-remove-scenario").click();
    await expect(page.getByTestId(`scenario-card-${snapshots[1].id}`)).toBeHidden();
    await expect.poll(() => page.evaluate(
      (key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios.map((scenario: { name: string }) => scenario.name),
      scenariosKey,
    )).toEqual(["Conference base renamed"]);
  });
});