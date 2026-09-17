import { expect, test } from "@playwright/test";

test.describe("Financial Impact Chain", () => {
  test("opens on the return overview and separates drivers, cash flows, and assumptions", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("tab-transmission").click();

    const stressTest = page.getByRole("button", { name: /Illustrative Project Stress Test/i });
    await expect(stressTest).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("panel-impact-chain")).toBeVisible();
    await expect(page.getByTestId("provider-overlay-comparison")).toBeVisible();
    await expect(page.getByTestId("provider-overlay-comparison")).toContainText(/Synthetic underwriting baseline/i);
    await expect(page.getByTestId("provider-overlay-comparison")).toContainText(/not a disclosed Stargate tariff/i);
    await expect(page.getByTestId("impact-chain-baseline-irr")).toContainText("%");
    await expect(page.getByTestId("impact-chain-stress-irr")).toContainText("%");
    await expect(page.getByTestId("impact-chain-evidence-gap")).toContainText("difference");
    await expect(page.getByTestId("cash-flow-comparison-y0")).toHaveCount(0);
    await expect(page.getByTestId("panel-decision-context-treatment")).toHaveCount(0);

    await page.getByRole("tab", { name: "Cash Flows" }).click();
    await expect(page.getByTestId("cash-flow-comparison-y0")).toContainText("Close / Year 0");
    await expect(page.getByTestId("cash-flow-comparison-y5")).toBeVisible();
    await expect(page.getByTestId("metric-project-irr")).toBeVisible();
    await expect(page.getByTestId("coverage-y1")).toHaveText("Pre-op");
    await expect(page.getByTestId("coverage-y1")).not.toHaveText("0.00x");
    await expect(page.getByTestId("coverage-y2")).toContainText("x");
    await expect(page.getByTestId("coverage-explanation")).toContainText("scheduled interest and principal are due before operations begin");
    await expect(page.getByTestId("coverage-explanation")).toContainText("Terminal debt repayment is shown separately");
    await expect(page.getByTestId("annual-schedule-y0")).toContainText("—");

    await page.getByRole("tab", { name: "Assumptions" }).click();
    await expect(page.getByTestId("panel-decision-context-treatment")).toContainText("Source provenance:");
    await expect(page.getByTestId("panel-decision-context-treatment")).toContainText("Current classification:");
    await expect(page.getByTestId("panel-decision-context-treatment")).toContainText("Financial role:");

    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByTestId("text-current-irr-materiality")).toContainText("%");

    await page.getByRole("tab", { name: "Key Drivers" }).click();
    await expect(page.getByTestId("panel-impact-chain")).toBeHidden();
    await expect(page.getByTestId("panel-irr-waterfall")).toBeVisible();
    await expect(page.getByTestId("waterfall-methodology")).toContainText(/weaker evidence/i);

    await page.getByRole("tab", { name: "Assumptions" }).click();
    await page.getByTestId("disclosure-full-model-detail").locator(":scope > summary").click();
    await expect(page.getByTestId("disclosure-full-model-detail")).toHaveAttribute("open", "");
    await page.getByRole("tab", { name: "Key Drivers" }).click();
    await expect(page.getByTestId("panel-irr-waterfall")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Key Drivers" })).toHaveAttribute("aria-selected", "true");
  });

  test("drawer explains marginal treatment and reclassification updates the chain", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("tab-transmission").click();
    await page.getByRole("tab", { name: "Key Drivers" }).click();
    const row = page.getByTestId("impact-chain-row-electricity_cost");
    await expect(row).toContainText("User Assumption");
    await row.getByTestId("button-trace-impact-chain-electricity_cost").click();

    const drawer = page.getByTestId("context-drawer");
    await expect(drawer).toContainText("Baseline treatment");
    await expect(drawer).toContainText("Current treatment");
    await expect(drawer).toContainText("Marginal dollar impact");
    await expect(drawer).toContainText("Recurring annual line effect (excludes exit)");
    await expect(drawer).toContainText("higher cost");
    await page.keyboard.press("Escape");

    await page.getByTestId("tab-reality").click();
    await page.getByRole("button", { name: /Detailed Evidence Record/i }).click();
    await page.getByTestId("filter-evidence-all").click();
    await page.getByTestId("row-evidence-electricity_cost").locator(":scope > summary").click();
    await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
    await page.getByTestId("tab-transmission").click();
    await page.getByRole("tab", { name: "Key Drivers" }).click();
    await expect(page.getByTestId("impact-chain-row-electricity_cost")).toContainText("Missing");
  });

  test("conference transmission and advisor brief preserve project-versus-fund boundaries", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("tab-transmission").click();
    const transmission = page.getByTestId("conference-view-transmission");
    await expect(transmission.getByTestId("transmission-pathway")).toHaveCount(1);
    await expect(transmission.getByTestId("transmission-pathway")).toContainText(/Real factor/i);
    await expect(transmission.getByTestId("transmission-pathway")).toContainText(/Issuer evidence boundary/i);
    await expect(transmission.getByTestId("transmission-pathway")).toContainText(/No issuer effect is calculated or attributed without a documented relationship/i);
    await expect(transmission.getByTestId("transmission-pathway")).toContainText(/No portfolio impact is calculated/i);
    await expect(transmission).not.toContainText(/\b(?:HIGH|MODERATE|LOW)\b/);

    await page.getByTestId("tab-advisor").click();
    const advisor = page.getByTestId("conference-view-advisor");
    await expect(advisor.locator("[data-testid^='advisor-manager-question-']")).toHaveCount(3);
    await expect(advisor.getByTestId("advisor-recommended-action")).toHaveCount(1);
    await expect(advisor).not.toContainText(/\b(?:HIGH|MODERATE|LOW)\b/);
  });

  test("provider queue values and date semantics stay identical across public surfaces", async ({ page }) => {
    // Compare the same deterministic embedded snapshot, not a race between the
    // initial snapshot and a live provider response arriving during navigation.
    await page.route("**/api/ercot-queue**", (route) => route.abort());
    const routes = ["/#value-chain", "/#how-it-works"];
    const snapshots: string[] = [];
    for (const route of routes) {
      await page.goto(route);
      const snapshot = page.getByTestId("shared-provider-queue-snapshot");
      if (route === "/#value-chain") {
        await page.getByTestId("value-chain-supporting-context").locator("summary").first().click();
      } else {
        await page.getByTestId("tour-disclosure-freshness").locator("summary").click();
      }
      await expect(snapshot).toBeVisible();
      await expect(snapshot).toContainText("Embedded snapshot");
      await expect(snapshot).toContainText("aggregate values as of");
      await expect(snapshot).toContainText("source refreshed");
      await expect(snapshot).toContainText("provider response");
      await expect(snapshot).toContainText("dataset freshness");
      snapshots.push((await snapshot.textContent()) ?? "");
    }
    const snapshotSignatures = snapshots.map((text) => [
      text.match(/Total large-load queue\s*([0-9.]+ GW)/)?.[1],
      text.match(/Data-center share\s*([0-9.]+%)/)?.[1],
      text.match(/aggregate values as of\s*([^;]+)/)?.[1],
      text.match(/source refreshed\s*([^;]+)/)?.[1],
      text.match(/dataset freshness\s*([^\.]+\.)/)?.[1],
    ].join("|"));
    expect(new Set(snapshotSignatures).size).toBe(1);

    await page.goto("/#value-chain");
    await page.getByTestId("value-chain-stage-data-center-infrastructure").locator("summary").first().click();
    await expect(page.getByTestId("value-chain-stage-data-center-infrastructure")).not.toContainText("474 GW");
    await page.goto("/#how-it-works");
    await expect(page.getByTestId("timeline-milestone-6")).toContainText("QUEUE CONTEXT");
    await expect(page.getByTestId("timeline-milestone-6")).not.toContainText("474 GW");
  });
});