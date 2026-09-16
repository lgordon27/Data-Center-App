import { expect, test } from "@playwright/test";

async function captureReturnState(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const capture = (window as Window & {
      __safelocCaptureReturnDiscrepancyState?: () => Promise<{
        classifications: Record<string, string>;
        providerProvenance: { ercotQueue: { status: string; providerStatus: string } };
        modelInputs: { fingerprint: string };
      }>;
    }).__safelocCaptureReturnDiscrepancyState;
    if (!capture) throw new Error("Return discrepancy capture hook is unavailable.");
    return capture();
  });
}

const ercotEnvelope = {
  status: "live",
  fetchedAt: "2026-08-30T12:00:00.000Z",
  sourceUpdatedAt: "2026-08-07T17:27:53.695Z",
  diagnostics: {
    endpoint: "/api/ercot-queue",
    requestTimestamp: "2026-08-30T12:00:00.000Z",
    responseStatus: 200,
    cache: "miss",
    sourceFreshness: "2026-08-07T17:27:53.695Z",
    responses: [{ key: "projects", status: 200 }],
  },
  data: {
    projects: {
      generated_at: "2026-08-05T01:57:28.643Z",
      projects: [{
        inr: "26INR0999",
        name: "Crusoe Stargate Abilene",
        capacity_mw: 1200,
        projected_cod: "2027-06-30",
        status_raw: "Delayed pending IA",
        cod_delayed: true,
        queue_position: 42,
        milestones: { ia_signed: null },
      }],
    },
    codHistory: [{
      inr: "26INR0999",
      old_value: "2026-06-30",
      new_value: "2027-06-30",
    }],
    loadQueueSummary: {
      generated_at: "2026-08-07T00:00:00Z",
      summary: {
        as_of_date: "2026-06-18",
        source_refresh_date: "2026-07-15",
        buckets: [{ status: "submitted", mw: 466_497, project_count: null }],
        by_sector: [{ sector: "data_center", mw: 420_812, project_count: null }],
      },
    },
    siteFreshness: { generated_at: "2026-08-07T17:27:53.695Z" },
  },
};

test.describe("ERCOTQueue governed source flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.route("**/api/eia/electricity", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ diagnostics: { error: "deterministic embedded fallback" } }) });
    });
    await page.route("**/api/ercot-queue", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ercotEnvelope) });
    });
  });

  test("surfaces named records and keeps verification explicit", async ({ page }) => {
    await page.goto("/#evidence");
    await expect(page.getByTestId("ercot-grid-evidence")).toBeVisible();
    await expect(page.getByTestId("ercot-matching-record")).toContainText("Crusoe Stargate Abilene");
    await expect(page.getByTestId("ercot-matching-record")).toContainText("Queue position 42");
    await expect(page.getByTestId("eia-electricity-evidence")).toBeVisible();
    await expect(page.getByTestId("eia-loading")).toHaveCount(0);

    const classification = page.getByTestId("select-classification-grid_interconnection");
    await classification.selectOption("Management Assertion");
    await page.getByTestId("button-suggest-verified-grid").click();
    await expect(classification).toHaveValue("Verified Evidence");
    await expect(page.getByTestId("toast-reclassification")).toBeVisible();
    const capture = await captureReturnState(page);
    expect(capture.providerProvenance.ercotQueue).toMatchObject({ status: "live", providerStatus: "live" });
    expect(Object.keys(capture.classifications)).toHaveLength(16);
  });

  test("shows exactly three source cards and ERCOT/EIA-only diagnostics", async ({ page }) => {
    await page.goto("/#brief");
    await expect(page.locator("[data-testid^='data-source-']:not([data-testid^='data-source-status-'])")).toHaveCount(3);
    await expect(page.getByTestId("data-source-ercot-queue")).toContainText("ERCOTQueue");
    await expect(page.getByTestId("data-source-eia")).toContainText("EIA");
    await expect(page.getByTestId("data-source-fema-nri")).toContainText("FEMA NRI");

    await page.getByTestId("ercot-console-toggle").click();
    await expect(page.getByTestId("ercot-developer-console")).toContainText("/api/ercot-queue");
    await expect(page.getByTestId("eia-console-diagnostics")).toContainText("/api/eia/electricity");
  });

  test("captures cached and embedded ERCOT provenance without provider payloads", async ({ page }) => {
    await page.unroute("**/api/ercot-queue");
    await page.route("**/api/ercot-queue", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...ercotEnvelope,
          status: "cached",
          diagnostics: { ...ercotEnvelope.diagnostics, cache: "hit" },
        }),
      });
    });
    await page.goto("/#evidence");
    const cachedCapture = await captureReturnState(page);
    expect(cachedCapture.providerProvenance.ercotQueue).toMatchObject({ status: "cached", providerStatus: "cached" });

    await page.unroute("**/api/ercot-queue");
    await page.route("**/api/ercot-queue", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ diagnostics: { error: "deterministic embedded fallback" } }),
      });
    });
    await page.reload();
    const fallbackCapture = await captureReturnState(page);
    expect(fallbackCapture.providerProvenance.ercotQueue).toMatchObject({ status: "embedded", providerStatus: "embedded" });
    expect(JSON.stringify(fallbackCapture)).not.toMatch(/status_raw|codHistory|responsePreview|authorization|cookie/i);
  });
});