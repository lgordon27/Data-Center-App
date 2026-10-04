import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { blockUnmockedProviderRequests } from "./offline-provider-reads";

// Saved session fixtures only; no research, public-document or provider calls.
const financial = JSON.parse(readFileSync(new URL("./fixtures/session-financial-review.json", import.meta.url), "utf8"));
const ids = ["electricity_cost", "water_consumption", "grid_interconnection", "water_escalation", "community_risk", "renewable_percentage", "cooling_capex", "electricity_escalation", "carbon_compliance", "permitting_timeline", "customer_concentration", "water_rights", "site_hazard_exposure", "backup_power_capacity", "water_source_resilience", "downtime_cost"];
const passage = `The developer reported plans for the Orion Compute Data Center campus. The county report describes the proposed scope, but it does not confirm the operating timetable or a binding utility contract. ${"Additional attributed context remains source material, not accepted financial inputs. ".repeat(7)}`;
const retained = {
  id: "report-1", topic: "project context", assessment: "attributed-report", applicability: "exact-project",
  financialProposalEligibility: "unresolved", statement: "Unsupported summary must not be promoted.",
  attribution: "Attributed to county reporting", projectScope: "Proposed campus; operating timetable unresolved",
  phaseScope: "Not established", timePeriod: null, powerMeasure: null, powerClaimState: "not-present", powerClaim: null,
  reportingDate: "2026-09-01", reportingDateBasis: "visible-publication-line", accessedAt: null, accessedAtBasis: "not-recorded",
  sourceTitle: "Illustrative county reporting", sourceUrl: "https://county.example.test/orion",
  passage, evidenceEligibility: "research-only", demonstratedFinancialEffect: false,
};

async function seed(page: Page) {
  await blockUnmockedProviderRequests(page);
  await page.clock.setFixedTime(new Date(financial.now));
  await page.goto("/");
  const evidence = Object.fromEntries(ids.map((id) => [id, {
    id, label: id.replaceAll("_", " "), value: "Not established", unit: "",
    classification: "Missing Evidence", impactRole: id === "community_risk" || id === "renewable_percentage" ? "Context Indicator" : "Financial Driver",
    sourceRole: "Saved partial research", citation: "", description: "Not established in this run", sourceId: null, providerSourceId: null,
  }]));
  const candidate = financial.candidates[0];
  const project = {
    kind: "custom", name: financial.context.projectName, location: "Texas", description: "Saved partial research fixture", capacityMW: null,
    researchMode: "research-incomplete", researchStatus: "partial",
    researchOutcome: { state: "incomplete-not-assessed", eligibleEvidenceCount: 1, reasonCodes: ["category-not-assessed"] },
    retainedFindings: [retained], researchProposals: { electricity_cost: candidate },
    researchAudit: { categories: [
      { categoryId: "water", label: "Water", evidenceIds: ["water_consumption"], analysisOutcome: "not-assessed", notRunReason: "no-admitted-passage-text" },
      { categoryId: "community", label: "Community", evidenceIds: ["community_risk"], analysisOutcome: "not-assessed", notRunReason: "no-admitted-passage-text" },
    ] },
  };
  await page.evaluate((payload) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("safeloc:diligence:current-session:v1", JSON.stringify(payload));
  }, {
    version: 2, canonicalProvenanceVersion: 2, hasChangedClassification: true, classifications: {}, overrides: {}, reviewMetadata: {},
    customResearch: { project, evidence, modelEvidence: evidence, researchProposals: project.researchProposals, researchProposalDispositions: {}, researchProposalOverrides: {} },
  });
  await page.goto("/#analysis");
  // A hash-only navigation keeps the mounted context; reload to restore the seed.
  await page.reload();
}

test("partial saved results retain reporting, exact passages and three-item unresolved expansion on both surfaces", async ({ page }, testInfo) => {
  await seed(page);
  await expect(page.getByTestId("conference-view-reality")).toBeVisible();
  await expect(page.getByTestId("conference-summary").locator("h1")).toHaveCount(1);
  await expect(page.getByTestId("project-context-binding")).toBeHidden();
  await expect(page.getByTestId("reality-evidence-established")).toContainText("Not established in this run");
  await expect(page.getByTestId("reality-evidence-reported")).toContainText("Attributed to county reporting");
  await expect(page.getByTestId("reality-evidence-open").locator(":scope > ul > li")).toHaveCount(3);
  await expect(page.getByTestId("reality-evidence-open")).toContainText("Not assessed: no admitted passage text");
  await expect(page.getByTestId("reality-evidence-reported")).not.toContainText("No sourced management assertions");
  const original = page.getByTestId("retained-research-findings-report-1").locator("blockquote");
  await expect(original).toBeHidden();
  await page.getByTestId("retained-research-findings-report-1").getByText("Exact original passage", { exact: true }).click();
  await expect(original).toHaveText(`Exact retained source passage: ${passage}`);
  await expect(page.getByTestId("retained-research-findings-report-1-excerpt")).not.toContainText("Unsupported summary");
  await page.getByTestId("reality-evidence-open").getByText(/Show remaining/).click();
  await expect(page.getByTestId("reality-evidence-open").locator("details[open]")).toBeVisible();
  await page.getByTestId("reality-category-community").locator("summary").click();
  await expect(page.getByTestId("community-documentation")).toContainText("Not assessed: no admitted passage text");
  await expect(page.getByTestId("community-documentation")).not.toContainText("No project-specific documentation found");
  await page.getByTestId("retained-research-findings-report-1").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `../../screenshots/safeloc-results-after-${testInfo.project.name}-expanded.png`, fullPage: true });
  await page.getByTestId("tab-advisor").click();
  await expect(page.getByTestId("advisor-evidence-established")).toContainText("Not established in this run");
  await expect(page.getByTestId("advisor-evidence-reported")).toContainText("Attributed to county reporting");
  await expect(page.getByTestId("advisor-evidence-open")).toContainText("Not assessed: no admitted passage text");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("financial controls require opt-in and model, but valid partial candidate review can be accepted with history", async ({ page }) => {
  await seed(page);
  await page.getByTestId("tab-transmission").click();
  await expect(page.getByTestId("financial-session-review")).toHaveCount(0);
  await page.getByRole("button", { name: /Illustrative Project Stress Test/ }).click();
  await expect(page.getByTestId("financial-session-review")).toContainText("Model unavailable");
  await expect(page.getByRole("button", { name: "Preview", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("financial-session-accept")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Review candidate source" })).toBeVisible();
  await page.getByTestId("tab-reality").click();
  await expect(page.getByTestId("input-reality-illustrative-capacity")).toBeHidden();
  await page.getByText("Explore illustrative scenario · explicit opt-in", { exact: true }).click();
  await page.getByTestId("input-reality-illustrative-capacity").fill("1200");
  await page.getByTestId("tab-transmission").click();
  await page.getByRole("button", { name: /Illustrative Project Stress Test/ }).click();
  const previewButton = page.getByRole("button", { name: "Preview", exact: true });
  await expect(previewButton).toBeDisabled();
  await page.getByTestId("financial-session-scope-facility").fill(financial.context.scope.facility);
  await page.getByTestId("financial-session-scope-phase").fill(financial.context.scope.phase);
  await page.getByTestId("financial-session-set-scope").click();
  await previewButton.click();
  await expect(page.getByTestId("financial-session-preview-electricity_cost")).toBeVisible();
  await expect(page.getByTestId("financial-session-accept")).toBeEnabled();
  await page.getByTestId("financial-session-accept").click();
  await expect(page.getByTestId("financial-session-history")).toContainText("accept");
  await page.reload();
  await page.getByTestId("tab-transmission").click();
  await page.getByRole("button", { name: /Illustrative Project Stress Test/ }).click();
  await expect(page.getByTestId("financial-session-history")).toContainText("accept");
});

test("reviewed starting snapshot has one compact non-sticky header, not a completed live status", async ({ page }, testInfo) => {
  await blockUnmockedProviderRequests(page);
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto("/#analysis");
  await expect(page.getByTestId("conference-research-status")).toHaveText("Reviewed snapshot");
  await expect(page.getByTestId("project-context-binding")).toBeHidden();
  expect(await page.getByTestId("conference-summary").evaluate((el) => getComputedStyle(el).position)).not.toBe("sticky");
  await page.getByTestId("tab-reality").click();
  await expect(page.getByTestId("reality-evidence-open")).toContainText("Unresolved items");
  await page.screenshot({ path: `../../screenshots/safeloc-results-after-${testInfo.project.name}.png`, fullPage: true });
  await page.getByTestId("reality-evidence-open").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});