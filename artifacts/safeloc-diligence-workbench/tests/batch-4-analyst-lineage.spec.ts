import { expect, test, type Page } from "@playwright/test";

const agentKey = "safeloc:diligence:agent-run:v1";
const lineageKey = "safeloc:diligence:financial-lineage:v1";
const scenariosKey = "safeloc:diligence:scenarios:v1";

async function openAgent(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/#analysis");
  await expect(page.getByRole("tablist", { name: "Analysis views" }).getByRole("tab")).toHaveCount(4);
  await page.getByTestId("tab-market").click();
  await page.getByTestId("button-run-diligence-agent").click();
  await expect(page.getByTestId("agent-run-status")).toContainText("Review ready", { timeout: 5_000 });
}

test.describe("Batch 4 analyst proposal lineage", () => {
  test("keeps proposals inert, exposes four decisions, and records reject/unresolved without recalculation", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Decision lifecycle runs once on desktop.");
    await openAgent(page);
    const recalculationsBefore = await page.evaluate((key) => (JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{ action: string }>).filter((event) => event.action === "financial-recalculation").length, lineageKey);
    await expect(page.getByTestId("agent-review-package")).toContainText("Reject and Leave unresolved preserve the model");
    const grid = page.getByTestId("agent-finding-agent-finding-grid");
    await expect(grid).toBeVisible();
    for (const action of ["accepted", "overridden", "rejected", "unresolved"]) {
      await expect(page.getByTestId(`agent-decision-agent-finding-grid-${action}`)).toBeVisible();
    }
    await page.getByTestId("agent-decision-agent-finding-grid-rejected").click();
    await expect(grid).toContainText("Rejected");
    expect(await page.evaluate((key) => (JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{ action: string }>).filter((event) => event.action === "financial-recalculation").length, lineageKey)).toBe(recalculationsBefore);
    const community = page.getByTestId("agent-decision-agent-finding-community-unresolved");
    await community.click();
    await expect(page.getByTestId("agent-finding-agent-finding-community")).toContainText("Unresolved");
    expect(await page.evaluate((key) => (JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{ action: string }>).filter((event) => event.action === "financial-recalculation").length, lineageKey)).toBe(recalculationsBefore);
  });

  test("shows bulk controls, exact-project/context-only qualifiers, and append-only history", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "Lineage assertions run once on desktop.");
    await openAgent(page);
    await expect(page.getByTestId("agent-bulk-accept")).toBeVisible();
    await expect(page.getByTestId("agent-bulk-reject")).toBeVisible();
    await expect(page.getByTestId("agent-review-package")).toContainText(/exact-project|context-only/);
    await page.getByTestId("agent-decision-agent-finding-grid-accepted").click();
    await expect(page.getByTestId("agent-audit-timeline")).toContainText("Accepted");
    await page.getByTestId("financial-lineage-history").locator(":scope > summary").click();
    await expect(page.getByTestId("financial-lineage-history")).toContainText("proposal");
    await expect(page.getByTestId("financial-lineage-history")).toContainText("analyst");
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]").length, lineageKey)).toBeGreaterThan(0);
    const historyBefore = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]").length, lineageKey);
    await page.getByTestId("agent-reverse-agent-finding-grid").click();
    await expect(page.getByTestId("agent-audit-timeline")).toContainText("Reversed");
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]").length, lineageKey)).toBeGreaterThanOrEqual(historyBefore);
  });

  test("refreshes deliberate stale paths, preserves reproducibility fields, and reset clears the run", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 1440, "State transition assertions run once on desktop.");
    await openAgent(page);
    await page.getByTestId("tab-reality").click();
    const evidence = page.getByRole("button", { name: /Detailed Evidence Record/i });
    if (await evidence.getAttribute("aria-expanded") === "false") await evidence.click();
    await page.getByTestId("filter-evidence-all").click();
    const select = page.getByTestId("select-classification-grid_interconnection");
    await select.selectOption("Management Assertion");
    await page.getByTestId("tab-market").click();
    await expect(page.getByTestId("agent-stale-warning")).toBeVisible();
    await expect(page.getByTestId("agent-bulk-accept")).toBeDisabled();
    const staleApply = page.locator("[data-testid^='agent-apply-stale-']").first();
    if (await staleApply.count()) {
      await staleApply.click();
      await expect(page.getByTestId("agent-audit-timeline")).toContainText("Accepted");
    }
    await page.getByTestId("button-run-diligence-agent").click();
    await expect(page.getByTestId("agent-stale-warning")).not.toBeVisible();
    const run = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), agentKey);
    expect(run.projectKey).toBeTruthy();
    expect(run.evidenceSnapshotKey).toBeTruthy();
    await page.getByTestId("tab-transmission").click();
    await page.getByTestId("rail-save-scenario").click();
    await page.getByTestId("input-scenario-name").fill("Batch 4 reproducible case");
    await page.getByTestId("button-confirm-save-scenario").click();
    const scenario = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios[0], scenariosKey);
    expect(scenario.reproducibility).toMatchObject({
      inputFingerprint: expect.any(String),
      modelIdentity: expect.any(String),
      releaseIdentity: expect.any(String),
    });
    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page.getByTestId("agent-run-status")).toContainText("Not run");
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), agentKey)).toBeNull();
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios.length, scenariosKey)).toBe(1);
  });

  test("keeps the four-tab workbench usable on mobile without overflow", async ({ page, viewport }) => {
    test.skip(viewport?.width !== 390, "Mobile behavior is covered in the mobile project.");
    await page.goto("/#analysis");
    await expect(page.getByRole("tablist", { name: "Analysis views" }).getByRole("tab")).toHaveCount(4);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByTestId("tab-market").click();
    await expect(page.getByTestId("button-run-diligence-agent")).toBeVisible();
    await page.getByTestId("button-run-diligence-agent").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("button-run-diligence-agent")).toBeInViewport();
  });
});