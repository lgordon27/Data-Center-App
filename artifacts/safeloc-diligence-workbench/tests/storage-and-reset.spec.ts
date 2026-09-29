import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const currentSessionKey = "safeloc:diligence:current-session:v1";
const scenariosKey = "safeloc:diligence:scenarios:v1";
const evidenceTipDismissedKey = "safeloc:diligence:evidence-room-tip-dismissed:v1";

type ReturnCapture = {
  project: { kind: string; capacityMW: number | null };
  classifications: Record<string, string>;
  modelInputs: {
    fingerprint: string;
    assumptions: { capacityMW: number | null };
    evidence: Record<string, Record<string, unknown>>;
  };
  release: {
    fingerprint: string;
    identity: null | { assets: Array<{ file: string; hash: string }> };
  };
  financialScenarios: {
    primaryScenarioId: string;
    scenarios: Record<string, {
      name: string;
      role: string;
      evidenceBasis: string;
      electricityBasis: string;
    } | null>;
  };
  providerProvenance: {
    eia: { status: string };
    ercotQueue: { status: string };
  };
};

async function captureReturnState(page: import("@playwright/test").Page): Promise<ReturnCapture> {
  return page.evaluate(async () => {
    const capture = (window as Window & {
      __safelocCaptureReturnDiscrepancyState?: () => Promise<ReturnCapture>;
    }).__safelocCaptureReturnDiscrepancyState;
    if (!capture) throw new Error("Return discrepancy capture hook is unavailable.");
    return capture();
  });
}

async function openProjectRealityEvidenceReview(page: import("@playwright/test").Page) {
  await page.getByTestId("tab-reality").click();
  const evidenceReview = page.getByRole("button", { name: /Detailed Evidence Record/i });
  if (await evidenceReview.getAttribute("aria-expanded") === "false") await evidenceReview.click();
  await expect(evidenceReview).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId("filter-evidence-all").click();
}

async function openFinancialTransmission(page: import("@playwright/test").Page) {
  await page.getByTestId("tab-transmission").click();
  const stressTest = page.getByRole("button", { name: /Illustrative Project Stress Test/i });
  if (await stressTest.getAttribute("aria-expanded") === "false") await stressTest.click();
  await expect(stressTest).toHaveAttribute("aria-expanded", "true");
}

async function seedCustomResearchSession(
  page: import("@playwright/test").Page,
  capacityReview: unknown,
) {
  const modelEvidence = (await captureReturnState(page)).modelInputs.evidence;
  await page.evaluate(({ key, capacityReview, modelEvidence }) => {
    const session = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    const project = {
      kind: "custom",
      name: "Example Custom Data Center",
      location: "Arlington, Texas",
      description: "Local-only test fixture.",
      capacityMW: 1_200,
      capacityProvenance: "directory-reported",
      retainedFindings: [{
        id: "finding-it-capacity",
        assessment: "source-supported",
        applicability: "exact-project",
        financialProposalEligibility: "eligible",
        projectScope: "Source passage identifies the submitted project name and requested location.",
        powerClaimState: "resolved",
        powerClaim: {
          quantity: "180 MW",
          measure: "IT capacity",
          status: "operating",
          phaseScope: null,
          facilityScope: "campus",
        },
        reportingDate: "2026-09-01",
        accessedAt: "2026-09-02",
        sourceTitle: "Example capacity announcement",
        sourceUrl: "https://example.com/capacity",
        passage: "Example Custom Data Center in Arlington has 180 MW of IT capacity.",
      }],
    };
    session.customResearch = {
      project,
      evidence: modelEvidence,
      modelEvidence,
      researchProposals: {},
      researchProposalDispositions: {},
      researchProposalOverrides: {},
    };
    if (capacityReview === null) delete session.capacityReview;
    else session.capacityReview = capacityReview;
    window.localStorage.setItem(key, JSON.stringify(session));
  }, { key: currentSessionKey, capacityReview, modelEvidence });
}

test.describe("current-session recovery and reset isolation", () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, "Storage behavior only needs one browser viewport.");

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/eia/electricity", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ diagnostics: { error: "deterministic embedded fallback" } }),
    }));
    await page.route("**/api/ercot-queue", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ diagnostics: { error: "deterministic embedded fallback" } }),
    }));
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/#analysis");
  });

  test("persists a classification and shows restore feedback for three seconds", async ({ page }) => {
    await openProjectRealityEvidenceReview(page);
    const classification = page.getByTestId("select-classification-electricity_cost");

    await classification.selectOption("Missing Evidence");
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), currentSessionKey)).not.toBeNull();
    const marker = page.getByTestId("review-marker-electricity_cost");
    await expect(marker).toContainText("Reviewed by analyst");
    const storedReview = await page.evaluate((key) => {
      const session = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      return session.reviewMetadata?.electricity_cost;
    }, currentSessionKey);
    expect(storedReview.kind).toBe("manual");
    expect(storedReview.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    await page.reload();
    const sessionRestored = page.getByTestId("text-session-restored");
    await expect(sessionRestored).toBeVisible();
    await expect(sessionRestored).toHaveText("Browser-local session restored");
    const sessionRestoredShownAt = Date.now();
    await openProjectRealityEvidenceReview(page);
    await expect(classification).toHaveValue("Missing Evidence");
    await expect(marker).toContainText("Reviewed by analyst");
    await expect(marker.locator("time")).toHaveAttribute("datetime", storedReview.reviewedAt);
    await expect(sessionRestored).toBeHidden({ timeout: 5_000 });
    expect(Date.now() - sessionRestoredShownAt).toBeGreaterThanOrEqual(3_500);

    await openFinancialTransmission(page);
    await openProjectRealityEvidenceReview(page);
    await expect(marker).toContainText("Reviewed by analyst");
  });

  test("guides the first classification interaction and remembers the tip dismissal", async ({ page }) => {
    await openProjectRealityEvidenceReview(page);

    const evidenceTip = page.getByTestId("evidence-classification-tip");
    await expect(evidenceTip).toBeVisible();
    await expect(evidenceTip).toContainText("Try it: Click any dropdown and change a classification. Watch what happens.");
    await expect(page.getByTestId("select-classification-electricity_cost")).toBeVisible();

    await page.getByTestId("button-dismiss-evidence-classification-tip").click();
    await expect(evidenceTip).toBeHidden();
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), evidenceTipDismissedKey)).toBe("true");

    await page.reload();
    await openProjectRealityEvidenceReview(page);
    await expect(page.getByTestId("evidence-classification-tip")).toHaveCount(0);
  });

  test("removes the materiality prompt after a classification recalculates the return", async ({ page }) => {
    await openFinancialTransmission(page);
    await expect(page.getByTestId("materiality-classification-prompt")).toContainText("Change a classification to see the return, driver ranking, confidence and recommendation update.");

    await openProjectRealityEvidenceReview(page);
    await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
    await expect(page.getByTestId("toast-reclassification")).toContainText("Your evidence change has been saved. Explore the Illustrative Project Stress Test to inspect its financial effect.");

    await openFinancialTransmission(page);
    await expect(page.getByTestId("materiality-classification-prompt")).toHaveCount(0);
    await expect(page.getByTestId("live-current-irr")).toContainText("Synthetic current-evidence primary case IRR is now");
    await page.reload();
    await openFinancialTransmission(page);
    await expect(page.getByTestId("materiality-classification-prompt")).toHaveCount(0);
  });

  test("falls back to defaults when current-session storage is malformed", async ({ page }) => {
    await page.evaluate((key) => window.localStorage.setItem(key, "{malformed"), currentSessionKey);
    await page.reload();
    await openProjectRealityEvidenceReview(page);

    await expect(page.getByTestId("select-classification-electricity_cost")).toHaveValue("User Assumption");
    await expect(page.getByTestId("text-session-restored")).toHaveCount(0);
  });

  test("migrates stale audited defaults while preserving intentional overrides", async ({ page }) => {
    const legacyClassifications = {
      electricity_cost: "Verified Evidence",
      water_consumption: "Verified Evidence",
      grid_interconnection: "Verified Evidence",
      water_escalation: "Model Inference",
      community_risk: "Verified Evidence",
      renewable_percentage: "Management Assertion",
      cooling_capex: "User Assumption",
      electricity_escalation: "Verified Evidence",
      carbon_compliance: "Model Inference",
      permitting_timeline: "Management Assertion",
      customer_concentration: "Missing Evidence",
      water_rights: "Missing Evidence",
      site_hazard_exposure: "Verified Evidence",
      backup_power_capacity: "Management Assertion",
      water_source_resilience: "Model Inference",
      downtime_cost: "User Assumption",
    };
    await page.evaluate(
      ({ key, classifications }) => window.localStorage.setItem(key, JSON.stringify({
        version: 1,
        hasChangedClassification: true,
        classifications,
        reviewMetadata: {
          water_consumption: { kind: "not-a-review-kind", reviewedAt: "2026-08-31T12:00:00.000Z" },
          grid_interconnection: { kind: "manual", reviewedAt: "not-a-date" },
        },
      })),
      { key: currentSessionKey, classifications: legacyClassifications },
    );

    await page.reload();
    const migrationNotice = page.getByTestId("text-session-restored");
    await expect(migrationNotice).toBeVisible();
    await expect(migrationNotice).toHaveText("Browser-local session updated to audited defaults");
    await openProjectRealityEvidenceReview(page);

    await expect(page.getByTestId("select-classification-electricity_cost")).toHaveValue("User Assumption");
    await expect(page.getByTestId("select-classification-electricity_escalation")).toHaveValue("Model Inference");
    await expect(page.getByTestId("select-classification-customer_concentration")).toHaveValue("Missing Evidence");
    await expect(page.getByTestId("select-classification-water_consumption")).toHaveValue("Verified Evidence");

    const migrated = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), currentSessionKey);
    expect(migrated.version).toBe(2);
    expect(migrated.canonicalProvenanceVersion).toBe(2);
    expect(migrated.overrides).toEqual({
      customer_concentration: "Missing Evidence",
      water_consumption: "Verified Evidence",
    });
    expect(migrated.reviewMetadata).toEqual({});
    await expect(page.locator("[data-testid^='review-marker-']")).toHaveCount(0);
  });

  test("requires reset confirmation and preserves named scenarios", async ({ page }) => {
    await openProjectRealityEvidenceReview(page);
    const classification = page.getByTestId("select-classification-electricity_cost");
    await classification.selectOption("Missing Evidence");
    await expect(page.getByTestId("review-marker-electricity_cost")).toContainText("Reviewed by analyst");

    const savedScenarios = JSON.stringify({
      version: 1,
      scenarios: [
        {
          id: "kept-scenario",
          name: "Keep me",
          savedAt: "2026-08-29T12:00:00.000Z",
          classifications: await page.evaluate((key) => {
            const session = JSON.parse(window.localStorage.getItem(key) ?? "{}");
            return session.classifications;
          }, currentSessionKey),
          metrics: { projectIRR: 10, moic: 1.5, npv: 12, cashOnCash: 8, payback: 4, confidence: 50 },
        },
      ],
    });
    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), { key: scenariosKey, value: savedScenarios });
    await page.reload();
    await openProjectRealityEvidenceReview(page);

    await page.getByTestId("button-reset-default").click();
    await expect(page.getByRole("heading", { name: "Reset to Default?" })).toBeVisible();
    await expect(page.getByText("Named scenarios are kept.")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(classification).toHaveValue("Missing Evidence");
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), currentSessionKey)).not.toBeNull();

    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("tab-market")).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), currentSessionKey)).toMatchObject({
      originatingCompany: "Oracle",
      version: 2,
    });
    await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").scenarios?.[0]?.name, scenariosKey)).toBe("Keep me");

    await openProjectRealityEvidenceReview(page);
    await expect(classification).toHaveValue("User Assumption");
    await expect(page.getByTestId("review-marker-electricity_cost")).toHaveCount(0);
    await openFinancialTransmission(page);
    await expect(page.getByTestId("materiality-classification-prompt")).toBeVisible();
  });

  test("reset keeps the selected canonical dossier identity", async ({ page }) => {
    await page.goto("/#analysis/project-kilby");
    await expect(page.getByTestId("conference-summary")).toContainText("Project Kilby");

    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();

    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("conference-summary").locator("h1")).toHaveText("Project Kilby");
    await expect(page.getByTestId("conference-research-status")).toHaveText("Canonical evidence review");
    await page.reload();
    await expect(page.getByTestId("conference-summary").locator("h1")).toHaveText("Project Kilby");
    await expect(page.getByTestId("conference-research-status")).toHaveText("Canonical evidence review");
  });

  test("restores dossier review overrides after reload and resets only to its immutable baseline", async ({ page }) => {
    await page.goto("/#analysis/project-kilby");
    await expect(page.getByTestId("conference-summary")).toContainText("Project Kilby");
    const beforeResponse = await page.request.get("/api/dossiers/project-kilby");
    expect(beforeResponse.ok()).toBeTruthy();
    const dossierBefore = await beforeResponse.json();
    const review = await page.evaluate((key) => {
      const session = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      const canonicalReview = session.canonicalReview;
      if (!canonicalReview || canonicalReview.slug !== "project-kilby") {
        throw new Error("Canonical dossier baseline was not persisted.");
      }
      const id = Object.keys(canonicalReview.baselineEvidence)[0];
      const baselineClassification = canonicalReview.baselineEvidence[id].classification;
      const override = baselineClassification === "Verified Evidence" ? "Missing Evidence" : "Verified Evidence";
      const reviewedAt = "2026-09-20T10:00:00.000Z";
      canonicalReview.overrides = { [id]: override };
      canonicalReview.reviewMetadata = { [id]: { kind: "manual", reviewedAt } };
      session.hasChangedClassification = true;
      session.decisionHistory = [{
        kind: "manual",
        itemId: id,
        previousClassification: baselineClassification,
        resultingClassification: override,
        recordedAt: reviewedAt,
      }];
      window.localStorage.setItem(key, JSON.stringify(session));
      return { id, baselineClassification, override, reviewedAt, baselineEvidence: canonicalReview.baselineEvidence };
    }, currentSessionKey);

    await page.reload();
    await expect(page).toHaveURL(/#analysis\/project-kilby$/);
    await expect(page.getByTestId("conference-summary")).toContainText("Project Kilby");
    await page.waitForFunction(() => typeof (window as any).__safelocCaptureReturnDiscrepancyState === "function");
    const afterReload = await captureReturnState(page);
    expect(afterReload.classifications[review.id]).toBe(review.override);
    const restoredSession = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), currentSessionKey);
    expect(restoredSession.canonicalReview.slug).toBe("project-kilby");
    expect(restoredSession.canonicalReview.baselineEvidence).toEqual(review.baselineEvidence);
    expect(restoredSession.canonicalReview.overrides[review.id]).toBe(review.override);
    expect(restoredSession.decisionHistory).toContainEqual(expect.objectContaining({
      itemId: review.id,
      resultingClassification: review.override,
      recordedAt: review.reviewedAt,
    }));

    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.getByTestId("conference-summary").locator("h1")).toHaveText("Project Kilby");
    const afterReset = await captureReturnState(page);
    expect(afterReset.classifications[review.id]).toBe(review.baselineClassification);
    const resetSession = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), currentSessionKey);
    expect(resetSession.canonicalReview.slug).toBe("project-kilby");
    expect(resetSession.canonicalReview.overrides).toEqual({});
    expect(resetSession.canonicalReview.baselineEvidence).toEqual(review.baselineEvidence);
    expect(resetSession.classifications[review.id]).toBe(review.baselineClassification);
    expect(resetSession.modelEvidence[review.id]?.origin).toBe("dossier");
    expect(resetSession.modelEvidence[review.id]?.classification).toBe(review.baselineClassification);
    expect(resetSession.decisionHistory).toEqual([]);

    const afterResponse = await page.request.get("/api/dossiers/project-kilby");
    expect(await afterResponse.json()).toEqual(dossierBefore);
    await page.reload();
    await expect(page.getByTestId("conference-summary").locator("h1")).toHaveText("Project Kilby");
    const afterReloadReset = await captureReturnState(page);
    expect(afterReloadReset.classifications[review.id]).toBe(review.baselineClassification);
  });

  test("Stargate gate review changes posture without moving returns, while a driver changes returns; reset restores both", async ({ page }) => {
    await page.goto("/#analysis/stargate-abilene");
    await expect(page.getByTestId("conference-summary").locator("h1")).toHaveText("Stargate Abilene");
    const canonicalResponse = await page.request.get("/api/dossiers/stargate-abilene");
    expect(canonicalResponse.ok()).toBeTruthy();
    const canonicalBefore = await canonicalResponse.json();
    const baseline = await page.evaluate((key) => {
      const review = JSON.parse(localStorage.getItem(key) ?? "{}").canonicalReview;
      return review.baselineEvidence;
    }, currentSessionKey);
    expect(baseline.water_rights.classification).toBe("Missing Evidence");

    const posture = async () => {
      const recommendation = await page.getByTestId("conference-primary-case").textContent();
      await openFinancialTransmission(page);
      // Model decision gates count classifications; the separate conference
      // source bucket can remain open until source support is validated.
      const gateCount = Number((await page.getByTestId("live-material-gaps").textContent())?.match(/Unresolved decision gates: (\d+)/)?.[1]);
      const confidence = await page.getByTestId("live-confidence").textContent();
      await page.getByTestId("financial-tab-cash-flows").click();
      const irr = await page.getByTestId("metric-project-irr").textContent();
      const npv = await page.getByTestId("metric-npv").textContent();
      return { recommendation, gateCount, irr, npv, confidence };
    };
    const before = await posture();
    await openProjectRealityEvidenceReview(page);
    const water = page.getByTestId("row-evidence-water_rights");
    await water.getByTestId("select-classification-water_rights").selectOption("Verified Evidence");
    await expect(water.getByTestId("session-override-water_rights")).toContainText("Session override · dossier baseline: Missing Evidence");
    const gateChanged = await posture();
    expect(gateChanged.gateCount).toBe(before.gateCount - 1);
    expect(gateChanged.confidence).not.toBe(before.confidence);
    expect(gateChanged.recommendation).not.toBe(before.recommendation);
    expect(gateChanged.irr).toBe(before.irr);
    expect(gateChanged.npv).toBe(before.npv);

    await openProjectRealityEvidenceReview(page);
    const power = page.getByTestId("row-evidence-permitting_timeline");
    const powerBaseline = await power.getByTestId("select-classification-permitting_timeline").inputValue();
    await power.getByTestId("select-classification-permitting_timeline").selectOption(
      powerBaseline === "Missing Evidence" ? "Verified Evidence" : "Missing Evidence",
    );
    await expect(power.getByTestId("session-override-permitting_timeline")).toContainText(`dossier baseline: ${powerBaseline}`);
    const driverChanged = await posture();
    expect(driverChanged.irr === gateChanged.irr && driverChanged.npv === gateChanged.npv).toBe(false);

    await page.reload();
    await openProjectRealityEvidenceReview(page);
    await expect(page.getByTestId("session-override-water_rights")).toContainText("dossier baseline: Missing Evidence");
    await expect(page.getByTestId("session-override-permitting_timeline")).toContainText(`dossier baseline: ${powerBaseline}`);
    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    const afterReset = await posture();
    expect(afterReset).toEqual(before);
    await openProjectRealityEvidenceReview(page);
    await expect(page.getByTestId("select-classification-water_rights")).toHaveValue("Missing Evidence");
    await expect(page.getByTestId("select-classification-permitting_timeline")).toHaveValue(powerBaseline);
    await expect(page.getByTestId("session-override-water_rights")).toHaveCount(0);
    await expect(page.getByTestId("session-override-permitting_timeline")).toHaveCount(0);
    const resetReview = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").canonicalReview, currentSessionKey);
    expect(resetReview.baselineEvidence).toEqual(baseline);
    expect(resetReview.overrides).toEqual({});
    expect(await (await page.request.get("/api/dossiers/stargate-abilene")).json()).toEqual(canonicalBefore);
  });

  test("unknown custom capacity stays null through model construction and sanitized export", async ({ page }) => {
    const projectKey = "example custom data center|arlington, texas";
    await seedCustomResearchSession(page, null);
    const fixtureShape = await page.evaluate((key) => {
      const session = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      return {
        evidenceCount: Object.keys(session.customResearch?.evidence ?? {}).length,
        modelEvidenceCount: Object.keys(session.customResearch?.modelEvidence ?? {}).length,
      };
    }, currentSessionKey);
    expect(fixtureShape.evidenceCount).toBe(16);
    expect(fixtureShape.modelEvidenceCount).toBe(16);
    await page.reload();
    await page.waitForFunction(() => typeof (window as any).__safelocCaptureReturnDiscrepancyState === "function");

    const unknown = await captureReturnState(page);
    expect(unknown.project.kind).toBe("custom");
    expect(unknown.project.capacityMW).toBeNull();
    expect(unknown.modelInputs.assumptions.capacityMW).toBeNull();
    expect(unknown.financialScenarios.scenarios).toEqual({
      "synthetic-verified": null,
      "synthetic-current": null,
      "eia-verified": null,
      "eia-current": null,
    });

    const acceptedClaim = {
      value: 180,
      unit: "MW",
      powerMeasure: "it-capacity",
      scope: { kind: "campus", campusId: "Example Custom Data Center" },
      status: "current",
      sourceTitle: "Example capacity announcement",
      sourceUrl: "https://example.com/capacity",
      sourceDate: "2026-09-01",
      humanAccepted: true,
    };
    await seedCustomResearchSession(page, {
      projectKey,
      decision: "accepted",
      acceptedFindingId: "finding-it-capacity",
      acceptedClaim,
      illustrativeCapacityMW: null,
      trail: [{ action: "accepted", findingId: "finding-it-capacity", recordedAt: "2026-09-03T10:00:00.000Z" }],
    });
    await page.reload();
    await page.waitForFunction(() => typeof (window as any).__safelocCaptureReturnDiscrepancyState === "function");
    const accepted = await captureReturnState(page);
    expect(accepted.project.capacityMW).toBe(180);
    expect(accepted.modelInputs.assumptions.capacityMW).toBe(180);
    expect(accepted.financialScenarios.scenarios["synthetic-current"]).not.toBeNull();

    await seedCustomResearchSession(page, {
      projectKey,
      decision: "rejected",
      acceptedFindingId: null,
      acceptedClaim: null,
      illustrativeCapacityMW: null,
      trail: [{ action: "rejected", findingId: "finding-it-capacity", recordedAt: "2026-09-04T10:00:00.000Z" }],
    });
    await page.reload();
    await page.waitForFunction(() => typeof (window as any).__safelocCaptureReturnDiscrepancyState === "function");
    const rejected = await captureReturnState(page);
    expect(rejected.project.capacityMW).toBeNull();
    expect(rejected.modelInputs.assumptions.capacityMW).toBeNull();

    await seedCustomResearchSession(page, {
      projectKey,
      decision: null,
      acceptedFindingId: null,
      acceptedClaim: null,
      illustrativeCapacityMW: 700,
      trail: [{ action: "illustrative-set", findingId: null, recordedAt: "2026-09-05T10:00:00.000Z" }],
    });
    await page.reload();
    await page.waitForFunction(() => typeof (window as any).__safelocCaptureReturnDiscrepancyState === "function");
    const illustrative = await captureReturnState(page);
    expect(illustrative.project.capacityMW).toBe(700);
    expect(illustrative.modelInputs.assumptions.capacityMW).toBe(700);
  });

  test("captures a sanitized state that is identical after reset and immediate reload", async ({ page }) => {
    await expect(page.getByTestId("eia-loading")).toHaveCount(0);
    const initial = await captureReturnState(page);
    expect(Object.keys(initial.classifications)).toHaveLength(16);
    expect(initial.modelInputs.fingerprint).toMatch(/^fnv1a-[0-9a-f]+$/);
    expect(initial.release.fingerprint).toMatch(/^fnv1a-[0-9a-f]+$/);
    expect(initial.providerProvenance.eia.status).toBe("fallback");
    expect(initial.providerProvenance.ercotQueue.status).toBe("embedded");

    await openProjectRealityEvidenceReview(page);
    await page.getByTestId("select-classification-electricity_cost").selectOption("Missing Evidence");
    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await expect(page).toHaveURL(/#analysis$/);

    const afterReset = await captureReturnState(page);
    await page.reload();
    await expect(page.getByTestId("eia-loading")).toHaveCount(0);
    const afterReload = await captureReturnState(page);

    expect(afterReload).toEqual(afterReset);
    expect(afterReload.modelInputs.fingerprint).toBe(afterReset.modelInputs.fingerprint);
    expect(JSON.stringify(afterReload)).not.toMatch(/EIA_API_KEY|authorization|cookie|"priceHistory"\s*:|"responsePreview"\s*:/i);
  });

  test("lets maintainers download the current sanitized return discrepancy record", async ({ page }) => {
    await page.getByTestId("ercot-console-toggle").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("button-download-return-discrepancy").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("safeloc-return-discrepancy.json");

    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("Sanitized return discrepancy download did not produce a local file.");
    const record = JSON.parse(await readFile(downloadPath, "utf8")) as ReturnCapture & {
      captureSchemaVersion: number;
      release: { identity: unknown; fingerprint: string };
    };

    expect(record.captureSchemaVersion).toBe(2);
    expect(record.financialScenarios.primaryScenarioId).toBe("synthetic-current");
    expect(record.financialScenarios.scenarios["synthetic-current"]).toMatchObject({
      name: "Synthetic current-evidence case",
      role: "primary",
      evidenceBasis: "current",
      electricityBasis: "synthetic",
    });
    expect(record.release.identity?.assets).toEqual([]);
    expect(record.modelInputs.fingerprint).toMatch(/^fnv1a-[0-9a-f]+$/);
    expect(record.release.fingerprint).toMatch(/^fnv1a-[0-9a-f]+$/);
    expect(record.release).toHaveProperty("identity");
    expect(JSON.stringify(record)).not.toMatch(/EIA_API_KEY|authorization|cookie|responsePreview|rawProviderPayload|arbitraryStorageValue/i);
  });

});
