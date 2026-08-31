import { expect, test } from "@playwright/test";

const evidenceIds = [
  "electricity_cost",
  "water_consumption",
  "grid_interconnection",
  "water_escalation",
  "community_risk",
  "renewable_percentage",
  "cooling_capex",
  "electricity_escalation",
  "carbon_compliance",
  "permitting_timeline",
  "customer_concentration",
  "water_rights",
  "site_hazard_exposure",
  "backup_power_capacity",
  "water_source_resilience",
  "downtime_cost",
];
const scenariosKey = "safeloc:diligence:scenarios:v1";

function customResponse() {
  return {
    projectSummary: {
      name: "Project Atlas",
      location: "Maricopa County, Arizona",
      description: "High-level research found equipment procurement and lead-time concerns, local electricity-rate questions, noise and operational considerations, jurisdictional moratorium review, and semiconductor and memory supply-chain constraints. Regional grid-load requests are context, not facility proof.",
      capacityMW: 600,
    },
    evidence: evidenceIds.map((id, index) => ({
      id,
      label: id.replaceAll("_", " "),
      value: index === 0 ? 48 : "Not disclosed",
      unit: index === 0 ? "$/MWh" : "Project context",
      classification: index % 2 === 0 ? "Missing Evidence" : "Management Assertion",
      citation: "Public source searched for Project Atlas (2026).",
      ...(index === 0 ? {
        sourceUrl: "https://example.com/atlas/source",
        sourceTitle: "Project Atlas public filing",
        sourcePublisher: "example.com",
        sourcePublishedAt: "2026-06-01",
        sourceAccessedAt: "2026-08-30",
        sourceAccessStatus: "not provided",
      } : {}),
      description: "The public record does not establish a facility-level value.",
      sourceRole: "AI-researched public-source review",
      ...(index === 0 ? { numericValue: 48 } : {}),
      ...(id === "site_hazard_exposure" ? { qualitativeValue: "high" } : {}),
      ...(id === "water_source_resilience" ? { qualitativeValue: "single-source" } : {}),
    })),
  };
}

test.describe("custom project research", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/research-project", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(customResponse()) });
    });
  });

  test("launches research from Home, preserves 16 items, and resets to Stargate", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("home-custom-analysis")).toBeVisible();
    await page.getByTestId("input-custom-project-name").fill("Project Atlas");
    await page.getByTestId("input-custom-project-location").fill("Maricopa County, Arizona");
    await page.getByTestId("button-run-ai-analysis").click();
    await expect(page.getByTestId("home-custom-analysis-loading")).toBeVisible();
    await expect(page).toHaveURL(/#brief$/);
    await expect(page.getByTestId("custom-project-status")).toContainText("AI-researched");
    await expect(page.getByTestId("custom-project-description")).toContainText("equipment procurement");
    await expect(page.getByTestId("custom-project-capacity")).toHaveText("1,200 MW");
    await expect(page.getByTestId("custom-project-summary")).toContainText("Reported capacity is not verified or used");
    await expect(page.getByTestId("custom-project-summary")).not.toContainText("Research scale");
    await expect(page.getByTestId("custom-research-banner")).toContainText("Financial outputs remain synthetic");

    const scope = page.getByTestId("disclosure-scope-limitations");
    await expect(scope).not.toHaveAttribute("open", "");
    await scope.locator("summary").click();
    await expect(scope).toHaveAttribute("open", "");
    await expect(page.getByTestId("scope-limitations-content")).toContainText("Semiconductor and memory supply constraints");

    await page.goto("/#evidence");
    await expect(page.getByTestId("text-evidence-count")).toContainText("16 / 16");
    await expect(page.getByTestId("badge-ai-researched-electricity_cost")).toBeVisible();
    await expect(page.getByTestId("select-classification-electricity_cost")).toBeVisible();
    await expect(page.getByTestId("custom-research-banner")).toBeVisible();
    await expect(page.getByTestId("eia-electricity-evidence")).toHaveCount(0);
    await expect(page.getByTestId("button-analyze-all-ai")).toBeDisabled();
    await expect(page.getByTestId("button-analyze-ai-electricity_cost")).toBeDisabled();
    await expect(page.getByTestId("custom-ai-reassessment-note")).toContainText("manual-review only");
    await expect(page.getByTestId("link-custom-source-electricity_cost")).toHaveAttribute("href", "https://example.com/atlas/source");
    await expect(page.getByTestId("link-custom-source-electricity_cost")).toHaveAttribute("target", "_blank");
    await expect(page.getByTestId("link-custom-source-electricity_cost")).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.getByTestId("link-custom-source-electricity_cost")).toContainText("Project Atlas public filing");
    await expect(page.getByTestId("custom-source-metadata-electricity_cost")).toContainText("Jun 1, 2026");
    await expect(page.getByTestId("custom-source-metadata-electricity_cost")).toContainText("Aug 30, 2026");
    await expect(page.getByTestId("custom-source-metadata-electricity_cost")).toContainText("not provided");
    await expect(page.getByTestId("custom-source-context-electricity_cost")).toContainText("not facility-level proof");
    await expect(page.getByTestId("custom-source-missing-water_consumption")).toContainText("No validated direct source link returned");

    for (const route of ["materiality", "decision", "advisor"]) {
      await page.goto(`/#${route}`);
      await expect(page.getByTestId("custom-research-banner")).toContainText("Project Atlas");
      await expect(page.locator("main")).not.toContainText("Stargate Abilene");
    }

    await page.goto("/#decision");
    await expect(page.getByTestId("custom-scenario-disabled")).toContainText("not saved to browser storage");
    await expect(page.getByTestId("button-save-scenario")).toBeDisabled();
    await expect(page.getByTestId("button-compare-scenarios")).toBeDisabled();
    await expect(page.getByTestId("panel-saved-scenarios")).toHaveCount(0);
    await expect(page.getByTestId("status-recommendation")).toHaveText("BLOCKED");
    await expect(page.getByTestId("material-gap-row-grid_interconnection")).toBeVisible();
    await expect(page.getByTestId("material-gap-row-community_risk")).toBeVisible();
    await expect(page.getByTestId("material-gap-row-customer_concentration")).toBeVisible();
    await expect(page.getByTestId("material-gap-row-water_source_resilience")).toBeVisible();
    await expect(page.getByTestId("material-gap-row-electricity_cost")).toHaveCount(0);
    await expect(page.getByTestId("material-gap-row-water_consumption")).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), scenariosKey)).toBeNull();

    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page).toHaveURL(/#brief$/);
    await expect(page.getByRole("heading", { name: /return is only as durable/i })).toBeVisible();
    await expect(page.getByTestId("custom-research-banner")).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), scenariosKey)).toBeNull();
    await page.reload();
    await expect(page.getByTestId("custom-research-banner")).toHaveCount(0);
    await expect(page).toHaveURL(/#brief$/);
  });

  test("keeps the scope disclosure closed by default on the curated case", async ({ page }) => {
    await page.goto("/#brief");
    const scope = page.getByTestId("disclosure-scope-limitations");
    await expect(scope).not.toHaveAttribute("open", "");
    await expect(scope.getByTestId("scope-limitations-content")).toBeHidden();
  });
});
