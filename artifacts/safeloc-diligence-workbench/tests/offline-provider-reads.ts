import type { Page } from "@playwright/test";

/** Install before scenario-specific routes, which override these safe defaults. */
export async function blockUnmockedProviderRequests(page: Page) {
  for (const endpoint of [
    "**/api/eia/**",
    "**/api/ercot-queue**",
    "**/api/directory**",
    "**/api/research-project**",
    "**/api/analyze-evidence**",
  ]) {
    await page.route(endpoint, (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Provider traffic is disabled in this offline fixture." }),
    }));
  }
  await page.route(/https:\/\/(api\.openai\.com|generativelanguage\.googleapis\.com|api\.eia\.gov)\//, (route) => route.abort("blockedbyclient"));
}