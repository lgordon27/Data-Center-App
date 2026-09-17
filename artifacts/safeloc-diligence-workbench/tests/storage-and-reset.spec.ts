import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const currentSessionKey = "safeloc:diligence:current-session:v1";
const scenariosKey = "safeloc:diligence:scenarios:v1";
const evidenceTipDismissedKey = "safeloc:diligence:evidence-room-tip-dismissed:v1";

type ReturnCapture = {
  classifications: Record<string, string>;
  modelInputs: { fingerprint: string };
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
    expect(record.release.identity).toMatchObject({
      assets: expect.arrayContaining([
        expect.objectContaining({
          file: expect.stringMatching(/^assets\/.+\.(?:js|css)$/),
          hash: expect.stringMatching(/^sha256-[0-9a-f]{64}$/),
        }),
      ]),
    });
    expect(record.modelInputs.fingerprint).toMatch(/^fnv1a-[0-9a-f]+$/);
    expect(record.release.fingerprint).toMatch(/^fnv1a-[0-9a-f]+$/);
    expect(record.release).toHaveProperty("identity");
    expect(JSON.stringify(record)).not.toMatch(/EIA_API_KEY|authorization|cookie|responsePreview|rawProviderPayload|arbitraryStorageValue/i);
  });

});
