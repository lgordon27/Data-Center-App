import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { blockUnmockedProviderRequests } from "./offline-provider-reads";

const baseFixture = JSON.parse(
  readFileSync(new URL("./fixtures/research-project-synthetic.json", import.meta.url), "utf8"),
) as Record<string, unknown>;
let fixtureRunSequence = 0;

type ResearchRequest = {
  name: string;
  location: string;
  projectIdentity?: {
    projectId: string | null;
    providerId: string | null;
    name: string;
    location: string;
    operator: string | null;
  };
  knownData?: { operator?: string };
};

function fixtureResponse(
  request: ResearchRequest,
  outcome: "complete-no-eligible-evidence" | "incomplete-technical-limitation" = "complete-no-eligible-evidence",
) {
  const response = structuredClone(baseFixture) as Record<string, any>;
  const operator = request.projectIdentity?.operator ?? request.knownData?.operator ?? null;
  response.projectIdentity = {
    projectId: request.projectIdentity?.projectId ?? null,
    providerId: request.projectIdentity?.providerId ?? null,
    name: request.name,
    location: request.location,
    operator,
  };
  response.projectSummary = {
    ...response.projectSummary,
    name: request.name,
    location: request.location,
    description: `Deterministic public-source fixture for ${request.name}.`,
    capacityMW: null,
    capacityProvenance: "unknown",
  };
  response.researchMode = outcome === "incomplete-technical-limitation"
    ? "research-incomplete"
    : "partial-public-source";
  response.researchStatus = outcome === "incomplete-technical-limitation" ? "partial" : "completed";
  response.researchOutcome = {
    state: outcome,
    eligibleEvidenceCount: 0,
    reasonCodes: outcome === "incomplete-technical-limitation"
      ? ["provider-unavailable"]
      : ["no-financially-eligible-claims"],
  };
  response.researchAudit = {
    ...response.researchAudit,
    runCorrelationId: `fixture-run-${++fixtureRunSequence}`,
  };
  response.evidence = (response.evidence as Array<Record<string, unknown>>).map((item) => ({
    ...item,
    value: "Not disclosed",
    numericValue: undefined,
    rawValue: undefined,
    rawText: undefined,
    classification: "Missing Evidence",
    citation: `No validated project-specific category result for ${request.name}.`,
    description: `No project-specific value was established for ${request.name}.`,
    sourceUrl: undefined,
    sourceTitle: undefined,
    sourcePublisher: undefined,
    sourcePublishedAt: undefined,
    sourceAccessedAt: undefined,
    sourceAccessStatus: undefined,
    sourceRole: "Research gap",
    sourceSupportConfidence: 0,
    eligibleForModel: false,
    acceptedForModel: false,
    sources: [],
    searchTerms: [],
    searchCoverage: [],
    failedSearchDomains: [],
  }));
  response.sourceLedger = [];
  response.eligibleEvidence = [];
  response.retrievedLeads = [];
  response.proposedInputs = [];
  response.acceptedModelInputs = [];
  response.retainedFindings = [];
  delete response.retainedFindingAudit;
  return response;
}

async function openCustomProjectDialog(page: Page) {
  const panel = page.getByTestId("home-explore-panel");
  if (await panel.count() && await panel.getAttribute("open") === null) {
    await panel.locator(":scope > summary").click();
  }
  await page.getByTestId("button-analyze-another-project").click();
  await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
}

async function submitProject(page: Page, name: string, location: string, operator: string) {
  await openCustomProjectDialog(page);
  await page.getByTestId("input-custom-project-name").fill(name);
  await page.getByTestId("input-custom-project-location").fill(location);
  await page.getByTestId("input-custom-project-operator").fill(operator);
  await page.getByTestId("button-submit-custom-project").click();
  await expect(page).toHaveURL(/#analysis$/);
}

async function navigateHome(page: Page) {
  await page.evaluate(() => { window.location.hash = "home"; });
  await expect(page).toHaveURL(/#home$/);
}

test.describe("unified project context workflow (offline fixtures)", () => {
  test("rejects a late prior result and restores one project/run across review pages and browser history", async ({ page }) => {
    await blockUnmockedProviderRequests(page);
    let releaseFirstRequest: (() => void) | null = null;
    const firstRequestGate = new Promise<void>((resolve) => { releaseFirstRequest = resolve; });
    await page.route("**/api/research-project", async (route) => {
      const request = route.request().postDataJSON() as ResearchRequest;
      if (request.name === "Amazon AWS East") await firstRequestGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixtureResponse(request)),
      });
    });

    await page.goto("/#analysis");
    const context = page.getByTestId("project-context-binding");
    await expect(context).toHaveAttribute("data-classification", "reviewed-starting-case");
    await expect(context).toContainText("Stargate Abilene");

    await navigateHome(page);
    await submitProject(page, "Amazon AWS East", "Loudoun County, Virginia", "Amazon Web Services");
    await expect(context).toHaveAttribute("data-lifecycle", "researching");
    await expect(context).toContainText("Amazon AWS East");
    await expect(context).toContainText("Amazon Web Services");
    await expect(context).toContainText("Selected via: Project research dialog");
    const firstProjectRunId = await context.getAttribute("data-research-run-id");
    expect(firstProjectRunId).toBeTruthy();

    await navigateHome(page);
    await submitProject(page, "Pine Grove Compute", "Douglas County, Nebraska", "NebulaStack");
    await expect(context).toHaveAttribute("data-classification", "arbitrary");
    await expect(context).toHaveAttribute("data-lifecycle", "complete");
    await expect(context).toContainText("Pine Grove Compute");
    await expect(context).toContainText("NebulaStack");
    await expect(context).toContainText("Server outcome: complete-no-eligible-evidence");
    const activeProjectId = await context.getAttribute("data-project-id");
    const activeRunId = await context.getAttribute("data-research-run-id");
    const activeResultRef = await context.getAttribute("data-active-result-ref");
    expect(activeProjectId).toBeTruthy();
    expect(activeRunId).toBeTruthy();
    expect(activeRunId).not.toBe(firstProjectRunId);
    expect(activeResultRef).toBeTruthy();
    await expect(page.getByTestId("canonical-dossier-summary")).toHaveCount(0);

    releaseFirstRequest?.();
    await expect(context).toContainText("Pine Grove Compute");
    await expect(context).toHaveAttribute("data-project-id", activeProjectId!);
    await expect(context).toHaveAttribute("data-research-run-id", activeRunId!);

    await page.getByTestId("tab-market").click();
    await expect(context).toHaveAttribute("data-project-id", activeProjectId!);
    await expect(page.getByTestId("conference-view-market")).toHaveAttribute("data-project-id", activeProjectId!);
    await expect(page.getByTestId("conference-view-market")).toHaveAttribute("data-research-run-id", activeRunId!);
    await page.getByTestId("tab-reality").click();
    await expect(context).toHaveAttribute("data-research-run-id", activeRunId!);
    await expect(page.getByTestId("conference-view-reality")).toHaveAttribute("data-project-id", activeProjectId!);
    await expect(page.getByTestId("conference-view-reality")).toHaveAttribute("data-research-run-id", activeRunId!);
    await page.getByTestId("button-detailed-evidence").click();
    await expect(page.getByTestId("evidence-room")).toHaveAttribute("data-project-id", activeProjectId!);
    await expect(page.getByTestId("evidence-room")).toHaveAttribute("data-research-run-id", activeRunId!);

    await page.getByTestId("tab-transmission").click();
    await expect(page.getByTestId("financial-session-review")).toBeVisible();
    await expect(page.getByTestId("financial-session-review")).toHaveAttribute("data-project-id", activeProjectId!);
    await expect(page.getByTestId("financial-session-review")).toHaveAttribute("data-research-run-id", activeRunId!);

    await page.reload();
    const restoredContext = page.getByTestId("project-context-binding");
    await expect(restoredContext).toContainText("Pine Grove Compute");
    await expect(restoredContext).toHaveAttribute("data-project-id", activeProjectId!);
    await expect(restoredContext).toHaveAttribute("data-research-run-id", activeRunId!);
    await expect(restoredContext).toHaveAttribute("data-active-result-ref", activeResultRef!);

    await navigateHome(page);
    await page.goBack();
    await expect(page.getByTestId("project-context-binding")).toHaveAttribute("data-project-id", activeProjectId!);
    await page.goForward();
    await expect(page.getByTestId("header-project-identity")).toContainText("Pine Grove Compute");
    await page.goBack();
    await expect(page.getByTestId("project-context-binding")).toHaveAttribute("data-research-run-id", activeRunId!);
  });

  test("keeps technical incompleteness explicit and isolates arbitrary research from canonical dossiers", async ({ page }) => {
    await blockUnmockedProviderRequests(page);
    await page.route("**/api/research-project", async (route) => {
      const request = route.request().postDataJSON() as ResearchRequest;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixtureResponse(request, "incomplete-technical-limitation")),
      });
    });
    await page.goto("/#home");
    await submitProject(page, "Red Cedar Data Campus", "Des Moines, Iowa", "Cedar Cloud");

    const context = page.getByTestId("project-context-binding");
    await expect(context).toHaveAttribute("data-lifecycle", "partial");
    await expect(context).toContainText("Server outcome: incomplete-technical-limitation");
    await expect(context).toContainText("Cedar Cloud");
    await expect(page.getByTestId("custom-research-banner")).toContainText("Search incomplete");
    await expect(page.getByTestId("canonical-dossier-summary")).toHaveCount(0);

    await page.getByTestId("tab-reality").click();
    const findings = page.getByTestId("retained-research-findings");
    await expect(findings).toContainText("No passage was retained as potentially relevant to this project.");
    await expect(findings).not.toContainText("Northstar");
    await page.getByTestId("button-detailed-evidence").click();
    await expect(page.getByTestId("project-context-binding")).toContainText("Red Cedar Data Campus");
    await expect(page.getByTestId("project-context-binding")).not.toContainText("Stargate");
  });
});