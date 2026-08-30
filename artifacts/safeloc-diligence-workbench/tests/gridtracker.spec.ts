import { expect, test } from "@playwright/test";

const providerResult = {
  ok: true,
  query: "What's the current queue status for Oracle's Abilene interconnection request?",
  kind: "queue-snapshot",
  answer: {
    summary: "Oracle Abilene request is active in the discovered queue snapshot.",
    records: [{ label: "Oracle Abilene", value: "Active", detail: "Oncor interconnection request" }],
  },
  freshness: "live",
  cache: { hit: false, stale: false, ageMs: 0, ttlMs: 86400000 },
  source: {
    name: "GridTracker MCP Server",
    attribution: "Model Context Protocol",
    retrievedAt: "2026-08-30T02:55:00.000Z",
    dataTimestamp: "2026-08-29",
  },
  evidenceMapping: {
    evidenceId: "grid_interconnection",
    label: "Grid Interconnection Timeline",
    proposedClassification: "Verified Evidence",
    directlySupports: true,
    rationale: "The discovered provider response corroborates the mapped grid record.",
  },
  connection: {
    status: "connected",
    endpointConfigured: true,
    protocolVersion: "2025-06-18",
    negotiatedAt: "2026-08-30T02:55:00.000Z",
  },
  diagnostics: { historyId: "history-test" },
};

test.describe("GridTracker governed query flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.route("**/api/gridtracker/query?*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(providerResult) });
    });
  });

  test("queries live grid intelligence and requires explicit verification", async ({ page }) => {
    await page.goto("/#evidence");
    await expect(page.getByTestId("button-query-live-grid-data")).toBeVisible();
    await expect(page.getByTestId("gridtracker-entry")).toContainText("GridTracker MCP Server | Model Context Protocol");
    await page.getByTestId("select-classification-grid_interconnection").selectOption("Management Assertion");

    await page.getByTestId("button-query-live-grid-data").click();
    await expect(page.getByTestId("gridtracker-panel")).toBeVisible();
    await page.getByTestId("gridtracker-example-0").click();
    await expect(page.getByTestId("gridtracker-result")).toContainText("Oracle Abilene request is active");
    await expect(page.getByTestId("gridtracker-result")).toContainText("live");
    await expect(page.getByTestId("gridtracker-result")).toContainText("Source timestamp: 2026-08-29");

    const classification = page.getByTestId("select-classification-grid_interconnection");
    await expect(classification).toHaveValue("Management Assertion");
    await page.getByTestId("gridtracker-verify-btn").click();
    await expect(classification).toHaveValue("Verified Evidence");
    await expect(page.getByTestId("gridtracker-verify-btn")).toHaveText("Verified Evidence confirmed");
    await expect(page.getByTestId("toast-reclassification")).toBeVisible();
  });

  test("shows the MCP console and stays usable on a narrow screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#evidence");
    await page.getByTestId("button-open-menu").click();
    await expect(page.getByTestId("mobile-navigation")).toBeVisible();
    await page.getByTestId("mobile-navigate-evidence").click();
    await page.getByTestId("button-query-live-grid-data").click();
    await expect(page.getByTestId("gridtracker-panel")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByTestId("button-developer-console-mobile").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Developer Console" })).toBeVisible();
    await expect(page.getByText("MCP Server", { exact: true })).toBeVisible();
    await page.getByLabel("Close console").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});