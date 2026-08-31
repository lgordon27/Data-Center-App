import { expect, test } from "@playwright/test";

const responseFor = (classification: string, reasoning: string) => ({
  classification,
  reasoning,
});

test.describe("AI evidence classification", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test("shows a fresh suggestion and routes acceptance through live model state", async ({ page }) => {
    let requests = 0;
    await page.route("**/api/analyze-evidence", async (route) => {
      requests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responseFor("Missing Evidence", "No facility-level disclosure establishes this input.")),
      });
    });

    await page.goto("/#evidence");
    await expect(page.getByTestId("ai-evidence-time-contract")).toContainText("Cutoff: August 30, 2026");
    await expect(page.getByTestId("ai-evidence-time-contract")).toContainText("Valid reporting: 2025–2026");
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
     await expect(row.getByTestId("ai-trust-context-community_risk")).toHaveText("Only 3% of Americans have high confidence in AI for financial guidance. This suggestion is a starting point, not a conclusion. Your classification is the one the model uses.");
     await expect(row.getByTestId("ai-trust-source-community_risk")).toHaveText("Gallup/Edward Jones, August 2026");
    await expect(row.getByTestId("select-classification-community_risk")).toHaveValue("Verified Evidence");
    expect(requests).toBe(1);

    await row.getByTestId("button-accept-ai-community_risk").click();
    await expect(row.getByTestId("select-classification-community_risk")).toHaveValue("Missing Evidence");
    await expect(row.getByTestId("review-marker-community_risk")).toContainText("AI-suggested, accepted by analyst");
    await expect(row.getByTestId("status-ai-decision-community_risk")).toContainText("Classification updated");
    await expect(page.getByTestId("toast-reclassification")).toBeVisible();
    await expect(page.getByTestId("live-recommendation")).toContainText("BLOCKED");
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __sessionActions?: unknown[] }).__sessionActions)).toEqual([
      { action: "AI-proposed, human-accepted", itemId: "community_risk" },
    ]);

    const stored = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes("ai")));
    expect(stored).toEqual([]);
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem("safeloc:diligence:current-session:v1") ?? "{}"));
    expect(session.reviewMetadata.community_risk.kind).toBe("ai-accepted");
    expect(session.reviewMetadata.community_risk.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  test("keeps overrides unchanged and processes all 16 items sequentially", async ({ page }) => {
    const requestedIds: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    await page.route("**/api/analyze-evidence", async (route) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
       const body = await route.request().postDataJSON() as { name: string };
       const id = body.name;
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
    await expect(overrideRow.getByTestId("review-marker-water_rights")).toContainText("AI-suggested, overridden by analyst");
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
    await expect(page.getByTestId("review-marker-water_rights")).toContainText("AI-suggested, overridden by analyst");
    expect(await page.getByTestId("select-classification-electricity_cost").inputValue()).toBe("Verified Evidence");
    await expect(page.locator("[data-testid^='ai-assessment-']")).toHaveCount(16);
     await expect(page.locator("[data-testid^='ai-trust-context-']")).toHaveCount(16);
     await expect(page.locator("[data-testid^='ai-trust-source-']")).toHaveCount(16);
     await expect(page.getByTestId("ai-trust-context-electricity_cost")).toContainText("Your classification is the one the model uses.");
     await expect(page.getByTestId("ai-trust-source-electricity_cost")).toHaveText("Gallup/Edward Jones, August 2026");
  });

  test("clears suggestions after refresh and displays manual-review errors", async ({ page }) => {
    await page.route("**/api/analyze-evidence", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "not structured" });
    });

    await page.goto("/#evidence");
    const row = page.getByTestId("row-evidence-electricity_cost");
    await row.getByTestId("button-analyze-ai-electricity_cost").click();
    await expect(row.getByTestId("text-ai-raw-response-electricity_cost")).toContainText("not structured");
     await expect(row.locator("[data-testid^='ai-trust-context-']")).toHaveCount(0);
     await expect(row.locator("[data-testid^='ai-trust-source-']")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("row-evidence-electricity_cost").getByTestId("ai-assessment-electricity_cost")).not.toBeVisible();
  });

  test("persists acceptance when AI confirms the existing classification", async ({ page }) => {
    await page.route("**/api/analyze-evidence", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responseFor("Missing Evidence", "The available sources still do not establish facility-level rights.")),
      });
    });

    await page.goto("/#evidence");
    const row = page.getByTestId("row-evidence-water_rights");
    await expect(row.getByTestId("select-classification-water_rights")).toHaveValue("Missing Evidence");
    await row.getByTestId("button-analyze-ai-water_rights").click();
    await row.getByTestId("button-accept-ai-water_rights").click();

    const marker = row.getByTestId("review-marker-water_rights");
    await expect(marker).toContainText("AI-suggested, accepted by analyst");
    await expect(page.getByTestId("toast-reclassification")).not.toBeVisible();
    const storedReview = await page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem("safeloc:diligence:current-session:v1") ?? "{}");
      return session.reviewMetadata?.water_rights;
    });
    expect(storedReview.kind).toBe("ai-accepted");

    await page.reload();
    await expect(row.getByTestId("select-classification-water_rights")).toHaveValue("Missing Evidence");
    await expect(marker).toContainText("AI-suggested, accepted by analyst");
    await expect(marker.locator("time")).toHaveAttribute("datetime", storedReview.reviewedAt);
    await expect(row.getByTestId("ai-assessment-water_rights")).not.toBeVisible();
  });
});