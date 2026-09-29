import { expect, test } from "@playwright/test";

const currentSessionKey = "safeloc:diligence:current-session:v1";

async function readCapacityMW(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const capture = (window as Window & {
      __safelocCaptureReturnDiscrepancyState?: () => Promise<{
        modelInputs: { assumptions: { capacityMW: number | null } };
      }>;
    }).__safelocCaptureReturnDiscrepancyState;
    if (!capture) throw new Error("Return discrepancy capture hook is unavailable.");
    return (await capture()).modelInputs.assumptions.capacityMW;
  });
}

async function seedCustomProject(
  page: import("@playwright/test").Page,
  includeCapacityCandidate: boolean,
) {
  const modelEvidence = await page.evaluate(async () => {
    const capture = (window as Window & {
      __safelocCaptureReturnDiscrepancyState?: () => Promise<{
        modelInputs: { evidence: Record<string, Record<string, unknown>> };
      }>;
    }).__safelocCaptureReturnDiscrepancyState;
    if (!capture) throw new Error("Return discrepancy capture hook is unavailable.");
    return (await capture()).modelInputs.evidence;
  });
  await page.evaluate(({ key, modelEvidence, includeCapacityCandidate }) => {
    const session = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    session.customResearch = {
      project: {
        kind: "custom",
        name: "Red Oak Campus",
        location: "Red Oak, Texas",
        description: "Local-only financial provenance test.",
        capacityMW: null,
        capacityProvenance: "unknown",
        retainedFindings: includeCapacityCandidate ? [{
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
          sourceTitle: "Red Oak Campus capacity announcement",
          sourceUrl: "https://example.com/red-oak-capacity",
          passage: "Red Oak Campus in Red Oak has 180 MW of IT capacity.",
        }] : [],
      },
      evidence: modelEvidence,
      modelEvidence,
      researchProposals: {},
      researchProposalDispositions: {},
      researchProposalOverrides: {},
    };
    session.selectedProjectContext = {
      company: "Microsoft",
      projectId: "red-oak-campus",
      projectName: "Red Oak Campus",
      operator: "DataBank",
      location: "Red Oak, Texas",
      capacityMW: null,
      status: "Research required",
      relationshipType: "Developer/Operator",
      evidenceState: "Discovery match",
      kind: "directory",
      sourceUrl: "https://example.com/red-oak-capacity",
      providerId: "red-oak-campus",
    };
    delete session.capacityReview;
    delete session.canonicalReview;
    window.localStorage.setItem(key, JSON.stringify(session));
  }, { key: currentSessionKey, modelEvidence, includeCapacityCandidate });
  await page.reload();
  await expect(page.getByTestId("conference-summary")).toContainText("Red Oak Campus");
}

async function ensureIllustrativeScenarioOpen(page: import("@playwright/test").Page) {
  const toggle = page.locator('[data-testid="button-opt-in-scenario"], [data-testid="button-illustrative-stress-test"]').first();
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

test.describe("Financial Impact Chain", () => {
  test("opens on the return overview and separates drivers, cash flows, and assumptions", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("tab-transmission").click();

    const stressTest = page.getByRole("button", { name: /Illustrative Project Stress Test/i });
    await expect(stressTest).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("panel-impact-chain")).toBeVisible();
    await expect(page.getByTestId("provider-overlay-comparison")).toBeVisible();
    await expect(page.getByTestId("provider-overlay-comparison")).toContainText(/Synthetic underwriting baseline/i);
    await expect(page.getByTestId("provider-overlay-comparison")).toContainText(/not a disclosed Stargate Abilene tariff/i);
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
    await expect(page.getByTestId("model-input-assumption-electricity_cost")).toContainText("Synthetic default — not dossier evidence");

    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByTestId("text-current-irr-materiality")).toContainText("%");

    await page.getByRole("tab", { name: "Key Drivers" }).click();
    await expect(page.getByTestId("panel-impact-chain")).toBeHidden();
    await expect(page.getByTestId("panel-irr-waterfall")).toBeVisible();
    await expect(page.getByTestId("waterfall-methodology")).toContainText(/weaker evidence/i);
    await expect(page.getByTestId("model-input-provenance-electricity_cost")).toContainText("Synthetic default — not dossier evidence");

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
    await expect(page.getByTestId("model-input-provenance-electricity_cost")).toContainText("Synthetic default — not dossier evidence");
  });

  test("shows dossier origin and session overrides separately from source classification", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("canonical-dossier-select").selectOption("stargate-abilene");
    await expect(page.getByTestId("conference-summary")).toContainText("Stargate Abilene");
    await page.evaluate((key) => {
      const session = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      if (!session.canonicalReview) throw new Error("Canonical review was not persisted.");
      session.canonicalReview.overrides = {
        ...session.canonicalReview.overrides,
        customer_concentration: "Missing Evidence",
      };
      window.localStorage.setItem(key, JSON.stringify(session));
    }, currentSessionKey);
    await page.reload();
    await page.getByTestId("tab-transmission").click();
    await ensureIllustrativeScenarioOpen(page);
    await page.getByRole("tab", { name: "Assumptions" }).click();

    const provenance = page.getByTestId("model-input-assumption-customer_concentration");
    await expect(provenance).toContainText("Dossier evidence");
    await expect(provenance).toContainText("Session override");
    await expect(provenance).toContainText("Source classification: Missing Evidence");
  });

  test("reviews a custom capacity candidate without modeling it until acceptance", async ({ page }) => {
    await page.goto("/#analysis");
    await seedCustomProject(page, true);
    await expect(page.getByTestId("header-project-identity")).toContainText("Red Oak Campus · DataBank");
    await page.getByTestId("tab-transmission").click();
    await ensureIllustrativeScenarioOpen(page);

    const financialCandidate = page.getByTestId("financial-capacity-candidate");
    await expect(page.getByTestId("custom-project-not-modeled")).toBeVisible();
    await expect(financialCandidate).toContainText("Red Oak Campus capacity announcement");
    await expect(financialCandidate).toContainText("Campus · Red Oak Campus");
    await expect(financialCandidate).toContainText("2026-09-01");
    await financialCandidate.getByTestId("financial-capacity-reject").click();
    await expect(page.getByTestId("financial-capacity-review-status")).toContainText("rejected");
    expect(await readCapacityMW(page)).toBeNull();

    await page.getByTestId("tab-reality").click();
    const realityCandidate = page.getByTestId("reality-capacity-candidate");
    await expect(realityCandidate).toContainText("Red Oak Campus capacity announcement");
    await expect(realityCandidate).toContainText("Campus · Red Oak Campus");
    await expect(realityCandidate).toContainText("2026-09-01");
    await page.getByTestId("reality-capacity-accept").click();
    await expect(page.getByTestId("reality-capacity-review-status")).toContainText("accepted");
    expect(await readCapacityMW(page)).toBe(180);

    await page.getByTestId("tab-transmission").click();
    await ensureIllustrativeScenarioOpen(page);
    await expect(page.getByTestId("custom-project-not-modeled")).toHaveCount(0);
    await expect(page.getByTestId("custom-illustrative-boundary")).toContainText("Illustrative — not project economics");
    const explanation = page.getByTestId("custom-capacity-explanation");
    await expect(explanation).toContainText("Sourced (source, date, accepted by user)");
    await expect(explanation).toContainText("Analyst assumption");
    await expect(explanation).toContainText("Model constant");
    await expect(explanation).toContainText("Red Oak Campus capacity announcement");
    await expect(explanation).toContainText("2026-09-01");
    await expect(explanation).toContainText("accepted by user");
    await page.getByTestId("tab-advisor").click();
    await expect(page.getByTestId("advisor-illustrative-boundary")).toContainText("Illustrative — not project economics");
  });

  test("an entered custom capacity remains explicitly illustrative and clearing it restores the null model state", async ({ page }) => {
    await page.goto("/#analysis");
    await seedCustomProject(page, false);
    await page.getByTestId("tab-transmission").click();
    await ensureIllustrativeScenarioOpen(page);
    await expect(page.getByTestId("custom-project-not-modeled")).toBeVisible();
    expect(await readCapacityMW(page)).toBeNull();

    await page.getByTestId("input-financial-illustrative-capacity").fill("720");
    await expect(page.getByTestId("custom-illustrative-boundary")).toContainText("Illustrative — not project economics");
    expect(await readCapacityMW(page)).toBe(720);
    const explanation = page.getByTestId("custom-capacity-explanation");
    await expect(explanation).toContainText("Illustrative · Analyst assumption");
    await expect(explanation).toContainText("labeled Illustrative");
    await expect(explanation).toContainText("Analyst assumption");
    await expect(explanation).toContainText("Model constant");
    await expect(page.getByTestId("impact-chain-baseline-irr")).toBeVisible();
    await expect(page.getByTestId("impact-chain-stress-irr")).toBeVisible();

    await page.getByTestId("tab-reality").click();
    await page.getByTestId("input-reality-illustrative-capacity").fill("");
    expect(await readCapacityMW(page)).toBeNull();
    await page.getByTestId("tab-transmission").click();
    await ensureIllustrativeScenarioOpen(page);
    await expect(page.getByTestId("custom-project-not-modeled")).toBeVisible();
  });

  test("keeps Project Kilby financial disclosures project-specific and identifies its operator", async ({ page }) => {
    await page.goto("/#analysis");
    await page.getByTestId("canonical-dossier-select").selectOption("project-kilby");
    await expect(page.getByTestId("header-project-identity")).toContainText("Project Kilby · Microsoft");
    await page.evaluate((key) => {
      const session = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      session.selectedProjectContext = {
        ...(session.selectedProjectContext ?? {}),
        company: "Microsoft",
        projectId: "project-kilby",
        projectName: "Project Kilby",
        operator: "Stale directory operator",
        location: "Atlanta, Fulton County, GA",
      };
      window.localStorage.setItem(key, JSON.stringify(session));
    }, currentSessionKey);
    await page.reload();
    const projectIdentity = page.getByTestId("header-project-identity");
    await expect(projectIdentity).toContainText("Project Kilby · Microsoft / Reeves County, West Texas");
    await expect(projectIdentity).not.toContainText("Stale directory operator");
    await expect(projectIdentity).not.toContainText("Atlanta, Fulton County, GA");
    await page.getByTestId("tab-transmission").click();
    const transmission = page.getByTestId("conference-view-transmission");
    await expect(transmission.getByTestId("transmission-return-boundary")).toContainText("Project Kilby tariff");
    await expect(transmission.getByTestId("transmission-return-boundary")).not.toContainText("Stargate");
    await expect(transmission).not.toContainText("Stargate");
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