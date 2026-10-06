import { expect, test, type Page } from "@playwright/test";

async function installOfflineApi(
  page: Page,
  dossierState: "empty" | "unavailable" | "seeded" = "empty",
  showcaseState: "empty" | "unavailable" = "empty",
) {
  let researchRequests = 0;
  let showcaseCatalogRequests = 0;
  let showcaseDetailRequests = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/showcase") {
      showcaseCatalogRequests += 1;
      await route.fulfill(showcaseState === "unavailable"
        ? { status: 503, contentType: "application/json", body: JSON.stringify({ error: "private showcase detail" }) }
        : { status: 200, contentType: "application/json", body: JSON.stringify({ dossiers: [] }) });
      return;
    }
    if (url.pathname.startsWith("/api/showcase/")) {
      showcaseDetailRequests += 1;
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
      return;
    }
    if (url.pathname === "/api/dossiers") {
      if (dossierState === "unavailable") {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "private server detail" }) });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          dossiers: dossierState === "seeded" ? [{
            slug: "stargate-abilene",
            name: "Canonical offline seed — not human approved",
            version: "isolated-fixture",
            coverageState: "partial",
            asOfDate: null,
            canonicalData: { identity: { location: "Offline location", operator: "Offline operator", scope: "fixture" }, evidence: [] },
          }] : [],
        }) });
      }
      return;
    }
    if (url.pathname === "/api/research-project") {
      researchRequests += 1;
      const call = researchRequests;
      await route.fulfill({
        status: call === 1 ? 429 : 503,
        headers: call === 1 ? { "retry-after": "2" } : {},
        contentType: "application/json",
        body: JSON.stringify({
          error: call === 1 ? "provider internal detail" : "database internal detail",
          errorType: call === 1 ? "provider-rate-limit" : "research-admission-unavailable",
        }),
      });
      return;
    }
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "offline test fixture" }) });
  });
  return {
    researchRequests: () => researchRequests,
    showcaseCatalogRequests: () => showcaseCatalogRequests,
    showcaseDetailRequests: () => showcaseDetailRequests,
  };
}

for (const dossierState of ["empty", "unavailable", "seeded"] as const) {
  test(`Home ${dossierState} showcase state starts no research`, async ({ page }, testInfo) => {
    const apiCounts = await installOfflineApi(page, dossierState);
    await page.goto("/#home");
    await expect(page.getByTestId("home-showcase-empty")).toBeVisible();
    await expect(page.getByTestId("home-reviewed-showcase")).toHaveCount(0);
    await expect(page.getByTestId("button-run-stargate")).toHaveCount(0);
    await expect(page.getByTestId("home-dossier-stargate-abilene")).toHaveCount(0);
    expect(apiCounts.showcaseCatalogRequests()).toBe(1);
    expect(apiCounts.showcaseDetailRequests()).toBe(0);
    expect(apiCounts.researchRequests()).toBe(0);
    if (testInfo.project.name.toLowerCase().includes("mobile")) {
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(horizontalOverflow).toBe(false);
    }
  });
}

test("Home handles an unavailable reviewed catalog without falling back to the canonical seed", async ({ page }) => {
  const apiCounts = await installOfflineApi(page, "seeded", "unavailable");
  await page.goto("/#home");
  await expect(page.getByTestId("home-showcase-unavailable")).toBeVisible();
  await expect(page.getByTestId("home-dossier-stargate-abilene")).toHaveCount(0);
  expect(apiCounts.showcaseCatalogRequests()).toBe(1);
  expect(apiCounts.showcaseDetailRequests()).toBe(0);
  expect(apiCounts.researchRequests()).toBe(0);
});

test("busy research exposes a safe manual retry and preserves the original request", async ({ page }) => {
  const apiCounts = await installOfflineApi(page);
  await page.goto("/#home");
  await expect(page.getByTestId("home-showcase-empty")).toBeVisible();
  await page.getByTestId("button-analyze-any-project-beta").click();
  await page.getByTestId("input-custom-project-name").fill("Capacity Test Project");
  await page.getByTestId("input-custom-project-location").fill("Austin, Texas");
  await page.getByTestId("button-submit-custom-project").click();

  await expect(page.getByTestId("custom-research-banner")).toContainText("Provider busy / rate-limited");
  await expect(page.getByTestId("custom-research-banner")).not.toContainText("provider internal detail");
  await expect(page.getByTestId("custom-research-retry")).toBeDisabled();
  await expect(page.getByTestId("research-retry-cooldown")).toBeVisible();
  await page.waitForTimeout(250);
  expect(apiCounts.researchRequests()).toBe(1);

  await expect(page.getByTestId("custom-research-retry")).toBeEnabled({ timeout: 3_000 });
  await page.getByTestId("custom-research-retry").click();
  await expect(page.getByTestId("custom-project-dialog")).toBeVisible();
  await expect(page.getByTestId("input-custom-project-name")).toHaveValue("Capacity Test Project");
  await expect(page.getByTestId("input-custom-project-location")).toHaveValue("Austin, Texas");
  await page.getByTestId("button-submit-custom-project").click();
  await expect(page.getByTestId("custom-research-banner")).toContainText("Provider busy / rate-limited");
  expect(apiCounts.researchRequests()).toBe(2);
});