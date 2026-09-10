import { expect, test, type Page } from "@playwright/test";

const agentStorageKey = "safeloc:diligence:agent-run:v1";
const lineageKey = "safeloc:diligence:financial-lineage:v1";

async function showAllContext(page: Page) {
  const viewAll = page.getByTestId("agent-view-all-context");
  if (await viewAll.count()) await viewAll.click();
}

test.describe("governed diligence review", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#analysis");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test("prepares a review of retained evidence and persists a reject without changing evidence", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Persistence behavior only needs one browser viewport.");

    const runButton = page.getByTestId("button-run-diligence-agent");
    await expect(runButton).toBeVisible();
    await expect(page.getByTestId("agent-run-status")).toContainText("Not prepared");
    await expect(page.getByTestId("agent-activity-disclosure")).not.toHaveJSProperty("open", true);

    await runButton.click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review prepared", { timeout: 5_000 });

    // Recorded operations stay collapsed behind progressive disclosure.
    await page.getByTestId("agent-activity-disclosure").locator(":scope > summary").click();
    await expect(page.getByTestId("agent-stage-identity")).toContainText(/identity/i);
    await expect(page.getByTestId("agent-stage-list").locator("li")).toHaveCount(10);

    await expect(page.getByTestId("agent-review-package")).toBeVisible();
    await page.getByTestId("agent-relationship-disclosure").locator(":scope > summary").click();
    await expect(page.getByTestId("agent-relationship-disclosure")).toContainText("Direct");
    await expect(page.getByTestId("agent-relationship-disclosure")).toContainText("Not found");

    // The curated record is contextual: Reject / Leave unresolved exist; Accept / Override do not.
    await expect(page.getByTestId("agent-decision-agent-finding-grid-accepted")).toHaveCount(0);
    await expect(page.getByTestId("agent-decision-agent-finding-grid-overridden")).toHaveCount(0);
    await showAllContext(page);
    await page.getByTestId("agent-decision-agent-finding-grid-rejected").click();
    await expect(page.getByTestId("agent-finding-agent-finding-grid")).toContainText("Rejected");
    await expect(page.getByTestId("agent-disposition-confirmation")).toBeFocused();
    await expect(page.getByTestId("agent-disposition-confirmation")).toContainText("Reject recorded");

    // A reject persists the review run but never recalculates the model.
    expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").status, agentStorageKey)).toBe("review-ready");
    expect(await page.evaluate((key) => (JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{ action: string }>).filter((event) => event.action === "financial-recalculation").length, lineageKey)).toBe(0);

    await page.reload();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review prepared");
    await showAllContext(page);
    await expect(page.getByTestId("agent-finding-agent-finding-grid")).toContainText("Rejected");
  });

  test("keeps the action and lenses usable on a narrow screen", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 390, "Responsive behavior is covered in the mobile project.");

    await expect(page.getByTestId("button-run-diligence-agent")).toBeVisible();
    await page.getByTestId("button-run-diligence-agent").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review prepared", { timeout: 5_000 });
    await page.getByTestId("agent-lenses-disclosure").locator(":scope > summary").click();
    await expect(page.getByTestId("agent-lenses")).toBeVisible();
    await page.getByTestId("agent-lens-tab-financial-advisor").click();
    await expect(page.getByTestId("agent-lens-panel")).toContainText("Financial Advisor");
    await expect(page.getByTestId("agent-lens-panel")).toBeInViewport();
  });

  test("reset clears the agent run with the active analysis", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Reset flow only needs one browser viewport.");

    await page.getByTestId("button-run-diligence-agent").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Review prepared", { timeout: 5_000 });
    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Not prepared");
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), agentStorageKey)).toBeNull();
  });
});
