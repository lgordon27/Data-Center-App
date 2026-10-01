import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";

type SparseResearchFixture = {
  projectSummary: {
    name: string;
    location: string;
    description: string;
    capacityMW?: number | null;
    [key: string]: unknown;
  };
  evidence: Array<Record<string, unknown>>;
  sourceLedger?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

const fixturePath = new URL("./fixtures/research-project-synthetic.json", import.meta.url);
const sparseFixtureTemplate = JSON.parse(readFileSync(fixturePath, "utf8")) as SparseResearchFixture;
const fictitiousName = "Aster Northstar Campus";
const fictitiousLocation = "Cedar County, Iowa";
const retainedSourceUrl = "https://northstar.example/announcements/phase-one";

function sparseResearchResponse(): SparseResearchFixture {
  const response = structuredClone(sparseFixtureTemplate);
  response.projectSummary.name = fictitiousName;
  response.projectSummary.location = fictitiousLocation;
  response.projectSummary.description = "Fictitious offline test data; no project facts are asserted.";
  response.projectSummary.capacityMW = null;
  response.researchStatus = "partial";
  response.researchMode = "partial-public-source";
  delete response.researchOutcome;
  delete response.researchAudit;
  delete response.researchCoverage;
  delete response.researchCache;

  for (const item of response.evidence) {
    delete item.sourcePublishedAt;
    delete item.sourceAccessedAt;
  }
  for (const ledgerEntry of response.sourceLedger ?? []) {
    delete ledgerEntry.date;
    delete ledgerEntry.dateBasis;
    delete ledgerEntry.publishedAt;
    delete ledgerEntry.accessedAt;
    const accessOutcome = ledgerEntry.accessOutcome;
    if (accessOutcome && typeof accessOutcome === "object") {
      delete (accessOutcome as Record<string, unknown>).retrievalTime;
      delete (accessOutcome as Record<string, unknown>).publicationDate;
      delete (accessOutcome as Record<string, unknown>).publicationDateBasis;
    }
  }
  return response;
}

async function installOfflineApi(
  page: Page,
  {
    onAnalyze,
    onResearch,
  }: {
    onAnalyze?: (route: Route, requestNumber: number) => Promise<void>;
    onResearch?: (route: Route, requestNumber: number) => Promise<void>;
  } = {},
) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  const calls = {
    research: 0,
    analyze: 0,
    otherApi: 0,
  };

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/dossiers" && route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ dossiers: [] }),
      });
      return;
    }
    if (url.pathname === "/api/analyze-evidence") {
      calls.analyze += 1;
      if (onAnalyze) {
        await onAnalyze(route, calls.analyze);
      } else {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Synthetic offline analysis is unavailable." }),
        });
      }
      return;
    }
    if (url.pathname === "/api/research-project" && route.request().method() === "POST") {
      calls.research += 1;
      if (onResearch) {
        await onResearch(route, calls.research);
      } else {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Synthetic offline research is unavailable.", errorType: "upstream" }),
        });
      }
      return;
    }
    calls.otherApi += 1;
    await route.fulfill({
      status: url.pathname === "/api/version" ? 200 : 503,
      contentType: "application/json",
      body: JSON.stringify(
        url.pathname === "/api/version"
          ? { version: "isolated-public-launch-fixture" }
          : { error: "Synthetic offline API fixture; no live service was contacted." },
      ),
    });
  });

  await page.route(
    /https:\/\/(api\.openai\.com|generativelanguage\.googleapis\.com)\//,
    (route) => route.abort("blockedbyclient"),
  );
  return calls;
}

async function openCustomProject(page: Page) {
  await page.goto("/#home");
  const explorePanel = page.getByTestId("home-explore-panel");
  if (await explorePanel.count() && await explorePanel.getAttribute("open") === null) {
    await explorePanel.locator(":scope > summary").click();
  }
  await page.getByTestId("button-analyze-another-project").click();
  await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
  await page.getByTestId("input-custom-project-name").fill(fictitiousName);
  await page.getByTestId("input-custom-project-location").fill(fictitiousLocation);
  await page.getByTestId("button-submit-custom-project").click();
  await expect(page).toHaveURL(/#analysis$/);
  await expect(page.getByTestId("custom-research-banner")).toBeVisible();
}

async function attachDesktopResult(page: Page, testInfo: TestInfo, name: string) {
  if (!testInfo.project.name.toLowerCase().includes("desktop")) return;
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png",
  });
}

for (const capacityState of ["provider-rate-limit", "daily-capacity"] as const) {
  test(`bulk AI analysis stops after the first ${capacityState} rejection`, async ({ page }) => {
    const analyzedItems: string[] = [];
    const calls = await installOfflineApi(page, {
      onAnalyze: async (route, requestNumber) => {
        const request = route.request().postDataJSON() as { name: string };
        analyzedItems.push(request.name);
        if (requestNumber === 1) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              classification: "Missing Evidence",
              reasoning: "Synthetic offline analysis did not establish a project fact.",
              downgradeSuggested: false,
            }),
          });
          return;
        }
        await route.fulfill({
          status: 429,
          headers: capacityState === "provider-rate-limit" ? { "retry-after": "600" } : {},
          contentType: "application/json",
          body: JSON.stringify({
            error: capacityState === "daily-capacity"
              ? "Daily research capacity reached. Please try again tomorrow."
              : "Synthetic private provider detail; never disclose this text.",
          }),
        });
      },
    });

    await page.goto("/#evidence");
    await page.getByTestId("button-analyze-all-ai").click();

    const notice = page.getByTestId("ai-batch-capacity-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(
      capacityState === "daily-capacity"
        ? "Daily AI-evidence capacity is reached."
        : "AI analysis is rate-limited.",
    );
    await expect(notice).toContainText("No further requests were sent.");
    await expect(notice).toContainText("Not analyzed:");
    await expect(notice).not.toContainText("Synthetic private provider detail");
    await expect.poll(() => calls.analyze).toBe(2);
    expect(analyzedItems).toHaveLength(2);
    expect(calls.research).toBe(0);
    await expect(page.getByTestId("button-analyze-all-ai")).toBeDisabled();
    await page.waitForTimeout(200);
    expect(calls.analyze).toBe(2);
    await attachDesktopResult(page, test.info(), `bulk-${capacityState}-result`);
  });
}

test("a failed explicit refresh retains fictitious source evidence and hides raw provider detail", async ({ page }, testInfo) => {
  const researchRequests: Array<Record<string, unknown>> = [];
  const calls = await installOfflineApi(page, {
    onResearch: async (route, requestNumber) => {
      const request = route.request().postDataJSON() as Record<string, unknown>;
      researchRequests.push(request);
      if (requestNumber === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(sparseResearchResponse()),
        });
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "SYNTHETIC PRIVATE DETAIL provider.internal model=offline-only stack=never-render",
          errorType: "upstream",
        }),
      });
    },
  });

  await openCustomProject(page);
  await page.getByTestId("tab-reality").click();
  await page.getByTestId("button-detailed-evidence").click();
  const retained = page.getByTestId("retained-research-findings");
  await expect(retained).toBeVisible();
  await expect(page.getByTestId("link-custom-source-electricity_cost")).toHaveAttribute("href", retainedSourceUrl);
  await expect(retained).toContainText(
    "The Phase One utility interconnection was announced at 180 MW",
  );
  await expect(retained.getByRole("link", { name: "Northstar Infrastructure announcement" })).toHaveAttribute(
    "href",
    retainedSourceUrl,
  );

  await page.getByTestId("button-force-refresh-research").click();
  await expect(page.getByTestId("source-research-status")).toContainText("Research did not return a usable update");
  await expect(page.getByTestId("source-research-status")).not.toContainText("provider.internal");
  await expect(page.getByTestId("source-research-status")).not.toContainText("model=offline-only");
  await expect(page.getByTestId("link-custom-source-electricity_cost")).toHaveAttribute("href", retainedSourceUrl);
  await expect(retained).toBeVisible();
  await expect(retained.getByRole("link", { name: "Northstar Infrastructure announcement" })).toHaveAttribute(
    "href",
    retainedSourceUrl,
  );
  expect(calls.research).toBe(2);
  expect(researchRequests[1]).toMatchObject({ forceRefresh: true });
  expect(calls.analyze).toBe(0);

  if (testInfo.project.name.toLowerCase().includes("mobile")) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
  await attachDesktopResult(page, testInfo, "retained-evidence-after-failed-refresh");
  await page.waitForTimeout(200);
  expect(calls.research).toBe(2);
});

test("sparse older research without optional dates or categories stays navigable and model-neutral", async ({ page }, testInfo) => {
  const calls = await installOfflineApi(page, {
    onResearch: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sparseResearchResponse()),
      });
    },
  });

  await openCustomProject(page);
  await page.getByTestId("tab-reality").click();
  await page.getByTestId("button-detailed-evidence").click();
  await expect(page.getByTestId("research-handoff-status")).toContainText("Search incomplete");
  const retained = page.getByTestId("retained-research-findings");
  await expect(retained).toBeVisible();
  await expect(retained).toContainText("Source publication date: not reported");
  await expect(retained).toContainText("Accessed: not recorded");
  await expect(retained.getByRole("link", { name: "Northstar Infrastructure announcement" })).toHaveAttribute(
    "href",
    retainedSourceUrl,
  );
  await page.getByTestId("research-handoff-details").click();
  await expect(page.getByTestId("research-handoff-summary")).toContainText(
    "Category detail was not recorded for this run. Search completeness is unknown.",
  );

  if (testInfo.project.name.toLowerCase().includes("mobile")) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
  await attachDesktopResult(page, testInfo, "sparse-older-research-result");

  await page.getByTestId("tab-transmission").click();
  await page.getByTestId("button-opt-in-scenario").click();
  await expect(page.getByTestId("custom-project-not-modeled")).toContainText("Not modeled");
  await expect(page.getByTestId("financial-transmission-model")).toHaveCount(0);
  expect(calls.research).toBe(1);
  expect(calls.analyze).toBe(0);
});