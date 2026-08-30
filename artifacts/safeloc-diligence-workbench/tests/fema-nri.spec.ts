import { expect, test } from "@playwright/test";

test("renders the Taylor County FEMA profile and route-aware attribution", async ({ page }) => {
  await page.goto("/#brief");

  const profile = page.getByTestId("card-fema-climate-risk");
  await expect(profile).toBeVisible();
  await expect(page.getByTestId("text-fema-county-fips")).toContainText("Taylor County, Texas · FIPS 48441");
  await expect(page.getByTestId("text-fema-overall-rating")).toHaveText("Relatively Moderate");
  await expect(profile).toContainText("Score 83.8");
  await expect(page.getByTestId("list-fema-top-hazards")).toContainText("Hail");
  await expect(page.getByTestId("list-fema-top-hazards")).toContainText("Winter Weather");
  await expect(page.getByTestId("list-fema-top-hazards")).toContainText("Drought");
  await expect(page.getByTestId("text-fema-social-vulnerability")).toHaveText("34.48");
  await expect(page.getByTestId("badge-fema-attribution")).toHaveText("Source: FEMA National Risk Index v1.20, December 2025");
  await expect(page.getByTestId("footer-fema-attribution")).toHaveText("Climate risk data: FEMA National Risk Index v1.20");

  await page.goto("/#materiality");
  await expect(page.getByTestId("footer-fema-attribution")).toHaveCount(0);
});

test("uses FEMA values and citations in the two Taylor County evidence records", async ({ page }) => {
  await page.goto("/#evidence");

  const hazardRow = page.getByTestId("row-evidence-site_hazard_exposure");
  await expect(page.getByTestId("select-classification-site_hazard_exposure")).toHaveValue("Verified Evidence");
  await expect(hazardRow).toContainText("Hail: Very High");
  await expect(hazardRow).toContainText("Winter Weather: Relatively High");
  await hazardRow.locator("summary").click();
  await expect(hazardRow).toContainText("FEMA National Risk Index v1.20, December 2025, FIPS 48441");
  await expect(hazardRow).toContainText("IFLD_RISKR");

  const communityRow = page.getByTestId("row-evidence-community_risk");
  await expect(page.getByTestId("select-classification-community_risk")).toHaveValue("Verified Evidence");
  await communityRow.locator("summary").click();
  await expect(communityRow).toContainText("Social Vulnerability 34.48, Relatively Low");
  await expect(communityRow).toContainText("FIPS 48441");
  await expect(page.getByTestId("footer-fema-attribution")).toHaveText("Climate risk data: FEMA National Risk Index v1.20");
});