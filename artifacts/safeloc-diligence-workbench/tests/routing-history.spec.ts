import { expect, test } from "@playwright/test";

const routes = [
  ["brief", "Case Brief"],
  ["evidence", "Evidence Room"],
  ["materiality", "Financial Materiality"],
  ["decision", "Decision Review"],
  ["advisor", "Advisor Lens"],
] as const;

    const visual = page.getByTestId("home-evidence-visual");

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
      }
      if (route === "evidence") {
        await expect(page.getByTestId("text-evidence-sri-framing")).toContainText("Sustainability ratings grade companies on their disclosures.");
      }
      if (route === "materiality") {
        await expect(page.getByTestId("text-materiality-sri-framing")).toContainText("Water stress is not a values issue sitting in a separate report.");
      }
    }

    await page.goto("/#how-it-works");
    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page).toHaveTitle("SafeLoc · How It Works");
    await expect(page.getByRole("heading", { name: /A rating tells you what was reported/i })).toBeVisible();
    await expect(page.getByTestId("tour-sri-context")).toContainText("Responsible investors helped capitalize the AI revolution.");
    await expect(page.getByTestId("tour-sri-context")).toContainText("That thesis worked.");
    await expect(page.getByTestId("tour-sri-context")).toContainText("The sustainability community helped birth the AI economy.");
    await expect(page.getByTestId("tour-sri-context")).toContainText("understand the technology well enough to steer it");
    await expect(page.getByTestId("tour-builder-story")).toContainText("Sustainability professionals helped build the AI economy.");
    await expect(page.getByTestId("tour-builder-story")).toContainText("rather than watching from the sidelines.");
    await expect(page.getByText("$130 billion worth of AI data center projects", { exact: false })).toBeVisible();
    await expect(page.locator("[data-testid^='timeline-milestone-']")).toHaveCount(6);
    await expect(page.locator("[data-testid^='tour-screen-']")).toHaveCount(5);
    await expect(page.getByRole("heading", { name: "Verified Evidence" })).toBeVisible();
    await expect(page.getByTestId("tour-source-group-1")).toContainText("Infrastructure & Energy");
    await expect(page.getByTestId("button-return-workbench-top")).toBeVisible();
    await expect(page.getByTestId("button-return-workbench-bottom")).toBeVisible();
    await page.getByTestId("link-tour-tour-workflow").click();
    await expect(page.getByRole("heading", { name: "Five screens. One evidence chain." })).toBeInViewport();

    await page.goto("/#not-a-screen");
    await expect(page).toHaveURL(/#brief$/);
    await expect(page.getByTestId("button-navigate-brief")).toHaveAttribute("aria-current", "step");
  });

  test("shows the complete SRI origin story in the product tour", async ({ page }) => {
    await page.goto("/#how-it-works");

    const context = page.getByTestId("tour-sri-context");
    await expect(context).toContainText("Responsible investors helped capitalize the AI revolution. Sustainability screening selected for well-governed, capital-efficient companies and concentrated capital in the stocks best positioned to lead the next technology wave. That thesis worked.");
    await expect(context).toContainText("The sustainability community helped birth the AI economy. That creates a responsibility to understand the technology well enough to steer it. This tool was built by a sustainability professional who did exactly that");

    const builderStory = page.getByTestId("tour-builder-story");
    await expect(builderStory).toContainText("Built by LeAndrew Gordon, Founder and CEO of SafeLoc. Former Private Wealth Financial Advisor. Chartered SRI Counselor.");
    await expect(builderStory).toContainText("Sustainability professionals helped build the AI economy. This tool exists because that responsibility does not end at the screening level. It extends to the infrastructure layer, where the assumptions behind AI's growth are being tested by physical reality every day. Understanding AI well enough to build with it, and applying values-aligned evidence standards to what you build, is how the sustainability community steers this technology toward a better future rather than watching from the sidelines.");
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

    await expect(page.getByTestId("section-client-exposure")).toContainText("transmission path for diligence questions");
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
    await expect(page.getByTestId("section-practice-value")).toContainText("four times more likely to use a professional advisor");
    await expect(page.getByTestId("section-practice-value")).toContainText("zero statistical association with financial fulfillment");
    await expect(page.getByTestId("text-governance-irr-gap")).toContainText("percentage points of IRR");
    await expect(page.getByTestId("card-fund-ishares")).toBeVisible();
    await expect(page.getByTestId("advisor-question-water-rights")).toBeVisible();

    const initialGap = await page.getByTestId("text-governance-irr-gap").textContent();
    await page.goto("/#evidence");
    await page.getByTestId("select-classification-water_rights").selectOption("Verified Evidence");
    await page.goto("/#advisor");
    await expect(page.getByTestId("advisor-question-water-rights")).not.toHaveClass(/border-2/);
    await expect(page.getByTestId("text-governance-irr-gap")).not.toHaveText(initialGap ?? "");
    await expect(page.getByTestId("button-return-decision")).toBeVisible();
    await page.getByTestId("button-return-decision").click();
    await expect(page).toHaveURL(/#decision$/);
  });
});

    const viewportWidth = page.viewportSize()?.width ?? 0;

      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
