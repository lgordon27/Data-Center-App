import { expect, test, type Page } from "@playwright/test";

const routes = [
  ["brief", "Case Brief"],
  ["evidence", "Evidence Room"],
  ["materiality", "Financial Materiality"],
  ["decision", "Decision Review"],
  ["advisor", "Advisor Lens"],
] as const;

async function expectTourLayoutToStayReadable(page: Page, selector: string) {
  const overflow = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);

  const clipped = await page.evaluate((sectionSelector) => {
    const tour = document.querySelector<HTMLElement>(sectionSelector);
    if (!tour) return [`${sectionSelector} is missing`];

    return [tour, ...Array.from(tour.querySelectorAll<HTMLElement>("*"))]
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const clipsContent = [style.overflow, style.overflowX, style.overflowY].some((value) =>
          value === "hidden" || value === "clip",
        );
        return (
          clipsContent &&
          element.getClientRects().length > 0 &&
          Boolean(element.textContent?.trim()) &&
          (element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1)
        );
      })
      .map((element) => element.dataset.testid || element.id || element.tagName.toLowerCase());
  }, selector);
  expect(clipped).toEqual([]);

  const lowContrast = await page.evaluate((sectionSelector) => {
    const parseColor = (value: string) => {
      const channels = value.match(/rgba?\(([^)]+)\)/)?.[1].split(",").map(Number);
      if (!channels || channels.length < 3) return null;
      return {
        red: channels[0],
        green: channels[1],
        blue: channels[2],
        alpha: channels[3] ?? 1,
      };
    };

    const relativeLuminance = (color: { red: number; green: number; blue: number }) =>
      [color.red, color.green, color.blue]
        .map((channel) => channel / 255)
        .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);

    const contrastRatio = (
      foreground: { red: number; green: number; blue: number },
      background: { red: number; green: number; blue: number },
    ) => {
      const foregroundLuminance = relativeLuminance(foreground);
      const backgroundLuminance = relativeLuminance(background);
      return (
        (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
      );
    };

    const blend = (
      foreground: { red: number; green: number; blue: number; alpha: number },
      background: { red: number; green: number; blue: number },
    ) => ({
      red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
      green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
      blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    });

    const tour = document.querySelector<HTMLElement>(sectionSelector);
    if (!tour) return [`${sectionSelector} is missing`];

    const failures: string[] = [];
    for (const element of [tour, ...Array.from(tour.querySelectorAll<HTMLElement>("*"))]) {
      const hasDirectText = Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
      );
      if (!hasDirectText || element.getClientRects().length === 0) continue;

      const foreground = parseColor(window.getComputedStyle(element).color);
      if (!foreground) continue;

      let background = { red: 255, green: 255, blue: 255 };
      const backgrounds: Array<{ red: number; green: number; blue: number; alpha: number }> = [];
      let ancestor: HTMLElement | null = element;
      while (ancestor) {
        const ancestorBackground = parseColor(window.getComputedStyle(ancestor).backgroundColor);
        if (ancestorBackground && ancestorBackground.alpha > 0) {
          backgrounds.push(ancestorBackground);
        }
        ancestor = ancestor.parentElement;
      }
      for (const ancestorBackground of backgrounds.reverse()) {
        background = blend(ancestorBackground, background);
      }

      if (contrastRatio(blend(foreground, background), background) < 4.5) {
        failures.push(
          `${element.dataset.testid || element.id || element.tagName.toLowerCase()} (${window.getComputedStyle(element).color})`,
        );
      }
    }
    return failures;
  }, selector);
  expect(lowContrast).toEqual([]);
}

async function expectPageToStayWithinViewport(page: Page) {
  const overflow = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

async function expectContextNoteToStayReadable(page: Page, noteTestId: string, messageTestId: string) {
  const note = page.getByTestId(noteTestId);
  const message = page.getByTestId(messageTestId);

  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute("role", "note");
  await expectTourLayoutToStayReadable(page, `[data-testid="${noteTestId}"]`);

  const layout = await page.evaluate(({ noteTestId: noteId, messageTestId: messageId }) => {
    const noteElement = document.querySelector<HTMLElement>(`[data-testid="${noteId}"]`);
    const messageElement = document.querySelector<HTMLElement>(`[data-testid="${messageId}"]`);
    if (!noteElement || !messageElement) {
      return { error: `Missing ${noteId} or ${messageId}` };
    }

    const noteBox = noteElement.getBoundingClientRect();
    const messageStyle = window.getComputedStyle(messageElement);
    const lineHeight = Number.parseFloat(messageStyle.lineHeight);
    return {
      noteLeft: noteBox.left,
      noteRight: noteBox.right,
      viewportWidth: window.innerWidth,
      messageClientWidth: messageElement.clientWidth,
      messageScrollWidth: messageElement.scrollWidth,
      messageClientHeight: messageElement.clientHeight,
      messageScrollHeight: messageElement.scrollHeight,
      lineHeight,
      whiteSpace: messageStyle.whiteSpace,
    };
  }, { noteTestId, messageTestId });

  expect(layout).not.toHaveProperty("error");
  if ("error" in layout) return;

  expect(layout.noteLeft).toBeGreaterThanOrEqual(-1);
  expect(layout.noteRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.messageClientWidth).toBeGreaterThan(0);
  expect(layout.messageScrollWidth).toBeLessThanOrEqual(layout.messageClientWidth + 1);
  expect(layout.messageScrollHeight).toBeLessThanOrEqual(layout.messageClientHeight + 1);
  expect(layout.whiteSpace).not.toMatch(/nowrap|pre/);
  expect(layout.messageClientHeight).toBeGreaterThan(layout.lineHeight + 1);
}

test.describe("hash routing and browser history", () => {
  test("supports all direct links and normalizes invalid hashes", async ({ page }) => {
    for (const [route, label] of routes) {
      await page.goto(`/#${route}`);
      await expect(page).toHaveURL(new RegExp(`#${route}$`));
      await expect(page).toHaveTitle(`SafeLoc · ${label}`);
      await expect(page.getByTestId(`button-navigate-${route}`)).toHaveAttribute("aria-current", "step");
      if (route === "brief") {
        await expect(page.getByTestId("section-sri-context")).toContainText("We Helped Build This");
        await expect(page.getByTestId("sri-context-callout")).toContainText("The companies building this infrastructure");
        await expect(page.getByTestId("brief-tier-2-callout")).toContainText("Stargate is a Tier 2 infrastructure project");
        await expect(page.getByTestId("brief-tier-2-callout")).toContainText("Chevron/Microsoft's Project Kilby bypassed the grid");
        await expect(page.getByTestId("brief-tier-2-qualifier")).toHaveText(/public market context only.*not facility-level Stargate evidence.*not a synthetic transaction input/i);
        await expect(page.getByTestId("ercot-batch-zero-context")).toContainText("Batch Zero");
        await expect(page.getByTestId("ercot-batch-zero-context")).toContainText("200 GW across 300 applicants");
        await expect(page.getByTestId("ercot-batch-zero-context")).toContainText("September 2026 start → April 2027 completion");
        await expect(page.getByTestId("ercot-batch-zero-context")).toContainText("January 2027 start minimum, completion unclear");
        await expect(page.getByTestId("ercot-batch-zero-context")).toContainText("17 facilities totaling 6.6 GW");
      }
      if (route === "evidence") {
        await expect(page.getByTestId("text-evidence-sri-framing")).toContainText("Sustainability ratings grade companies on their disclosures.");
      }
      if (route === "materiality") {
        await expect(page.getByTestId("text-materiality-sri-framing")).toContainText("Water stress is not a values issue sitting in a separate report.");
      }
    }

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle("SafeLoc · Home");
    await expect(page.getByTestId("home-hero-heading")).toHaveText("The AI infrastructure market is splitting in two. Which side are your holdings on?");
    await expect(page.getByTestId("home-supporting-lines")).toContainText("$725 billion is being invested in AI infrastructure this year. $130 billion has already stalled.");
    await expect(page.getByTestId("home-supporting-lines")).toContainText("Projects that solved their constraints are proceeding. Projects that didn't are stuck. The evidence determines which is which.");
    await expect(page.getByTestId("input-custom-project-name")).toHaveAttribute("placeholder", "Enter any data center project...");
    await expect(page.getByTestId("button-run-ai-analysis")).toHaveText(/Run AI Analysis/);
    await expect(page.getByTestId("home-analysis-subtitle")).toHaveText("AI researches public sources and classifies 16 evidence variables.");
    await expect(page.getByTestId("button-analyze-stargate")).toContainText("Analyze Stargate Abilene");
    await expect(page.getByTestId("button-analyze-stargate")).toContainText("OpenAI's $500B flagship. The curated deep dive.");
    await expect(page.getByTestId("home-tier-proceeding")).toContainText("Tier 1: Proceeding");
    await expect(page.getByTestId("home-tier-proceeding")).toContainText("Behind-the-meter power. Secured water. No grid dependency.");
    await expect(page.getByTestId("home-tier-proceeding")).toContainText("Chevron/Microsoft Project Kilby");
    await expect(page.getByTestId("home-tier-proceeding")).toContainText("Evidence: Mostly Verified");
    await expect(page.getByTestId("home-tier-stalling")).toContainText("Tier 2: Stalling");
    await expect(page.getByTestId("home-tier-stalling")).toContainText("Grid-dependent. Municipal water. Public permitting.");
    await expect(page.getByTestId("home-tier-stalling")).toContainText("OpenAI Stargate Abilene");
    await expect(page.getByTestId("home-tier-stalling")).toContainText("Evidence: Key Gaps");
    await expect(page.getByTestId("home-bifurcation-direction")).toHaveText("Analyze any project to see which tier it falls in.");
    await expect(page.getByTestId("home-bifurcation-qualifier")).toHaveText(/public market context\/examples.*not facility-level Stargate evidence.*synthetic financial inputs/i);
    await expect(page.getByTestId("home-context-strip")).toContainText("$725B");
    await expect(page.getByTestId("home-context-strip")).toContainText("$130B");
    await expect(page.getByTestId("home-context-strip")).toContainText("200 GW");
    await expect(page.getByTestId("home-context-strip")).toContainText("In Batch Zero · studies delayed to Jan 2027");
    await expect(page.getByTestId("home-context-strip")).toContainText("1.6%");
    await expect(page.getByTestId("home-trust-anchor")).toContainText("79% of Americans trust financial advisors. 3% trust AI.");
    await expect(page.getByTestId("home-entry-points").locator("a")).toHaveCount(3);
    await expect(page.getByTestId("home-entry-value-chain")).toHaveAttribute("href", "#value-chain");
    await expect(page.getByTestId("home-entry-how-it-works")).toHaveAttribute("href", "#how-it-works");
    await expect(page.getByTestId("home-entry-advisor")).toHaveAttribute("href", "#advisor");
    await expect(page.getByTestId("home-footer")).toContainText("Built by LeAndrew Gordon | SafeLoc | Growth for Impact Conference, November 2026");
    await expect(page.getByTestId("home-footer")).toContainText("Public Context · Synthetic Returns");

    await page.goto("/#home");
    await expect(page).toHaveURL(/#home$/);
    await expect(page.getByTestId("home-hero-heading")).toBeVisible();

    await page.goto("/#how-it-works");
    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page).toHaveTitle("SafeLoc · How It Works");
    await expect(page.getByRole("heading", { name: /A rating tells you what was reported/i })).toBeVisible();
    await expect(page.getByTestId("tour-sri-context")).toContainText("Responsible investors helped capitalize the AI revolution.");
    await expect(page.getByTestId("tour-sri-context")).toContainText("That thesis worked.");
    await expect(page.getByTestId("tour-sri-context")).toContainText("The sustainability community helped birth the AI economy.");
    await expect(page.getByTestId("tour-sri-context")).toContainText("understand the technology well enough to steer it");
    await expect(page.getByTestId("tour-bifurcation-context")).toContainText("The market is bifurcating between projects that solved their constraints independently");
    await expect(page.getByTestId("tour-bifurcation-context")).toContainText("which side a specific project falls on.");
    await expect(page.getByTestId("tour-builder-story")).toContainText("Sustainability professionals helped build the AI economy.");
    await expect(page.getByTestId("tour-builder-story")).toContainText("rather than watching from the sidelines.");
    await expect(page.getByText("$130 billion worth of AI data center projects", { exact: false })).toBeVisible();
    await expect(page.locator("[data-testid^='timeline-milestone-']")).toHaveCount(6);
    await expect(page.locator("[data-testid^='tour-screen-']")).toHaveCount(5);
    await expect(page.getByRole("heading", { name: "Verified Evidence" })).toBeVisible();
    await expect(page.getByTestId("tour-source-group-1")).toContainText("Infrastructure & Energy");
     await expect(page.getByRole("heading", { name: "What Powers This Tool" })).toBeVisible();
     await expect(page.getByTestId("link-tour-chapter-tour-under-the-hood")).toContainText("Under the Hood");
     await expect(page.locator("[data-testid^='tour-under-the-hood-layer-']")).toHaveCount(5);
     await expect(page.getByTestId("tour-under-the-hood-layer-cash-flow")).toContainText("Newton’s method");
     await expect(page.getByTestId("tour-under-the-hood-layer-cash-flow")).toContainText("Not a score. Not a penalty. Real project finance math.");
     await expect(page.getByTestId("tour-under-the-hood-layer-wiring")).toContainText("Electricity cost");
     await expect(page.getByTestId("tour-under-the-hood-layer-wiring")).toContainText("structurally linked");
     await expect(page.getByTestId("tour-under-the-hood-layer-data")).toContainText("ERCOT queue");
     await expect(page.getByTestId("tour-under-the-hood-layer-data")).toContainText("Embedded");
     await expect(page.getByTestId("tour-under-the-hood-layer-ai")).toContainText("Human accepts or overrides");
     await expect(page.getByTestId("tour-under-the-hood-layer-ai")).toContainText("Only the human decision changes");
     await expect(page.getByTestId("tour-under-the-hood-layer-research")).toContainText("retrieval-backed, high-level context");
     await expect(page.getByTestId("tour-under-the-hood-bottom-line")).toContainText("Built by one person using Claude, Replit, and public data APIs.");
    await expect(page.getByTestId("button-return-workbench-top")).toBeVisible();
    await expect(page.getByTestId("button-return-workbench-bottom")).toBeVisible();
    await page.getByTestId("link-tour-tour-workflow").click();
    await expect(page.getByRole("heading", { name: "Five screens. One evidence chain." })).toBeInViewport();

    await page.goto("/#not-a-screen");
    await expect(page).toHaveURL(/#brief$/);
    await expect(page.getByTestId("button-navigate-brief")).toHaveAttribute("aria-current", "step");
  });

  test("guides the classification-to-return interaction across screens", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto("/#evidence");

    const evidenceTip = page.getByTestId("evidence-classification-tip");
    await expect(evidenceTip).toContainText("Try it: Click any dropdown and change a classification. Watch what happens.");
    const countCards = page.getByTestId("count-classification-verified");
    const tipBox = await evidenceTip.boundingBox();
    const countBox = await countCards.boundingBox();

    expect(tipBox && countBox ? tipBox.y + tipBox.height : 0).toBeLessThanOrEqual(countBox?.y ?? Number.POSITIVE_INFINITY);

    await page.goto("/#materiality");
    await expect(page.getByTestId("materiality-classification-prompt")).toContainText("Change a classification to see the return update.");

    await page.goto("/#evidence");
    await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
    await expect(page.getByTestId("toast-reclassification")).toContainText("Conservative stress case updated");
    await expect(page.getByTestId("live-current-irr")).toContainText("Conservative stress case IRR is now");

    await page.goto("/#materiality");
    await expect(page.getByTestId("materiality-classification-prompt")).toHaveCount(0);
    await expect(page.getByTestId("metric-project-irr")).toContainText(/\d+\.\d%/);
  });

  test("frames the financial waterfall as an evidence-quality stress test", async ({ page }) => {
    await page.route("**/api/eia/electricity", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ diagnostics: { error: "Calibration test uses the bundled baseline" } }),
    }));
    await page.goto("/#materiality");

    const waterfall = page.getByTestId("panel-irr-waterfall");
    const baseCaseLabel = "Underwriting Baseline (All Inputs Verified)";
    const conservativeCaseLabel = "Conservative Case (Stress-Adjusted)";
    const description = "Lower evidence quality applies progressively conservative underwriting assumptions. This is a stress test, not a prediction. Unverified inputs are assigned worst-case values, not because negative outcomes are certain, but because conservative underwriting requires assuming the downside until evidence proves otherwise.";
    const methodology = "Evidence classifications do not predict whether an unknown outcome will be favorable or unfavorable. For this demonstration, weaker evidence triggers predefined conservative underwriting treatments to show the potential cost of unresolved uncertainty.";
    const note = "A management assertion that proves accurate would improve the return. The conservative stress case shows the cost of not knowing, not the cost of a negative outcome.";

    await expect(waterfall.getByRole("heading", { name: "Evidence-Quality Stress Test" })).toBeVisible();
    await expect(waterfall.getByTestId("waterfall-description")).toHaveText(description);
    await expect(waterfall.getByTestId("waterfall-methodology")).toHaveText(methodology);
    await expect(waterfall).toHaveAttribute("aria-describedby", "irr-waterfall-description irr-waterfall-methodology");
    await expect(waterfall).toContainText(baseCaseLabel);
    await expect(waterfall).toContainText(conservativeCaseLabel);
    await expect(waterfall.getByTestId("waterfall-underwriting-note")).toHaveText(note);
    await expect(waterfall).not.toContainText("Every classification moves the same live model.");
    await expect(waterfall.locator("[data-testid^='waterfall-step-']")).toHaveCount(10);
    await expect(waterfall.locator("[data-testid^='waterfall-role-']")).toHaveCount(10);
    await expect(waterfall.getByTestId("waterfall-step-backup_power_capacity")).toHaveCount(0);
    await expect(waterfall.getByTestId("waterfall-step-water_rights")).toHaveCount(0);
    await expect(waterfall.getByTestId("waterfall-step-community_risk")).toHaveCount(0);
    await expect(waterfall.getByTestId("waterfall-step-renewable_percentage")).toHaveCount(0);
    await expect(waterfall.getByTestId("waterfall-impact-water_escalation")).toHaveText(
      "less than 0.01 pts down",
    );
    await expect(waterfall.getByTestId("waterfall-explanation-grid_interconnection")).toHaveText(
      "Financial stress case",
    );
    await expect(waterfall.getByTestId("waterfall-step-site_hazard_exposure")).toContainText(
      "Modeled as: Model Inference",
    );
    await expect(waterfall.getByTestId("waterfall-step-electricity_cost")).toContainText(
      "Current classification: User Assumption",
    );
    await expect(waterfall.getByTestId("waterfall-treatment-electricity_cost")).toHaveText(
      "Applied treatment: Applied rate: $44.1/MWh.",
    );
    await expect(waterfall.getByTestId("waterfall-treatment-grid_interconnection")).toContainText(
      "Applied interconnection delay:",
    );
    await expect(waterfall.getByTestId("waterfall-treatment-electricity_cost")).toHaveAttribute(
      "aria-label",
      "Applied stress treatment for Electricity Cost / MWh: Applied rate: $44.1/MWh.",
    );
    await expect(page.getByTestId("materiality-impact-water_escalation")).toHaveText(
      "less than 0.01 pts down",
    );
    const decisionContext = page.getByTestId("panel-decision-context-treatment");
    await expect(decisionContext.getByTestId("decision-context-treatment-copy")).toHaveText(
      "These items affect the decision posture or provide diligence context but do not directly change the financial stress case.",
    );
    await expect(decisionContext.locator("[data-testid^='decision-context-item-']")).toHaveCount(6);
    await expect(decisionContext.getByTestId("decision-context-role-backup_power_capacity")).toHaveAccessibleName("Impact role: Decision Gate");
    await expect(decisionContext.getByTestId("decision-context-role-community_risk")).toHaveAccessibleName("Impact role: Context Indicator");
    await expect(page.locator("body")).not.toContainText("+0.0 pts");
    await expect(page.locator("body")).not.toContainText("-0.0 pts");

    const baselineIrr = await waterfall.getByTestId("waterfall-base-irr").textContent();
    const currentIrr = await page.getByTestId("waterfall-current-irr").textContent();
    const parsePercent = (value: string | null) => Number.parseFloat(value?.replace("%", "") ?? "NaN");
    const baselineValue = parsePercent(baselineIrr);
    const currentValue = parsePercent(currentIrr);

    expect(baselineValue).toBeGreaterThanOrEqual(13);
    expect(baselineValue).toBeLessThanOrEqual(14);
    expect(currentValue).toBeGreaterThanOrEqual(8);
    expect(currentValue).toBeLessThanOrEqual(11);
    expect(baselineValue - currentValue).toBeGreaterThanOrEqual(3);
    expect(baselineValue - currentValue).toBeLessThanOrEqual(5);

    await expect(page.getByTestId("metric-project-irr")).toContainText("Project IRR");
    await expect(page.getByTestId("metric-moic")).toContainText("MOIC");
    await expect(page.getByTestId("metric-coc")).toContainText("Cash-on-cash");
    await expect(page.getByTestId("metric-payback")).toContainText("Payback");
    await expect(page.getByTestId("metric-npv")).toContainText("NPV @ 10%");

    const waterfallChanges = await waterfall.locator("[data-testid^='waterfall-step-']").evaluateAll(
      (steps) => steps.map((step) => step.textContent ?? ""),
    );
    expect(waterfallChanges.filter((text) => /-\d+\.\d pts/.test(text)).length).toBeGreaterThan(3);
    await expect(waterfall.locator("[data-testid^='waterfall-step-']").last()).toContainText(currentIrr ?? "");

    await page.goto("/#decision");
    await expect(page.getByTestId("text-decision-irr")).toHaveText(currentIrr ?? "");
    await expect(page.getByTestId("panel-decision-return")).toContainText(baselineIrr ?? "");

    await page.goto("/#evidence");
    await page.getByTestId("select-classification-grid_interconnection").selectOption("Management Assertion");
    await page.goto("/#materiality");
    await expect(waterfall.getByTestId("waterfall-underwriting-note")).toHaveText(note);
    await expect(waterfall).toContainText(baseCaseLabel);
    await expect(waterfall).toContainText(conservativeCaseLabel);
    await expect(waterfall.getByTestId("waterfall-current-irr")).not.toHaveText(currentIrr ?? "");
    await expect(waterfall.getByTestId("waterfall-base-irr")).toHaveText(baselineIrr ?? "");
    await expect(waterfall.getByTestId("waterfall-step-backup_power_capacity")).toHaveCount(0);
    await expect(decisionContext.getByTestId("decision-context-role-backup_power_capacity")).toHaveText("Decision Gate");
  });

  test("keeps impact roles accessible and model behavior aligned with provenance changes", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto("/#materiality");
    const initialIrr = await page.getByTestId("text-current-irr-materiality").textContent();
    await page.goto("/#evidence");

    await expect(page.locator("[data-testid^='badge-impact-role-']")).toHaveCount(16);
    await expect(page.getByTestId("badge-impact-role-electricity_cost")).toHaveAccessibleName("Impact role: Financial Driver");
    await expect(page.getByTestId("badge-impact-role-backup_power_capacity")).toHaveAccessibleName("Impact role: Decision Gate");
    await expect(page.getByTestId("badge-impact-role-renewable_percentage")).toHaveAccessibleName("Impact role: Context Indicator");

    await page.getByTestId("select-classification-water_rights").selectOption("Verified Evidence");
    await page.getByTestId("select-classification-water_source_resilience").selectOption("Verified Evidence");
    await page.goto("/#decision");
    await expect(page.getByTestId("status-recommendation")).toHaveText("READY FOR REVIEW");
    await page.goto("/#materiality");
    await expect(page.getByTestId("text-current-irr-materiality")).toHaveText(initialIrr ?? "");

    await page.goto("/#evidence");
    await page.getByTestId("select-classification-backup_power_capacity").selectOption("Missing Evidence");
    await page.getByTestId("select-classification-renewable_percentage").selectOption("Missing Evidence");
    await page.goto("/#decision");
    await expect(page.getByTestId("status-recommendation")).toHaveText("BLOCKED");
    await page.goto("/#materiality");
    await expect(page.getByTestId("text-current-irr-materiality")).toHaveText(initialIrr ?? "");

    await page.goto("/#evidence");
    await page.getByTestId("select-classification-electricity_cost").selectOption("Verified Evidence");
    await page.goto("/#materiality");
    await expect(page.getByTestId("text-current-irr-materiality")).not.toHaveText(initialIrr ?? "");

    await page.goto("/#evidence");
    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page.getByTestId("select-classification-backup_power_capacity")).toHaveValue("Management Assertion");
    await expect(page.getByTestId("badge-impact-role-backup_power_capacity")).toHaveText("Decision Gate");
  });

  test("keeps canonical stress vocabulary on rendered and assistive surfaces", async ({ page }) => {
    const routesToAudit = [
      "home",
      "brief",
      "evidence",
      "materiality",
      "decision",
      "advisor",
      "value-chain",
      "how-it-works",
    ] as const;
    const legacyFinancialCopy = /verified baseline|evidence-adjusted|current case|current irr is now|base case \(all inputs verified\)|conservative case \(evidence-adjusted\)|verified underwriting|prominent base return|return updated|every classification has a financial consequence|entire model recalculates/i;

    for (const route of routesToAudit) {
      await page.goto(`/#${route}`);
      expect(await page.locator("body").textContent()).not.toMatch(legacyFinancialCopy);
    }

    await page.goto("/#materiality");
    await expect(page.getByTestId("panel-irr-waterfall")).toContainText("Underwriting Baseline");
    await expect(page.getByTestId("panel-irr-waterfall")).toContainText("Conservative Case (Stress-Adjusted)");

    await page.goto("/#decision");
    await expect(page.getByTestId("panel-decision-return")).toContainText("Conservative Stress Case project IRR");
    await expect(page.getByTestId("panel-decision-return")).toContainText("Underwriting Baseline");

    await page.goto("/#advisor");
    await expect(page.getByTestId("advisor-governance-gap-description")).toHaveText(
      "The difference between the underwriting baseline and the conservative stress case.",
    );

    await page.goto("/#how-it-works");
    await expect(page.getByTestId("tour-under-the-hood-layer-wiring")).toContainText(
      "Lower evidence quality applies progressively conservative underwriting assumptions",
    );
  });

  test("shows the complete SRI origin story in the product tour", async ({ page }) => {
    await page.goto("/#how-it-works");

    const context = page.getByTestId("tour-sri-context");
    await expect(context).toContainText("Responsible investors helped capitalize the AI revolution; now its physical infrastructure is testing environmental stewardship, community impact, transparent governance, and evidence-based decision-making.");
    await expect(context).toContainText("Texas pausing new grid connections for an energy and water audit");

    const builderStory = page.getByTestId("tour-builder-story");
    await expect(builderStory).toContainText("Built by LeAndrew Gordon, Founder and CEO of SafeLoc, a former Private Wealth Financial Advisor and Chartered SRI Counselor, for the Growth for Impact Conference.");
    await expect(builderStory).toContainText("SafeLoc applies values-aligned evidence standards to the infrastructure layer so sustainability professionals can help steer the AI economy rather than watch from the sidelines.");
  });

  test("keeps portfolio context notes readable at configured browser sizes", async ({ page }) => {
    await page.goto("/#materiality");
    await expectContextNoteToStayReadable(page, "portfolio-connection-strip", "portfolio-connection-message");

    await page.goto("/#decision");
    await expectContextNoteToStayReadable(page, "holdings-connection-indicator", "holdings-connection-message");
  });

  test("keeps the opening and builder story readable at every browser size", async ({ page }) => {
    await page.goto("/#how-it-works");
    await expect(page.getByTestId("tour-sri-context")).toBeVisible();
    await expect(page.getByTestId("tour-builder-story")).toBeVisible();

    await expectTourLayoutToStayReadable(page, "#tour-context");
    await expect(page.locator("#tour-context")).toHaveScreenshot("how-it-works-opening.png", {
      animations: "disabled",
      caret: "hide",
    });

    await page.getByTestId("link-tour-chapter-tour-built-by").click();
    await expect(page.getByTestId("tour-builder-story")).toBeInViewport();
    await expectTourLayoutToStayReadable(page, "#tour-built-by");
    await expect(page.locator("#tour-built-by")).toHaveScreenshot("how-it-works-builder-story.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("keeps reduced-motion tour jumps immediate without changing interaction", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#how-it-works");
    await page.evaluate(() => {
      const calls: unknown[] = [];
      const originalScrollIntoView = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        calls.push(options);
        originalScrollIntoView.call(this, options);
      };
      (window as typeof window & { __tourScrollCalls?: unknown[] }).__tourScrollCalls = calls;
    });

    await page.getByTestId("link-tour-chapter-tour-built-by").click();
    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page.getByTestId("tour-builder-story")).toBeInViewport();
    await expectTourLayoutToStayReadable(page, "#tour-built-by");

    await expect
      .poll(() => page.evaluate(() => (window as typeof window & { __tourScrollCalls?: unknown[] }).__tourScrollCalls))
      .toEqual([{ behavior: "auto", block: "start" }]);
  });

   test("jumps to and keeps the Under the Hood chapter readable", async ({ page }) => {
     await page.goto("/#how-it-works");
     await page.getByTestId("link-tour-chapter-tour-under-the-hood").click();
     await expect(page).toHaveURL(/#how-it-works$/);
     await expect(page.getByRole("heading", { name: "What Powers This Tool" })).toBeInViewport();
     await expectTourLayoutToStayReadable(page, "#tour-under-the-hood");
     await expect(page.getByTestId("tour-under-the-hood-cash-flow-visual")).toContainText("Newton method");
     await expect(page.getByTestId("tour-under-the-hood-ai-visual")).toContainText("OpenAI suggestion");
     await expect(page.getByTestId("tour-under-the-hood-research-visual")).toContainText("Available / AI-researched");
   });

  test("uses SRI terminology while preserving formal fund names", async ({ page }) => {
    await page.goto("/#advisor");
    await expect(page.getByTestId("text-advisor-summary")).toContainText("values-aligned funds");
    await expect(page.getByTestId("text-epistemic-gap")).toContainText("AAA sustainability rating");
    await expect(page.getByTestId("card-fund-ishares")).toContainText("iShares ESG Advanced MSCI USA ETF");
    await expect(page.getByTestId("card-fund-msci")).toContainText("MSCI KLD 400 Social Index");
    await expect(page.getByTestId("card-fund-ishares")).toContainText("sustainability-screened broad market");
    await expect(page.getByTestId("section-client-conversations")).toContainText("Values-aligned fund quality");
    await expect(page.getByTestId("section-client-conversations")).not.toContainText("ESG-fund");
  });

  test("opens and returns from the tour using the desktop header", async ({ page }) => {
    await page.goto("/#brief");
    if (!(await page.getByTestId("button-how-it-works").isVisible())) return;

    await page.getByTestId("button-how-it-works").click();
    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page.getByRole("heading", { name: /A rating tells you what was reported/i })).toBeVisible();
    await page.getByTestId("button-return-workbench-top").click();
    await expect(page).toHaveURL(/#brief$/);
    await expect(page.getByTestId("button-navigate-brief")).toHaveAttribute("aria-current", "step");
  });

  test("opens and returns from the tour using mobile navigation", async ({ page }) => {
    await page.goto("/#brief");
    if (!(await page.getByTestId("button-open-menu").isVisible())) return;

    const menuButton = page.getByTestId("button-open-menu");
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("mobile-navigation")).toBeVisible();
    await page.getByTestId("mobile-navigate-how-it-works").click();
    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page.getByRole("heading", { name: /A rating tells you what was reported/i })).toBeVisible();
    await page.getByTestId("button-return-workbench-bottom").click();
    await expect(page).toHaveURL(/#brief$/);
  });

  test("shows infrastructure bifurcation framing on each editorial route", async ({ page }) => {
    await page.goto("/");
    await expectPageToStayWithinViewport(page);
    await expect(page.getByTestId("home-tier-proceeding")).toContainText("Behind-the-meter power. Secured water. No grid dependency.");
    await expect(page.getByTestId("home-tier-stalling")).toContainText("Grid-dependent. Municipal water. Public permitting.");

    await page.goto("/#brief");
    await expectPageToStayWithinViewport(page);
    await expect(page.getByTestId("brief-tier-2-callout")).toContainText("affected by the August 2026 moratorium");
    await expect(page.getByTestId("brief-tier-2-callout")).toContainText("the evidence gap that separates projects that advance from projects that stall");

    await page.goto("/#value-chain");
    await expectPageToStayWithinViewport(page);
    const focalStage = page.getByTestId("value-chain-stage-data-center-infrastructure");
    await expect(focalStage).toContainText("Chevron/Microsoft's Project Kilby bypass the grid and are proceeding");
    await expect(focalStage).toContainText("Grid-dependent projects like Stargate Abilene");

    await page.goto("/#advisor");
    await expectPageToStayWithinViewport(page);
    const tierExposure = page.getByTestId("advisor-tier-exposure");
    await expect(tierExposure.getByRole("heading", { name: "Your Clients Are on Both Sides" })).toBeVisible();
    await expect(tierExposure.locator("[data-testid^='advisor-tier-']")).toHaveCount(4);
    await expect(tierExposure).toContainText("NVIDIA");
    await expect(tierExposure).toContainText("Microsoft");
    await expect(tierExposure).toContainText("Meta");
    await expect(tierExposure).toContainText("Google");

    await page.goto("/#how-it-works");
    await expectPageToStayWithinViewport(page);
    await expect(page.getByTestId("tour-bifurcation-context")).toContainText("This tool tests which side a specific project falls on.");
  });

  test("preserves navigation order through back and forward", async ({ page }) => {
    await page.goto("/#brief");
    await page.getByTestId("button-navigate-evidence").click();
    await expect(page).toHaveURL(/#evidence$/);
    await page.getByTestId("button-navigate-materiality").click();
    await expect(page).toHaveURL(/#materiality$/);
    await page.getByTestId("button-navigate-decision").click();
    await expect(page).toHaveURL(/#decision$/);

    await page.goBack();
    await expect(page).toHaveURL(/#materiality$/);
    await expect(page.getByTestId("button-navigate-materiality")).toHaveAttribute("aria-current", "step");
    await page.goBack();
    await expect(page).toHaveURL(/#evidence$/);
    await expect(page.getByTestId("button-navigate-evidence")).toHaveAttribute("aria-current", "step");

    await page.goForward();
    await expect(page).toHaveURL(/#materiality$/);
    await page.goForward();
    await expect(page).toHaveURL(/#decision$/);
    await expect(page.getByTestId("button-navigate-decision")).toHaveAttribute("aria-current", "step");
  });

  test("opens the AI chain from the header and preserves the five-step workbench", async ({ page }) => {
    await page.goto("/#brief");
    if (await page.getByTestId("button-open-menu").isVisible()) {
      await page.getByTestId("button-open-menu").click();
      await page.getByTestId("mobile-navigate-value-chain").click();
    } else {
      await page.getByTestId("button-open-value-chain").click();
    }

    await expect(page).toHaveURL(/#value-chain$/);
    await expect(page).toHaveTitle("SafeLoc · The AI Chain");
    await expect(page.getByTestId("value-chain-narrative")).toContainText("Sustainable investors helped capitalize this chain by concentrating capital in well-governed, high-performing companies like NVIDIA.");
    await expect(page.getByTestId("value-chain-stages").locator(":scope > li")).toHaveCount(7);
    await expect(page.getByTestId("value-chain-stage-data-center-infrastructure")).toContainText("YOU ARE HERE");
    await expect(page.getByTestId("value-chain-stage-data-center-infrastructure")).toContainText("Where capital meets physical reality: power, water, land, grid, community.");
    await expect(page.getByTestId("value-chain-stage-data-center-infrastructure")).toContainText("Power · water · land · grid · community");
    await expect(page.getByTestId("value-chain-page")).toContainText("$130 billion in projects paused in Q1 2026.");
    await expect(page.getByTestId("value-chain-stage-data-center-infrastructure")).toContainText("This layer is bifurcating.");
    await expect(page.getByTestId("value-chain-stage-data-center-infrastructure")).toContainText("the 474 GW queue and the Abbott moratorium");
    await expect(page.getByTestId("value-chain-stage-data-center-infrastructure")).toContainText("Evidence quality determines which side a project lands on.");

    await page.getByTestId("button-value-chain-return-hero").click();
    await expect(page).toHaveURL(/#brief$/);
    await expect(page.getByTestId("button-navigate-brief")).toHaveAttribute("aria-current", "step");
  });

  test("renders the seven stages in order at the direct value-chain link", async ({ page }) => {
    await page.goto("/#value-chain");
    await expect(page.getByTestId("value-chain-stages").locator(":scope > li h3")).toHaveText([
      "CHIP FABRICATION",
      "CHIP DESIGN",
      "HYPERSCALER PROCUREMENT",
      "DATA CENTER INFRASTRUCTURE",
      "AI MODEL DEPLOYMENT",
      "AI GOVERNANCE AND REGULATION",
      "CLIENT-FACING AI APPLICATIONS",
    ]);
    await expect(page.getByTestId("value-chain-stage-chip-fabrication")).toContainText("Where AI begins physically.");
    await expect(page.getByTestId("value-chain-stage-chip-fabrication")).toContainText("TSMC · Samsung · Intel");
    await expect(page.getByTestId("value-chain-stage-chip-fabrication")).toContainText("Supply concentrated in geopolitically sensitive regions.");
    await expect(page.getByTestId("value-chain-stage-chip-design")).toContainText("The architectures that determine what AI can do.");
    await expect(page.getByTestId("value-chain-stage-chip-design")).toContainText("NVIDIA · AMD · Broadcom");
    await expect(page.getByTestId("value-chain-stage-chip-design")).toContainText("NVIDIA holds a top-tier sustainability rating and is the largest holding in major sustainable investment funds.");
    await expect(page.getByTestId("value-chain-stage-hyperscaler-procurement")).toContainText("$650 billion in committed AI infrastructure spending.");
    await expect(page.getByTestId("value-chain-stage-hyperscaler-procurement")).toContainText("Microsoft · Meta · Google · Amazon");
    await expect(page.getByTestId("value-chain-stage-hyperscaler-procurement")).toContainText("Whether the physical infrastructure can absorb them is unverified.");
    await expect(page.getByTestId("value-chain-stage-data-center-infrastructure")).toContainText("$130 billion in projects paused in Q1 2026. The evidence behind the assumptions is what this tool tests.");
    await expect(page.getByTestId("value-chain-stage-ai-model-deployment")).toContainText("Training and inference running on the infrastructure above.");
    await expect(page.getByTestId("value-chain-stage-ai-model-deployment")).toContainText("OpenAI · Anthropic · Google DeepMind · Meta AI");
    await expect(page.getByTestId("value-chain-stage-ai-model-deployment")).toContainText("Cooling failures halt training runs.");
    await expect(page.getByTestId("value-chain-stage-ai-governance-regulation")).toContainText("The rules catching up to the technology.");
    await expect(page.getByTestId("value-chain-stage-ai-governance-regulation")).toContainText("EU AI Act Article 14 (Aug 2, 2026)");
    await expect(page.getByTestId("value-chain-stage-ai-governance-regulation")).toContainText("FINRA Notice 26-02");
    await expect(page.getByTestId("value-chain-stage-ai-governance-regulation")).toContainText("Texas Governor Abbott moratorium (Aug 3, 2026)");
    await expect(page.getByTestId("value-chain-stage-ai-governance-regulation")).toContainText("the buildout is moving faster than the evidence");
    await expect(page.getByTestId("value-chain-stage-client-facing-ai-applications")).toContainText("Where AI meets the people your clients interact with.");
    await expect(page.getByTestId("value-chain-stage-client-facing-ai-applications")).toContainText("financial planning tools");
    await expect(page.getByTestId("value-chain-stage-client-facing-ai-applications")).toContainText("robo-advisors");
    await expect(page.getByTestId("value-chain-stage-client-facing-ai-applications")).toContainText("portfolio screeners");
    await expect(page.getByTestId("value-chain-stage-client-facing-ai-applications")).toContainText("45% of Americans have no confidence in AI for financial guidance.");
  });

  test("renders the SRI thesis, live evidence posture, and advisor handoff", async ({ page }) => {
    await page.goto("/#advisor");

    await expect(page.getByRole("heading", { name: "Your Clients’ Values Are Invested Here" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your Clients Are on Both Sides" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How to Talk to Your Client" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Why This Is Your Role" })).toBeVisible();

    const chain = page.getByLabel("Client exposure chain");
    await expect(chain.locator("[data-testid^='exposure-node-']")).toHaveCount(6);
    await expect(chain.locator("[data-testid^='exposure-node-']")).toHaveText([
      /Client’s Values-Aligned Portfolio/,
      /Sustainable Investment Fund/,
      /NVIDIA/,
      /GPU Orders/,
      /Hyperscaler CAPEX/,
      /Stargate Abilene/,
    ]);

    await expect(page.getByTestId("section-client-exposure")).toContainText("The exposure chain turns that connection into diligence questions");
    await expect(page.getByTestId("advisor-tier-nvidia")).toContainText("Tier 2 delays slow procurement.");
    await expect(page.getByTestId("advisor-tier-microsoft")).toContainText("Project Kilby (Tier 1, proceeding)");
    await expect(page.getByTestId("advisor-tier-meta")).toContainText("Major Texas projects require ERCOT interconnection.");
    await expect(page.getByTestId("advisor-tier-google")).toContainText("Subject to Abbott's audit.");
    await expect(page.getByTestId("text-epistemic-gap")).toContainText("two different questions");
    await expect(page.getByTestId("advisor-risk-stat-paused")).toContainText("$130B");
    await expect(page.getByTestId("advisor-risk-stat-revenue")).toContainText("$8B");
    await expect(page.getByTestId("advisor-risk-stat-earnings")).toContainText("other 493 S&P companies");

    const conversations = page.getByTestId("section-client-conversations");
    await expect(conversations).toContainText("Is my fund still aligned with my values?");
    await expect(conversations).toContainText("Should I be worried about AI risk?");
    await expect(conversations).toContainText("What should I do?");
    await expect(page.getByTestId("client-conversation-01")).toContainText("Ask your fund manager");
    await expect(page.getByTestId("client-conversation-02")).toContainText("Review concentration in AI infrastructure-dependent holdings");
    await expect(page.getByTestId("client-conversation-03")).toContainText("Not sell. Engage.");
    await expect(page.getByTestId("client-conversation-03")).toContainText("governance gap");

    await expect(page.getByTestId("section-practice-value")).toContainText("79%");
    await expect(page.getByTestId("section-practice-value")).toContainText("3%");
    await expect(page.getByTestId("section-practice-value")).toContainText("4x");
    await expect(page.getByTestId("section-practice-value")).toContainText("zero statistical association with financial fulfillment");
     await expect(page.getByTestId("text-governed-ai-connection")).toHaveText("You just experienced governed AI in this tool. An AI proposed evidence classifications. You decided which to accept. That interaction is the future of financial advising: AI accelerates the analysis, the advisor makes the judgment call. The Gallup data confirms what you already felt: 79% of Americans trust advisors. 3% trust AI. The advisor who can work with AI and govern its output has the most defensible position in the industry.");
    await expect(page.getByTestId("text-governance-irr-gap")).toHaveText(/-?\d+\.\d pts/);
    await expect(page.getByTestId("card-fund-ishares")).toBeVisible();
    await expect(page.getByTestId("advisor-question-water-rights")).toBeVisible();
     await expect(page.getByTestId("text-advisor-summary")).toContainText(
       "MODERATE: 5 of 7 material inputs verified. 3 of 16 total inputs verified.",
     );
     await expect(page.getByTestId("badge-advisor-summary-risk")).toHaveAttribute(
       "aria-label",
       "MODERATE unverified exposure risk",
     );
     await expect(page.getByTestId("badge-fund-ishares-risk")).toHaveAttribute(
       "aria-label",
       "MODERATE unverified exposure risk",
     );
     await expect(page.getByTestId("badge-fund-msci-risk")).toHaveAttribute(
       "aria-label",
       "MODERATE unverified exposure risk",
     );
     await expect(page.getByTestId("text-advisor-summary")).toContainText("Management Assertion");
     await expect(page.getByTestId("text-advisor-summary")).not.toContainText("HIGH < 4 verified");

    const initialGap = await page.getByTestId("text-governance-irr-gap").textContent();
    await page.goto("/#evidence");
    await page.getByTestId("select-classification-water_rights").selectOption("Verified Evidence");
    await page.goto("/#advisor");
     await expect(page.getByTestId("text-advisor-summary")).toContainText(
       "MODERATE: 6 of 7 material inputs verified. 4 of 16 total inputs verified.",
     );
    await expect(page.getByTestId("advisor-question-water-rights")).not.toHaveClass(/border-2/);
    await expect(page.getByTestId("text-governance-irr-gap")).not.toHaveText(initialGap ?? "");
     await page.goto("/#evidence");
     await page.getByTestId("select-classification-water_source_resilience").selectOption("Verified Evidence");
     await page.goto("/#advisor");
     await expect(page.getByTestId("text-advisor-summary")).toContainText(
       "LOW: 7 of 7 material inputs verified. 5 of 16 total inputs verified.",
     );
     await expect(page.getByTestId("badge-advisor-summary-risk")).toHaveAttribute(
       "aria-label",
       "LOW unverified exposure risk",
     );
     await expect(page.getByTestId("badge-fund-ishares-risk")).toHaveAttribute(
       "aria-label",
       "LOW unverified exposure risk",
     );
     await expect(page.getByTestId("badge-fund-msci-risk")).toHaveAttribute(
       "aria-label",
       "LOW unverified exposure risk",
     );
    await expect(page.getByTestId("button-return-decision")).toBeVisible();
    await page.getByTestId("button-return-decision").click();
    await expect(page).toHaveURL(/#decision$/);
  });

  test("rounds financial metrics only at the presentation boundary", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#materiality");

    await expect(page.getByTestId("metric-project-irr")).toContainText(/Project IRR/);
    await expect(page.getByTestId("metric-project-irr")).toContainText(/\d+\.\d%/);
    await expect(page.getByTestId("metric-moic")).toContainText(/\d+\.\d{2}x/);
    await expect(page.getByTestId("metric-coc")).toContainText(/\d+\.\d%/);
    await expect(page.getByTestId("metric-payback")).toContainText(/\d+\.\d years|Not reached/);
    await expect(page.getByTestId("metric-npv")).toContainText(/[$−]\d+M/);
    await expect(page.getByTestId("decision-context-item-water_rights")).toContainText("Decision Gate");
    await expect(page.getByTestId("live-current-irr")).toContainText(/Conservative stress case IRR is now -?\d+\.\d%\./);

    await page.goto("/#evidence");
    await page.getByTestId("select-classification-water_rights").selectOption("Verified Evidence");
    await expect(page.getByTestId("toast-reclassification")).toContainText(/[-+]\d+\.\d pts IRR/);
    await expect(page.getByTestId("toast-reclassification")).not.toContainText(/\d+\.\d{2,}%/);

    await page.goto("/#decision");
    await expect(page.getByTestId("text-decision-irr")).toContainText(/\d+\.\d%/);
    await expect(page.getByTestId("panel-decision-return")).toContainText(/\d+\.\d{2}x/);
    await expect(page.getByTestId("panel-decision-return")).toContainText(/[$−]\d+M/);

    await page.goto("/#advisor");
    await expect(page.getByTestId("text-governance-irr-gap")).toHaveText(/-?\d+\.\d pts/);

    await page.goto("/");
    await expect(page.getByTestId("home-hero-heading")).toContainText("Which side are your holdings on?");
  });

  test("keeps market comparisons adjacent to their provenance boundary", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/eia/electricity", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "fallback" }),
    }));
    await page.goto("/#evidence");

    const initialEvidence = await page.locator("select[data-testid^='select-classification-']").evaluateAll((selects) =>
      Object.fromEntries(selects.map((select) => [select.getAttribute("data-testid"), (select as HTMLSelectElement).value])),
    );
    await page.goto("/#materiality");
    const initialModelInputs = await page.locator("[data-testid^='row-materiality-']").allTextContents();
    const initialMaterialityMetrics = await Promise.all([
      page.getByTestId("metric-project-irr").innerText(),
      page.getByTestId("metric-moic").innerText(),
      page.getByTestId("metric-coc").innerText(),
      page.getByTestId("metric-payback").innerText(),
      page.getByTestId("metric-npv").innerText(),
    ]);

    await page.goto("/");
    await expect(page.getByTestId("home-bifurcation-qualifier")).toHaveText(/public market context\/examples.*not facility-level Stargate evidence.*synthetic financial inputs/i);

    await page.goto("/#brief");
    const briefComparison = page.getByTestId("brief-tier-2-comparison");
    await expect(briefComparison).toContainText("Project Kilby");
    await expect(briefComparison.locator("xpath=following-sibling::*[1]")).toHaveAttribute("data-testid", "brief-tier-2-qualifier");
    await expect(page.getByTestId("brief-tier-2-qualifier")).toHaveText(/public market context only.*not facility-level Stargate evidence.*not a synthetic transaction input/i);

    await page.goto("/#advisor");
    const advisorExposure = page.getByTestId("advisor-tier-exposure");
    const advisorQualifier = advisorExposure.getByTestId("advisor-exposure-qualifier");
    await expect(advisorQualifier).toHaveText(/public market-context examples.*not facility-level Stargate evidence.*not modeled financial inputs/i);
    await expect(advisorQualifier.locator("xpath=following-sibling::*[1]")).toHaveAttribute("data-testid", "advisor-exposure-comparisons");
    await expect(advisorExposure.getByTestId("advisor-tier-microsoft")).toContainText("Project Kilby (Tier 1, proceeding)");

    await page.goto("/#evidence");
    const evidenceSurfaceText = await page.locator("body").innerText();
    expect(evidenceSurfaceText).not.toContain("Project Kilby");
    expect(evidenceSurfaceText).not.toContain("The companies in your portfolio are on both sides.");
    const finalEvidence = await page.locator("select[data-testid^='select-classification-']").evaluateAll((selects) =>
      Object.fromEntries(selects.map((select) => [select.getAttribute("data-testid"), (select as HTMLSelectElement).value])),
    );
    expect(finalEvidence).toEqual(initialEvidence);

    await page.goto("/#materiality");
    const finalMaterialityMetrics = await Promise.all([
      page.getByTestId("metric-project-irr").innerText(),
      page.getByTestId("metric-moic").innerText(),
      page.getByTestId("metric-coc").innerText(),
      page.getByTestId("metric-payback").innerText(),
      page.getByTestId("metric-npv").innerText(),
    ]);
    await expect(page.getByTestId("portfolio-connection-strip")).toContainText("This is market context, not facility-level Stargate evidence or a new modeled input.");
    expect(await page.locator("[data-testid^='row-materiality-']").allTextContents()).toEqual(initialModelInputs);
    expect(finalMaterialityMetrics).toEqual(initialMaterialityMetrics);
    const syntheticEconomicsText = await page.locator("#materiality-summary, [data-testid='panel-irr-waterfall'], [data-testid='panel-baseline-current'], [data-testid='disclosure-full-model-detail']").allTextContents();
    expect(syntheticEconomicsText.join(" ")).not.toMatch(/Project Kilby|The companies in your portfolio are on both sides/i);
  });
});
