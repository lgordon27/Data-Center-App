import { expect, test } from "@playwright/test";

test.describe("Advisor Lens material gaps", () => {
  test("shows active material gaps, updates after reclassification, and opens the matching record", async ({ page }) => {
    await page.goto("/#advisor");

    const gaps = page.getByTestId("advisor-material-gaps");
    await expect(gaps).toBeVisible();
    await expect(page.getByTestId("advisor-material-gaps-count")).toHaveText("2 gaps");
    await expect(page.getByTestId("advisor-material-gap-water_rights")).toContainText("Local Water Rights & Allocation");
    await expect(page.getByTestId("advisor-material-gap-water_rights")).toContainText("Missing");
    await expect(page.getByTestId("advisor-material-gap-water_source_resilience")).toContainText("Water Source Resilience");
    await expect(page.getByTestId("advisor-material-gap-water_source_resilience")).toContainText("Inference");

    await page.getByTestId("button-open-material-gap-water_rights").click();
    await expect(page).toHaveURL(/#evidence$/);
    await expect(page.getByTestId("row-evidence-water_rights")).toBeFocused();

    await page.getByTestId("select-classification-water_rights").selectOption("Verified Evidence");
    await page.goto("/#advisor");

    await expect(page.getByTestId("advisor-material-gaps-count")).toHaveText("1 gap");
    await expect(page.getByTestId("advisor-material-gap-water_rights")).not.toBeVisible();
    await expect(page.getByTestId("advisor-material-gap-water_source_resilience")).toBeVisible();
  });
});