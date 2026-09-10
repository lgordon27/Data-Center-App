import { expect, test, type Page } from "@playwright/test";

async function openAnalysisView(page: Page, view: "market" | "reality" | "transmission") {
  await page.goto("/#analysis");
  await page.getByTestId(`tab-${view}`).click();
}

test("renders the Taylor County FEMA profile and route-aware attribution", async ({ page }) => {
  await openAnalysisView(page, "reality");
  await page.getByTestId("button-detailed-evidence").click();
  await expect(page.getByTestId("row-evidence-site_hazard_exposure")).toContainText("FEMA National Risk Index v1.20");
  await expect(page.getByTestId("row-evidence-community_risk")).toContainText("FEMA National Risk Index v1.20");
  await expect(page.getByTestId("footer-fema-attribution")).toHaveText("Climate risk: FEMA National Risk Index v1.20");

  await openAnalysisView(page, "transmission");
  await expect(page.getByTestId("conference-view-transmission")).toBeVisible();
});

test("uses FEMA values and citations in the two Taylor County evidence records", async ({ page }) => {
  await openAnalysisView(page, "reality");
  await page.getByTestId("button-detailed-evidence").click();

  const hazardRow = page.getByTestId("row-evidence-site_hazard_exposure");
  await expect(page.getByTestId("select-classification-site_hazard_exposure")).toHaveValue("Verified Evidence");
  await expect(hazardRow).toContainText("Hail: Very High");
  await expect(hazardRow).toContainText("Winter Weather: Relatively High");
  await hazardRow.locator("summary").first().click();
  await expect(hazardRow).toContainText("FEMA National Risk Index v1.20, December 2025, FIPS 48441");
  await expect(hazardRow).toContainText("IFLD_RISKR");

  const communityRow = page.getByTestId("row-evidence-community_risk");
  await expect(page.getByTestId("select-classification-community_risk")).toHaveValue("Verified Evidence");
  await communityRow.locator("summary").first().click();
  await expect(communityRow).toContainText("Social Vulnerability 34.48, Relatively Low");
  await expect(communityRow).toContainText("FIPS 48441");
  await expect(page.getByTestId("footer-fema-attribution")).toHaveText("Climate risk: FEMA National Risk Index v1.20");
});