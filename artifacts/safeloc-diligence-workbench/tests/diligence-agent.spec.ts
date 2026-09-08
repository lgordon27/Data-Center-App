import { expect, test } from "@playwright/test";

const agentStorageKey = "safeloc:diligence:agent-run:v1";

test.describe("governed diligence agent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#analysis");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test("runs visible stages and persists human review without changing evidence", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Persistence behavior only needs one browser viewport.");

    const runButton = page.getByTestId("button-run-diligence-agent");
    await expect(runButton).toBeVisible();
    await expect(page.getByTestId("agent-run-status")).toContainText("Not run");
    await expect(page.getByTestId("agent-activity-disclosure")).not.toHaveJSProperty("open", true);

    await runButton.click();
    await expect(page.getByTestId("agent-stage-identity")).toContainText("Identity");
    await expect(page.getByTestId("agent-run-status")).toContainText("Review ready", { timeout: 5_000 });
    await expect(page.getByTestId("agent-stage-list").locator("li")).toHaveCount(10);
    await expect(page.getByTestId("agent-review-package")).toBeVisible();
    await expect(page.getByTestId("agent-relationship-disclosure")).toContainText("Direct");
    await expect(page.getByTestId("agent-relationship-disclosure")).toContainText("Not found");

    await page.getByTestId("agent-decision-agent-finding-grid-accepted").click();
    await expect(page.getByTestId("agent-finding-agent-finding-grid")).toContainText("Accepted");
    expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").status, agentStorageKey)).toBe("review-ready");
    expect(await page.evaluate(() => window.localStorage.getItem("safeloc:diligence:current-session:v1"))).toBeNull();

    await page.reload();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review ready");
    await expect(page.getByTestId("agent-finding-agent-finding-grid")).toContainText("Accepted");
  });

  test("keeps the action and stages usable on a narrow screen", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 390, "Responsive behavior is covered in the mobile project.");

    await expect(page.getByTestId("button-run-diligence-agent")).toBeVisible();
    await page.getByTestId("button-run-diligence-agent").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review ready", { timeout: 5_000 });
    await expect(page.getByTestId("agent-lenses")).toBeVisible();
    await page.getByTestId("agent-lens-tab-financial-advisor").click();
    await expect(page.getByTestId("agent-lens-panel")).toContainText("Financial Advisor");
    await expect(page.getByTestId("agent-lens-panel")).toBeInViewport();
  });

  test("reset clears the agent run with the active analysis", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Reset flow only needs one browser viewport.");

    await page.getByTestId("button-run-diligence-agent").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review ready", { timeout: 5_000 });
    await page.getByTestId("rail-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Not run");
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), agentStorageKey)).toBeNull();
  });
});