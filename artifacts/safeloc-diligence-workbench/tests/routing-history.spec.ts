import { expect, test } from "@playwright/test";

const routes = [
  ["brief", "Case Brief"],
  ["evidence", "Evidence Room"],
  ["materiality", "Financial Materiality"],
  ["decision", "Decision Review"],
  ["advisor", "Advisor Lens"],
] as const;

test.describe("hash routing and browser history", () => {
  test("supports all direct links and normalizes invalid hashes", async ({ page }) => {
    for (const [route, label] of routes) {
      await page.goto(`/#${route}`);
      await expect(page).toHaveURL(new RegExp(`#${route}$`));
      await expect(page).toHaveTitle(`SafeLoc · ${label}`);
      await expect(page.getByTestId(`button-navigate-${route}`)).toHaveAttribute("aria-current", "step");
    }

    await page.goto("/#how-it-works");
    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page).toHaveTitle("SafeLoc · How It Works");
    await expect(page.getByRole("heading", { name: /A rating tells you what was reported/i })).toBeVisible();
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
    await expect(page.getByTestId("value-chain-narrative")).toContainText("The AI economy runs from semiconductor fabs in Taiwan");
    await expect(page.getByTestId("value-chain-stages").locator(":scope > li")).toHaveCount(7);
    await expect(page.getByTestId("value-chain-stage-data-center-infrastructure")).toContainText("YOU ARE HERE");
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
      "AI GOVERNANCE & REGULATION",
      "CLIENT-FACING AI APPLICATIONS",
    ]);
    await expect(page.getByTestId("value-chain-stage-ai-governance-regulation")).toContainText("EU AI Act Article 14 (effective Aug 2, 2026)");
    await expect(page.getByTestId("value-chain-stage-ai-governance-regulation")).toContainText("FINRA Notice 26-02");
    await expect(page.getByTestId("value-chain-stage-ai-governance-regulation")).toContainText("Texas Governor Abbott moratorium (Aug 3, 2026)");
    await expect(page.getByTestId("value-chain-stage-client-facing-ai-applications")).toContainText("financial planning tools");
    await expect(page.getByTestId("value-chain-stage-client-facing-ai-applications")).toContainText("portfolio screeners");
    await expect(page.getByTestId("value-chain-stage-client-facing-ai-applications")).toContainText("robo-advisors");
  });
});