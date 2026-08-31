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
};

    const viewportLayout = await page.evaluate(() => {
      const actions = document.querySelector<HTMLElement>("[data-testid='home-primary-actions']");
      return {
        bodyWidth: document.body.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        actionPositions: actions
          ? Array.from(actions.querySelectorAll<HTMLElement>("button")).map((button) => button.getBoundingClientRect().top)
          : [],
      };
    });
    const directoryRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/directory")) directoryRequests.push(request.url());
    });
    await page.goto("/#home");
    await expect(page.getByTestId("home-stock-picker")).toBeVisible();
    await page.getByTestId("company-card-microsoft").click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    expect(directoryRequests).toHaveLength(0);
    await page.goto("/#directory");
    await expect(page.getByTestId("compute-atlas-page")).toBeVisible();
    await expect.poll(() => directoryRequests.length).toBeGreaterThan(0);
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
    await expect(page.getByTestId("company-summary-tier1")).toContainText("1");
    await expect(page.getByTestId("company-summary-tier2")).toContainText("1");
    await page.getByTestId("company-project-open-project-kilby").click();
    await expect(page).toHaveURL(/#brief$/);
    await expect(page.getByTestId("workbench-breadcrumb")).toContainText("Microsoft → Project Kilby → Case Brief");
    await page.goto("/#advisor");
    await expect(page.getByTestId("advisor-originating-company")).toContainText("Microsoft");
    await expect(page.getByTestId("text-advisor-summary")).toContainText("values-aligned funds");
  });

  test("shows the requested connection badge on each company detail selection", async ({ page }) => {
    await page.goto("/#home");
    const expected = [
      ["nvidia", "Supplier Relationship"],
      ["microsoft", "Developer/Operator"],
      ["meta", "Developer/Operator"],
      ["google", "Developer/Operator"],
      ["oracle", "Direct Contractual"],
      ["amazon", "Developer/Operator"],
    ] as const;

    for (const [company, connectionType] of expected) {
      await page.getByTestId(`company-card-${company}`).click();
      await expect(page.getByTestId("company-exposure-view")).toBeVisible();
      await expect(page.locator("[data-testid^='company-project-connection-']").first()).toHaveText(connectionType);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.getByTestId("button-company-back").click();
    }
  });

  test("keeps the directory on its secondary route and clears company context on reset", async ({ page }) => {
    await page.goto("/#directory");
    await expect(page.getByTestId("compute-atlas-page")).toBeVisible();
    await expect(page.getByTestId("compute-atlas-search")).toBeVisible();
    await page.goto("/#home");
    await page.getByTestId("company-card-oracle").click();
    await expect(page.getByTestId("company-exposure-view")).toBeVisible();
    await page.getByTestId("button-analyze-stargate").click();
    await expect(page).toHaveURL(/#brief$/);
    await page.getByTestId("button-reset-default").click();
    await page.getByTestId("button-confirm-reset-default").click();
    await page.goto("/#advisor");
    await expect(page.getByTestId("advisor-originating-company")).toContainText("No company selected");
  });
});

    const customDialog = page.getByTestId("custom-project-dialog");

    const order = await page.evaluate(() => {
      const actions = document.querySelector("[data-testid='home-primary-actions']");
      const bifurcation = document.querySelector("[data-testid='home-bifurcation']");
      const holdings = document.querySelector("[data-testid='home-stock-picker']");
      if (!actions || !bifurcation || !holdings) return null;
      return {
        actionsBeforeBifurcation: Boolean(actions.compareDocumentPosition(bifurcation) & Node.DOCUMENT_POSITION_FOLLOWING),
        bifurcationBeforeHoldings: Boolean(bifurcation.compareDocumentPosition(holdings) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    });
