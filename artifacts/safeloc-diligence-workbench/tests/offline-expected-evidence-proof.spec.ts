import { expect, test, type Page } from "@playwright/test";
import {
  EXPECTED_EVIDENCE_FIXTURE_DATA,
} from "../src/model/expectedEvidenceFixtureCases.js";
import { SAFELOC_PROOF_DIMENSIONS } from "../src/model/safelocProofContract.js";
import { getEvidenceImpactRole } from "../src/data/evidenceImpactRoles.js";
import sessionFinancialFixture from "./fixtures/session-financial-review.json" with { type: "json" };
import type { CustomEvidenceRecord } from "../src/services/researchProjectService.js";
import { blockUnmockedProviderRequests } from "./offline-provider-reads";

const SESSION_FINANCIAL_HISTORY_KEY = "safeloc:financial-review:session:v1";
const CURRENT_SESSION_KEY = "safeloc:diligence:current-session:v1";

async function openEvidenceRoom(page: Page) {
  await blockUnmockedProviderRequests(page);
  await page.goto("/#analysis");
  await page.getByTestId("tab-reality").click();
  const detailToggle = page.getByRole("button", { name: /Detailed Evidence Record/i });
  if (await detailToggle.getAttribute("aria-expanded") !== "true") await detailToggle.click();
  await page.getByTestId("filter-evidence-all").click();
  await expect(page.getByTestId("offline-expected-evidence-proof")).toBeVisible();
}

test("keeps the expected-evidence proof path offline, illustrative, and separate from session decisions", async ({ page }) => {
  const providerRequests: string[] = [];
  const blockedApiRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(?:eia|ercot-queue|directory|research-project|analyze-evidence)/i.test(request.url())) {
      blockedApiRequests.push(request.url());
    }
    if (/(?:api\.openai\.com|generativelanguage\.googleapis\.com|api\.eia\.gov)/i.test(request.url())) {
      providerRequests.push(request.url());
    }
  });

  await openEvidenceRoom(page);
  const panel = page.getByTestId("offline-expected-evidence-proof");
  const select = panel.getByTestId("offline-proof-case-select");
  await expect(panel.getByRole("heading", { name: "Expected evidence to model proof" })).toBeVisible();
  await expect(panel.getByTestId("offline-proof-fixture-label")).toHaveText("illustrative");
  await expect(select.locator("option")).toHaveCount(5);
  await expect(panel.getByTestId("offline-user-scenario-decisions-empty")).toBeVisible();
  const blockedRequestsBeforeFixtureSelection = blockedApiRequests.length;
  const storageBefore = await page.evaluate(({ sessionKey, currentKey }) => ({
    sessionHistory: window.sessionStorage.getItem(sessionKey),
    currentSession: window.localStorage.getItem(currentKey),
  }), { sessionKey: SESSION_FINANCIAL_HISTORY_KEY, currentKey: CURRENT_SESSION_KEY });

  for (const fixture of EXPECTED_EVIDENCE_FIXTURE_DATA.cases) {
    await select.selectOption(fixture.projectReference);
    await expect(panel.getByTestId("offline-proof-project")).toContainText(fixture.projectName);
    await expect(panel.getByTestId("offline-proof-dimension")).toHaveCount(13);
    await expect(panel).toContainText("0 model-active inputs");
    await expect(panel).toContainText("These five synthetic examples");
  }

  const identityFailure = EXPECTED_EVIDENCE_FIXTURE_DATA.cases.find(
    (fixture) => fixture.completeNotFoundDimensions.includes("project-identity"),
  );
  expect(identityFailure, "an illustrative identity-failure case must remain in the matrix").toBeDefined();
  if (!identityFailure) throw new Error("Offline expected-evidence fixtures are missing the identity-failure case.");
  await select.selectOption(identityFailure.projectReference);
  const identityRow = panel.locator('[data-dimension="project-identity"]');
  await identityRow.locator("details > summary").click();
  await expect(identityRow).toContainText("complete · searched-not-found");
  await expect(identityRow).toContainText("No observed evidence record");
  await expect(identityRow).toContainText("does not prove a completed search");

  const conflictCase = EXPECTED_EVIDENCE_FIXTURE_DATA.cases.find((fixture) => fixture.conflictingDimensions.length > 0);
  expect(conflictCase, "an illustrative source-conflict case must remain in the matrix").toBeDefined();
  if (!conflictCase) throw new Error("Offline expected-evidence fixtures are missing the source-conflict case.");
  await select.selectOption(conflictCase.projectReference);
  const conflictDimension = conflictCase.conflictingDimensions[0]!;
  const conflictRow = panel.locator(`[data-dimension="${conflictDimension}"]`);
  await conflictRow.locator("details > summary").click();
  await expect(conflictRow.getByTestId("offline-proof-evidence").filter({ hasText: "Conflicting" })).toHaveCount(2);
  await expect(conflictRow).toContainText("Conflicting");

  const sparseCase = EXPECTED_EVIDENCE_FIXTURE_DATA.cases.reduce((sparse, current) =>
    current.supportedDimensions.length < sparse.supportedDimensions.length ? current : sparse,
  );
  await select.selectOption(sparseCase.projectReference);
  const sparseDimension = SAFELOC_PROOF_DIMENSIONS.find((dimension) =>
    !sparseCase.supportedDimensions.includes(dimension) && !sparseCase.conflictingDimensions.includes(dimension),
  );
  expect(sparseDimension, "the sparse fixture must have an unobserved dimension").toBeDefined();
  if (!sparseDimension) throw new Error("Sparse expected-evidence fixture has no unobserved dimension.");
  const sparseRow = panel.locator(`[data-dimension="${sparseDimension}"]`);
  await sparseRow.locator("details > summary").click();
  await expect(sparseRow).toContainText("No observed evidence record");
  await expect(sparseRow).toContainText("does not prove a completed search");

  const storageAfter = await page.evaluate(({ sessionKey, currentKey }) => ({
    sessionHistory: window.sessionStorage.getItem(sessionKey),
    currentSession: window.localStorage.getItem(currentKey),
    allStoredKeys: [
      ...Object.keys(window.sessionStorage),
      ...Object.keys(window.localStorage),
    ],
  }), { sessionKey: SESSION_FINANCIAL_HISTORY_KEY, currentKey: CURRENT_SESSION_KEY });
  expect(storageAfter.sessionHistory).toBeNull();
  expect(storageAfter.sessionHistory).toBe(storageBefore.sessionHistory);
  expect(storageAfter.currentSession).toBe(storageBefore.currentSession);
  expect(storageAfter.allStoredKeys.join(" ")).not.toContain("proof-user-decision");
  expect(providerRequests).toEqual([]);
  expect(blockedApiRequests.slice(blockedRequestsBeforeFixtureSelection)).toEqual([]);
});

test("keeps financial decisions in tab session history and shows the recorded model effect beside the proof", async ({ page }) => {
  const externalProviderRequests: string[] = [];
  page.on("request", (request) => {
    if (/(?:api\.openai\.com|generativelanguage\.googleapis\.com|api\.eia\.gov)/i.test(request.url())) {
      externalProviderRequests.push(request.url());
    }
  });
  await blockUnmockedProviderRequests(page);
  await page.goto("/#analysis");

  const modelEvidence = await page.evaluate(async () => {
    const capture = (window as Window & {
      __safelocCaptureReturnDiscrepancyState?: () => Promise<{
        modelInputs: { evidence: Record<string, Record<string, unknown>> };
      }>;
    }).__safelocCaptureReturnDiscrepancyState;
    if (!capture) throw new Error("Financial fixture capture hook is unavailable.");
    return (await capture()).modelInputs.evidence;
  });
  const uiEvidence = Object.fromEntries(
    Object.entries(modelEvidence).map(([id, record]) => [id, {
      ...record,
      id,
      impactRole: getEvidenceImpactRole(id),
      sourceRole: "Offline browser fixture · not a source",
    }]),
  );
  const projectName = sessionFinancialFixture.context.projectName;
  const location = "Orion, Texas";
  expect(sessionFinancialFixture.fixtureNotice).toMatch(/fictional.*never import into application runtime/i);
  const proposals = Object.fromEntries(
    (sessionFinancialFixture.candidates as CustomEvidenceRecord[]).map((candidate) => [
      candidate.id,
      { ...candidate, impactRole: getEvidenceImpactRole(candidate.id) },
    ]),
  );
  const proposalDispositions = Object.fromEntries(
    Object.keys(proposals).map((id) => [id, "pending"]),
  );

  await page.evaluate(({ key, evidence, modelEvidence, projectName, location, proposals, proposalDispositions }) => {
    const current = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    current.customResearch = {
      project: {
        kind: "custom",
        name: projectName,
        location,
        description: "Fictional browser-QA project; not live research.",
        capacityMW: 1_200,
        capacityProvenance: "illustrative",
      },
      evidence,
      modelEvidence,
      researchProposals: proposals,
      researchProposalDispositions: proposalDispositions,
      researchProposalOverrides: {},
    };
    current.selectedProjectContext = {
      company: projectName,
      projectId: "session-project-orion",
      projectName,
      operator: "Illustrative Test Operator",
      location,
      capacityMW: 1_200,
      status: "Fixture-backed browser test",
      relationshipType: "Developer/Operator",
      evidenceState: "Illustrative only",
      kind: "directory",
      sourceUrl: "https://utility.example.test/records/orion-north-hall",
      providerId: "session-project-orion",
    };
    delete current.canonicalReview;
    delete current.capacityReview;
    window.localStorage.setItem(key, JSON.stringify(current));
  }, {
    key: CURRENT_SESSION_KEY,
    evidence: uiEvidence,
    modelEvidence,
    projectName,
    location,
    proposals,
    proposalDispositions,
  });
  await page.reload();
  await expect(page.getByTestId("conference-summary")).toContainText(projectName);
  await expect(page.getByTestId("tab-transmission")).toBeVisible();
  await page.getByTestId("tab-reality").click();
  await page.getByTestId("input-reality-illustrative-capacity").fill("1200");
  await expect(page.getByTestId("reality-capacity-review-status")).toContainText("illustrative-set");
  await page.getByTestId("tab-transmission").click();

  const review = page.getByTestId("financial-session-review");
  await expect(review).toBeVisible();
  await expect(review).toContainText("Open-use workbench");
  await page.getByTestId("financial-session-scope-facility").fill(sessionFinancialFixture.context.scope.facility);
  await page.getByTestId("financial-session-scope-phase").fill(sessionFinancialFixture.context.scope.phase);
  await page.getByTestId("financial-session-set-scope").click();
  const localSessionBeforeActions = await page.evaluate((key) => window.localStorage.getItem(key), CURRENT_SESSION_KEY);

  const actions = [
    ["electricity_cost", "financial-session-accept"],
    ["water_consumption", "financial-session-reject"],
    ["grid_interconnection", "financial-session-evidence-only"],
  ] as const;
  for (const [target, actionTestId] of actions) {
    const proposalRow = review.locator("ul > li").filter({ hasText: target.replaceAll("_", " ") });
    await proposalRow.getByRole("button", { name: "Preview" }).click();
    const preview = page.getByTestId(`financial-session-preview-${target}`);
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Preview only: does not apply until accepted");
    const actionButton = page.getByTestId(actionTestId);
    await expect(actionButton).toBeEnabled();
    await actionButton.click();
  }

  await expect(review.getByTestId("financial-session-history")).toContainText("accept");
  await expect(review.getByTestId("financial-session-history")).toContainText("reject");
  await expect(review.getByTestId("financial-session-history")).toContainText("evidence-only");

  await page.getByTestId("tab-reality").click();
  const detailToggle = page.getByRole("button", { name: /Detailed Evidence Record/i });
  if (await detailToggle.getAttribute("aria-expanded") !== "true") await detailToggle.click();
  const proofPanel = page.getByTestId("offline-expected-evidence-proof");
  await expect(proofPanel.getByTestId("offline-user-scenario-decision-entry")).toHaveCount(3);
  await expect(proofPanel).toContainText("Currently accepted in this session scenario");
  await expect(proofPanel).toContainText("Not active in the current scenario");
  await expect(proofPanel).toContainText("Model effect at decision time");
  await expect(proofPanel).toContainText("IRR");
  await expect(proofPanel).toContainText("payback");

  const persistedState = await page.evaluate(({ key, sessionKey }) => {
    const history = JSON.parse(window.sessionStorage.getItem(sessionKey) ?? "null");
    return {
      history,
      localCurrentSession: window.localStorage.getItem(key),
      localStorageContents: Object.entries(window.localStorage).map(([name, value]) => `${name}:${value}`).join("\n"),
    };
  }, {
    key: CURRENT_SESSION_KEY,
    sessionKey: SESSION_FINANCIAL_HISTORY_KEY,
  });
  expect(persistedState.history.decisions.map((decision: { action: string }) => decision.action))
    .toEqual(["accept", "reject", "evidence-only"]);
  expect(persistedState.history.decisions[0].modelEffect).toBeTruthy();
  expect(persistedState.localCurrentSession).toBe(localSessionBeforeActions);
  expect(persistedState.localStorageContents).not.toContain("session-financial-decision");
  expect(persistedState.localStorageContents).not.toContain("proof-user-decision");
  expect(externalProviderRequests).toEqual([]);
});