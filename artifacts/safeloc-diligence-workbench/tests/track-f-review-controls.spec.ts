import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { blockUnmockedProviderRequests } from "./offline-provider-reads";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/session-financial-review.json", import.meta.url), "utf8"));
const currentKey = "safeloc:diligence:current-session:v1";

test("owned range view reaches source preview, all decisions and persistent history without exposing exact returns", async ({ page }) => {
  await blockUnmockedProviderRequests(page);
  await page.clock.setFixedTime(new Date(fixture.now));
  await page.goto("/#analysis-financial");
  const view = page.getByTestId("conference-view-transmission");
  await expect(view.getByTestId("financial-range-label")).toHaveText(/Estimated return: roughly -?\d+--?\d+%/);
  const privateTerms = /\b(?:IRR|NPV|MOIC)\b|QUALITY_POLICY|climateMultiplier|costMultiplier|coolingContingency/i;
  expect(await view.innerText()).not.toMatch(privateTerms);
  const modelEvidence = await page.evaluate(async () => {
    const capture = (window as Window & {
      __safelocCaptureReturnDiscrepancyState?: () => Promise<{ modelInputs: { evidence: Record<string, unknown> } }>;
    }).__safelocCaptureReturnDiscrepancyState;
    if (!capture) throw new Error("Offline fixture capture unavailable");
    return (await capture()).modelInputs.evidence;
  });
  const proposals = Object.fromEntries(fixture.candidates.map((c: { id: string }) => [c.id, c]));
  await page.evaluate(({ currentKey, modelEvidence, proposals, name }) => {
    const current = JSON.parse(localStorage.getItem(currentKey) ?? "{}");
    current.customResearch = {
      project: { kind: "custom", name, location: "Orion, Texas", description: "Fictional offline QA seed, never a real source.", capacityMW: 1200, capacityProvenance: "illustrative" },
      evidence: modelEvidence, modelEvidence, researchProposals: proposals,
      researchProposalDispositions: Object.fromEntries(Object.keys(proposals).map(id => [id, "pending"])),
      researchProposalOverrides: {},
    };
    current.selectedProjectContext = {
      company: name, projectName: name, projectId: "session-project-orion", providerId: "session-project-orion",
      operator: "Illustrative QA operator", location: "Orion, Texas", capacityMW: 1200, kind: "directory",
      status: "Offline fixture", relationshipType: "Developer/Operator", evidenceState: "Illustrative only",
      sourceUrl: "https://utility.example.test/records/orion-north-hall",
    };
    delete current.canonicalReview; delete current.capacityReview;
    sessionStorage.clear();
    localStorage.setItem(currentKey, JSON.stringify(current));
  }, { currentKey, modelEvidence, proposals, name: fixture.context.projectName });
  await page.reload();
  await page.getByTestId("tab-reality").click();
  await page.getByText("Explore illustrative scenario · explicit opt-in", { exact: true }).click();
  await page.getByTestId("input-reality-illustrative-capacity").fill("1200");
  await page.getByTestId("tab-transmission").click();
  const review = view.getByTestId("financial-session-review");
  await expect(review).toBeVisible();
  await review.getByTestId("financial-session-scope-facility").fill(fixture.context.scope.facility);
  await review.getByTestId("financial-session-scope-phase").fill(fixture.context.scope.phase);
  await review.getByTestId("financial-session-set-scope").click();
  const canonicalBefore = await page.evaluate(key => localStorage.getItem(key), currentKey);
  for (const [id, action] of [
    ["electricity_cost", "accept"], ["water_consumption", "reject"], ["grid_interconnection", "evidence-only"],
  ] as const) {
    await review.getByTestId(`financial-session-preview-button-${id}`).click();
    const preview = review.getByTestId(`financial-session-preview-${id}`);
    await expect(preview).toContainText("Preview only");
    await expect(preview).toContainText("claim period:");
    await expect(preview.locator("blockquote")).not.toBeEmpty();
    expect(await view.innerText()).not.toMatch(privateTerms);
    expect(await view.ariaSnapshot()).not.toMatch(privateTerms);
    const actionButton = preview.getByTestId(`financial-session-${action}`);
    await expect(actionButton).toBeEnabled();
    await actionButton.click();
    await expect(preview).toHaveCount(0);
    await expect(review.getByTestId("financial-session-history")).toContainText(action);
  }
  expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBe(canonicalBefore);
  await page.reload();
  await page.getByTestId("tab-transmission").click();
  await expect(review.getByTestId("financial-session-history").locator("ol > li")).toHaveCount(3);
  for (const summary of await review.getByTestId("financial-session-history").locator("summary").all()) await summary.click();
  expect(await view.innerText()).not.toMatch(privateTerms);
  expect(await view.ariaSnapshot()).not.toMatch(privateTerms);
  await expect(view).not.toContainText(/\b\d+\.\d{3,}%/);
});
