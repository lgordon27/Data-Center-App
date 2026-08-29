import { expect, test } from "@playwright/test";

const routes = [
  ["brief", "Case Brief"],
  ["evidence", "Evidence Room"],
  ["materiality", "Financial Materiality"],
  ["decision", "Decision Review"],
  ["advisor", "Advisor Lens"],
] as const;

test.describe("hash routing and browser history", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
  });

  test("supports all direct links and normalizes invalid hashes", async ({ page }) => {
    for (const [route, label] of routes) {
      await page.goto(`/#${route}`);
      await expect(page).toHaveURL(new RegExp(`#${route}$`));
      await expect(page.getByTestId(`button-navigate-${route}`)).toHaveAttribute("aria-current", "step");
      await expect(page).toHaveTitle(`SafeLoc · ${label}`);
    }

    await page.goto("/#not-a-screen");
    await expect(page).toHaveURL(/#brief$/);
    await expect(page.getByTestId("button-navigate-brief")).toHaveAttribute("aria-current", "step");
  });

  test("preserves navigation order through back and forward", async ({ page }) => {
    await page.goto("/#brief");
    await page.getByTestId("button-navigate-evidence").click();
    await expect(page).toHaveURL(/#evidence$/);
    await page.getByTestId("button-navigate-materiality").click();
    await expect(page).toHaveURL(/#materiality$/);
    await page.getByTestId("button-navigate-decision").click();
    await expect(page).toHaveURL(/#decision$/);

    await page.goBack();
    await expect(page).toHaveURL(/#materiality$/);
    await expect(page.getByTestId("button-navigate-materiality")).toHaveAttribute("aria-current", "step");
    await page.goBack();
    await expect(page).toHaveURL(/#evidence$/);
    await expect(page.getByTestId("button-navigate-evidence")).toHaveAttribute("aria-current", "step");

    await page.goForward();
    await expect(page).toHaveURL(/#materiality$/);
    await page.goForward();
    await expect(page).toHaveURL(/#decision$/);
    await expect(page.getByTestId("button-navigate-decision")).toHaveAttribute("aria-current", "step");
  });
});