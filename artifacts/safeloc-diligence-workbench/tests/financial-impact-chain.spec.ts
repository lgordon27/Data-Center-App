import { expect, test } from "@playwright/test";

test.describe("Financial Impact Chain", () => {
  test("opens on the live marginal chain with a baseline/stress cash-flow comparison", async ({ page }) => {
    await page.goto("/#materiality");

    await expect(page.getByTestId("panel-impact-chain")).toBeVisible();
    await expect(page.getByTestId("impact-chain-baseline-irr")).toContainText("%");
    await expect(page.getByTestId("impact-chain-stress-irr")).toContainText("%");
    await expect(page.getByTestId("impact-chain-evidence-gap")).toContainText("gap");
    await expect(page.getByTestId("cash-flow-comparison-y0")).toContainText("Close / Year 0");
    await expect(page.getByTestId("cash-flow-comparison-y5")).toBeVisible();
    await expect(page.getByTestId("metric-project-irr")).toBeVisible();
    await expect(page.getByTestId("panel-decision-context-treatment")).toContainText("Source provenance:");
    await expect(page.getByTestId("panel-decision-context-treatment")).toContainText("Current classification:");
    await expect(page.getByTestId("panel-decision-context-treatment")).toContainText("Financial role:");

    const stressIrr = await page.getByTestId("impact-chain-stress-irr").textContent();
    await page.goto("/#decision");
    await expect(page.getByTestId("text-decision-irr")).toHaveText(stressIrr ?? "");

    await page.goto("/#materiality");
    await page.getByRole("tab", { name: "Drivers" }).click();
    await expect(page.getByTestId("panel-impact-chain")).toBeHidden();
    await expect(page.getByTestId("panel-irr-waterfall")).toBeVisible();
    await expect(page.getByTestId("waterfall-methodology")).toContainText("weaker evidence");

    await page.getByRole("tab", { name: "Full Model" }).click();
    await expect(page.getByTestId("disclosure-full-model-detail")).toHaveAttribute("open", "");
    await page.getByRole("tab", { name: "Drivers" }).click();
    await expect(page.getByTestId("panel-irr-waterfall")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Drivers" })).toHaveAttribute("aria-selected", "true");
  });

  test("drawer explains marginal treatment and reclassification updates the chain", async ({ page }) => {
    await page.goto("/#materiality");
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

    await page.goto("/#evidence");
    await page.getByTestId("row-evidence-electricity_cost").locator("summary").first().click();
    await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
    await page.goto("/#materiality");
    await expect(page.getByTestId("impact-chain-row-electricity_cost")).toContainText("Missing");
  });

  test("decision consequences and advisor transmission preserve role boundaries", async ({ page }) => {
    await page.goto("/#decision");
    await expect(page.getByTestId("decision-consequence-register")).toBeVisible();
    await expect(page.getByTestId("decision-consequence-water_rights")).toContainText("no direct modeled adjustment");
    await expect(page.getByTestId("decision-consequence-site_hazard_exposure")).toContainText("modeled treatment: Model Inference");

    await page.goto("/#advisor");
    await expect(page.getByTestId("advisor-transmission-bridge")).toBeVisible();
    await expect(page.getByTestId("advisor-bridge-project-model")).toContainText("stress");
    await expect(page.getByTestId("advisor-bridge-public-context")).toContainText("Public-source context");
    await expect(page.getByTestId("advisor-bridge-analyst-scenario")).toContainText("Do not convert");
  });

  test("provider queue values and date semantics stay identical across public surfaces", async ({ page }) => {
    const routes = ["/", "/#value-chain", "/#how-it-works", "/#analysis"];
    const snapshots: string[] = [];
    for (const route of routes) {
      await page.goto(route);
      const snapshot = page.getByTestId("shared-provider-queue-snapshot");
      await expect(snapshot).toBeVisible();
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