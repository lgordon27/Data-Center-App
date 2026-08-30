import { expect, test } from "@playwright/test";

const responseFor = (classification: string, reasoning: string) => ({
  content: [{ type: "text", text: JSON.stringify({ classification, reasoning }) }],
});

test.describe("AI evidence classification", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test("shows a fresh suggestion and routes acceptance through live model state", async ({ page }) => {
    let requests = 0;
    await page.route("https://api.anthropic.com/v1/messages", async (route) => {
      requests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responseFor("Missing Evidence", "No facility-level disclosure establishes this input.")),
      });
    });

    await page.goto("/#evidence");
    await page.evaluate(() => {
      const events: unknown[] = [];
      window.addEventListener("safeloc:session-action", (event) => events.push((event as CustomEvent).detail));
      (window as typeof window & { __sessionActions?: unknown[] }).__sessionActions = events;
    });
    const row = page.getByTestId("row-evidence-community_risk");
    await row.getByTestId("button-analyze-ai-community_risk").click();
    await expect(row.getByTestId("ai-assessment-community_risk")).toContainText("AI Assessment");
    await expect(row.getByTestId("badge-classification-missing")).toBeVisible();
    await expect(row).toContainText("Suggestion, not a determination");
    await expect(row.getByTestId("select-classification-community_risk")).toHaveValue("Verified Evidence");
    expect(requests).toBe(1);

    await row.getByTestId("button-accept-ai-community_risk").click();
    await expect(row.getByTestId("select-classification-community_risk")).toHaveValue("Missing Evidence");
    await expect(row.getByTestId("status-ai-decision-community_risk")).toContainText("Classification updated");
    await expect(page.getByTestId("toast-reclassification")).toBeVisible();
    await expect(page.getByTestId("live-recommendation")).toContainText("BLOCKED");
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __sessionActions?: unknown[] }).__sessionActions)).toEqual([
      { action: "AI-proposed, human-accepted", itemId: "community_risk" },
    ]);

    const stored = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes("ai")));
    expect(stored).toEqual([]);
  });

  test("keeps overrides unchanged and processes all 16 items sequentially", async ({ page }) => {
    const requestedIds: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    await page.route("https://api.anthropic.com/v1/messages", async (route) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const body = await route.request().postDataJSON() as { messages: Array<{ content: string }> };
      const id = body.messages[0].content.match(/Variable: ([^.]+)\./)?.[1] ?? "unknown";
      requestedIds.push(id);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responseFor("Management Assertion", "The source provides a project statement but limited independent verification.")),
      });
      inFlight -= 1;
    });

    await page.goto("/#evidence");
    await page.evaluate(() => {
      const events: unknown[] = [];
      window.addEventListener("safeloc:session-action", (event) => events.push((event as CustomEvent).detail));
      (window as typeof window & { __sessionActions?: unknown[] }).__sessionActions = events;
    });
    const overrideRow = page.getByTestId("row-evidence-water_rights");
    await overrideRow.getByTestId("button-analyze-ai-water_rights").click();
    await expect(overrideRow.getByTestId("ai-assessment-water_rights")).toBeVisible();
    await overrideRow.getByTestId("button-override-ai-water_rights").click();
    await expect(overrideRow.getByTestId("select-classification-water_rights")).toHaveValue("Missing Evidence");
    await expect(overrideRow.getByTestId("status-ai-decision-water_rights")).toContainText("unchanged");
    await expect(page.getByTestId("toast-reclassification")).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __sessionActions?: unknown[] }).__sessionActions)).toEqual([
      { action: "AI-proposed, human-overridden", itemId: "water_rights" },
    ]);

    await page.getByTestId("button-analyze-all-ai").click();
    await expect(page.getByTestId("status-ai-batch")).toContainText("One item at a time");
    await expect(page.getByTestId("ai-assessment-electricity_cost")).toBeVisible();
    await expect.poll(() => requestedIds.length).toBe(17);
    await expect.poll(() => page.getByTestId("button-analyze-all-ai").textContent()).toContain("Analyze All with AI");
    expect(maxInFlight).toBe(1);
    expect(await page.getByTestId("select-classification-water_rights").inputValue()).toBe("Missing Evidence");
    expect(await page.getByTestId("select-classification-electricity_cost").inputValue()).toBe("Verified Evidence");
    await expect(page.locator("[data-testid^='ai-assessment-']")).toHaveCount(16);
  });

  test("clears suggestions after refresh and displays manual-review errors", async ({ page }) => {
    await page.route("https://api.anthropic.com/v1/messages", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "not structured" });
    });

    await page.goto("/#evidence");
    const row = page.getByTestId("row-evidence-electricity_cost");
    await row.getByTestId("button-analyze-ai-electricity_cost").click();
    await expect(row.getByTestId("text-ai-raw-response-electricity_cost")).toContainText("not structured");
    await page.reload();
    await expect(page.getByTestId("row-evidence-electricity_cost").getByTestId("ai-assessment-electricity_cost")).not.toBeVisible();
  });
});