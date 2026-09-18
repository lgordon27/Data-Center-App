import { expect, test } from "@playwright/test";

const directoryResponse = {
  sourceMetadata: {
    provider: "Compute Atlas",
    attributionUrl: "https://compute-atlas.com",
    status: "embedded",
    dataOrigin: "embedded",
    snapshotVersion: "test-snapshot",
  },
  facilities: [
    {
      id: "project-rainier-microsoft-wi",
      name: "Project Rainier",
      operator: "Microsoft",
      city: "Mount Pleasant",
      county: "Racine",
      state: "WI",
      capacityMW: 315,
      availableCapacityMW: 315,
      status: "construction",
      confidence: "reported",
      aiClassification: "ai_training",
      sourceUrl: "https://compute-atlas.com/facilities/project-rainier-microsoft-wi",
      connectedCompanies: ["Microsoft"],
      connectedFunds: ["QQQ", "XLK"],
      lastUpdated: null,
    },
  ],
  totalAvailable: 1,
  totalMatching: 1,
  offset: 0,
  limit: 100,
  nextOffset: null,
  hasMore: false,
};

test.describe("stock-first company exposure flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/directory**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(directoryResponse) }));
  });

  test("defers the selected-company directory match until a holding is opened", async ({ page }) => {
    const directoryRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/directory")) directoryRequests.push(request.url());
    });
    await page.goto("/#home");
    await expect(page.getByTestId("home-stock-picker")).toBeVisible();
    expect(directoryRequests).toHaveLength(0);
    await page.getByTestId("company-card-microsoft").click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    await expect.poll(() => directoryRequests.length).toBe(1);
    expect(directoryRequests[0]).toContain("company=Microsoft");
    await page.goto("/#directory");
    await expect(page.getByTestId("compute-atlas-page")).toBeVisible();
    await expect.poll(() => directoryRequests.length).toBeGreaterThan(1);
  });

  test("opens alternate-project actions within the interaction budget without directory work", async ({ page }) => {
    const directoryRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/directory")) directoryRequests.push(request.url());
    });
    await page.goto("/#home");
    const dispatchMs = await page.getByTestId("button-analyze-another-project").evaluate((button) => {
      const started = performance.now();
      (button as HTMLButtonElement).click();
      return performance.now() - started;
    });
    expect(dispatchMs).toBeLessThan(2_000);
    await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
    await expect(page.getByTestId("input-custom-project-name")).toBeEnabled();
    await expect(page.getByTestId("input-custom-project-location")).toBeEnabled();
    expect(directoryRequests).toHaveLength(0);
    await page.getByTestId("button-close-custom-project").click();
    await page.getByTestId("company-card-microsoft").click();
    await expect.poll(() => directoryRequests.length).toBe(1);
    expect(directoryRequests[0]).toContain("company=Microsoft");
    await page.getByTestId("company-project-open-project-kilby").click();
    await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
    await expect(page.getByTestId("input-custom-project-name")).toHaveValue("Project Kilby");
    await expect(page.getByTestId("input-custom-project-location")).toHaveValue("Reeves County, West Texas");
    expect(directoryRequests).toHaveLength(1);
  });

  test("contains directory render failures inside the route and keeps Home usable", async ({ page }) => {
    await page.addInitScript(() => {
      window.__safelocForceDirectoryRenderError = true;
    });
    await page.goto("/#directory");
    await expect(page.getByTestId("directory-route-error")).toBeVisible();
    await expect(page.getByTestId("button-retry-directory-route")).toBeVisible();
    await page.getByTestId("link-directory-error-home").click();
    await expect(page).toHaveURL(/#home$/);
    await expect(page.getByTestId("home-stock-picker")).toBeVisible();
  });

  test("keeps workbench navigation responsive while the directory API stalls", async ({ page }) => {
    await page.unroute("**/api/directory**");
    await page.route("**/api/directory**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Provider unavailable" }) });
    });
    await page.goto("/#directory");
    await expect(page.getByTestId("compute-atlas-loading")).toBeVisible();
    const navigationFrameDelay = await page.evaluate(() => new Promise<number>((resolve) => {
      const started = performance.now();
      window.location.hash = "home";
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - started)));
    }));
    expect(navigationFrameDelay).toBeLessThan(2_000);
    await expect(page.getByTestId("home-stock-picker")).toBeVisible();
    await page.goto("/#evidence");
    await expect(page.getByTestId("text-evidence-count")).toContainText("16 / 16");
  });

  test("can leave a representative large directory response without a main-thread lock", async ({ page }) => {
    let returnedFacilityCount = 0;
    const facilities = Array.from({ length: 600 }, (_, index) => ({
      ...directoryResponse.facilities[0],
      id: `large-facility-${index}`,
      name: `Large Facility ${index}`,
    }));
    await page.unroute("**/api/directory**");
    await page.route("**/api/directory**", (route) => {
      returnedFacilityCount = facilities.length;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...directoryResponse,
          facilities,
          totalFacilities: facilities.length,
          offset: 0,
          limit: facilities.length,
          hasMore: false,
        }),
      });
    });
    await page.goto("/#directory");
    await expect(page.getByTestId("compute-atlas-page")).toBeVisible();
    await expect(page.locator("[data-testid^='compute-atlas-record-large-facility-']")).toHaveCount(24);
    expect(returnedFacilityCount).toBe(600);
    const navigationDispatchMs = await page.evaluate(() => {
      const started = performance.now();
      window.location.hash = "home";
      return performance.now() - started;
    });
    expect(navigationDispatchMs).toBeLessThan(2_000);
    await expect(page.getByTestId("home-stock-picker")).toBeVisible();
  });

  test("shows all six companies, drill-down summaries, and curated handoff context", async ({ page }) => {
    await page.goto("/#home");
    await expect(page.getByTestId("home-stock-picker")).toBeVisible();
    await expect(page.locator("[data-testid^='company-card-']")).toHaveCount(6);
    await page.getByTestId("company-card-microsoft").click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    await expect(page.getByTestId("company-connection-note")).toHaveText("Connection types indicate the nature of the relationship, not the magnitude of financial exposure.");
    await expect(page.getByTestId("company-fund-context")).toContainText("iShares ESG Advanced MSCI USA ETF");
    await expect(page.getByTestId("company-project-list")).toContainText("Project Kilby");
    await expect(page.getByTestId("company-project-connection-project-kilby")).toHaveText("Developer/Operator");
    await expect(page.getByTestId("company-project-list")).toContainText("Project Rainier");
    await expect(page.getByTestId("company-summary-source-backed")).toContainText("2");
    await expect(page.getByTestId("company-summary-discovery")).toContainText("1");
    await expect(page.getByTestId("company-project-evidence-project-kilby")).toHaveText("Source-backed");
    await expect(page.getByTestId("company-project-evidence-project-rainier-microsoft-wi")).toHaveText("Discovery match");
    await page.getByTestId("company-project-open-project-kilby").click();
    await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
    await expect(page.getByTestId("input-custom-project-name")).toHaveValue("Project Kilby");
    await expect(page.getByTestId("input-custom-project-location")).toHaveValue("Reeves County, West Texas");
  });

  test("records safe holding and project action events", async ({ page }) => {
    await page.addInitScript(() => {
      window.umami = {
        track(name, data) {
          const analyticsWindow = window as typeof window & {
            __safelocAnalytics?: Array<{ name: string; data?: Record<string, string | number | boolean> }>;
          };
          analyticsWindow.__safelocAnalytics = [
            ...(analyticsWindow.__safelocAnalytics ?? []),
            { name, data },
          ];
        },
      };
    });

    await page.goto("/#home");
    await page.getByTestId("company-card-microsoft").click();
    await page.getByTestId("company-project-open-project-kilby").click();

    const events = await page.evaluate(() => {
      const analyticsWindow = window as typeof window & {
        __safelocAnalytics?: Array<{ name: string; data?: Record<string, string | number | boolean> }>;
      };
      return analyticsWindow.__safelocAnalytics ?? [];
    });
    expect(events).toEqual([
      {
        name: "company_lens_selected",
        data: { company: "microsoft", entry_point: "home_holdings" },
      },
      {
        name: "project_action_selected",
        data: {
          company: "microsoft",
          project_id: "project-kilby",
          project_kind: "curated",
           action: "research_with_ai",
        },
      },
    ]);
  });

  test("shows the requested connection badge on each company detail selection", async ({ page }) => {
    await page.goto("/#home");
    const expected = [
      ["nvidia", "Supplier Relationship"],
      ["microsoft", "Developer/Operator"],
      ["meta", "Developer/Operator"],
      ["google", "Developer/Operator"],
      ["oracle", "Sourced Indirect Role"],
      ["amazon", "Developer/Operator"],
    ] as const;

    for (const [company, connectionType] of expected) {
      await page.getByTestId(`company-card-${company}`).click();
      await expect(page.getByTestId("company-exposure-view")).toBeVisible();
      const connectionBadges = page.locator("[data-testid^='company-project-connection-']");
      await expect(connectionBadges.first()).toHaveText(connectionType, { timeout: 15_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.getByTestId("button-company-back").click();
    }
  });

  test("places Home analysis actions before context and opens the custom project dialog", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#home");

    await expect(page.getByTestId("button-run-stargate")).toBeVisible();
    await expect(page.getByTestId("button-analyze-another-project")).toBeVisible();
    await expect(page.getByTestId("home-explore-panel")).toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const customDialog = page.getByTestId("custom-project-dialog");
    await expect(customDialog).not.toBeVisible();
    await page.getByTestId("button-analyze-another-project").click();
    await expect(customDialog).toBeVisible();
    await expect(customDialog).toHaveAttribute("role", "dialog");
    await expect(customDialog.getByRole("heading", { name: "Analyze a different project" })).toBeVisible();
    await customDialog.getByTestId("button-close-custom-project").click();
    await expect(customDialog).not.toBeVisible();
  });

  test("keeps the directory on its secondary route and resets to the Oracle Stargate context", async ({ page }) => {
    await page.goto("/#directory");
    await expect(page.getByTestId("compute-atlas-page")).toBeVisible();
    await expect(page.getByTestId("compute-atlas-search")).toBeVisible();
    await page.goto("/#home");
    await page.getByTestId("company-card-oracle").click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    await page.getByTestId("company-project-open-curated-stargate-oracle").click();
    await expect(page).toHaveURL(/#analysis$/);
    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await page.goto("/#analysis");
    await expect(page.getByTestId("market-company")).toHaveText("Oracle");
    await expect(page.getByTestId("market-holding-state-oracle")).toContainText("Source-backed");
  });

  test("opens a directory facility in the shared prefilled research dialog", async ({ page }) => {
    await page.unroute("**/api/directory**");
    await page.route("**/api/directory**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...directoryResponse,
        totalFacilities: 1,
        offset: 0,
        limit: 24,
        hasMore: false,
      }),
    }));
    await page.route("**/api/research-project", (route) => route.fulfill({
      status: 504,
      contentType: "application/json",
      body: JSON.stringify({ error: "Project research timed out." }),
    }));

    await page.goto("/#directory");
    await page.getByTestId("compute-atlas-open-project-rainier-microsoft-wi").click();
    await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
    await expect(page.getByTestId("input-custom-project-name")).toHaveValue("Project Rainier");
    await expect(page.getByTestId("input-custom-project-location")).toHaveValue("Mount Pleasant, Racine County, Wisconsin");
    await expect(page.getByTestId("custom-project-form")).toBeVisible();
  });
});
