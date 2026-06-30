import { expect, test } from "@playwright/test";

import { getLiveCredentials } from "../fixtures/live-env";
import { LoginPage } from "../pages/login-page";

const live = getLiveCredentials();

test.describe("Live smoke", () => {
  test.skip(!live, "Set PLAYWRIGHT_BASE_URL, PLAYWRIGHT_LIVE_EMAIL, and PLAYWRIGHT_LIVE_PASSWORD to run live smoke tests.");

  test("signs in, loads the main workspace, refreshes cleanly, and signs out", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.expectVisible();
    await loginPage.signIn(live!.email, live!.password);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("main").getByRole("heading", { name: /Welcome to GST Compliance Workspace/i })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Imports", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Returns", exact: true })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("main").getByRole("heading", { name: /Welcome to GST Compliance Workspace/i })).toBeVisible();

    await page.getByRole("button", { name: new RegExp(live!.email.split("@")[0], "i") }).or(page.getByRole("button", { name: /admin|owner/i })).first().click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await loginPage.expectVisible();
  });

  test("keeps auth and navigation usable on mobile width", async ({ browser }) => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.expectVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create a new workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Forgot your password?" })).toBeVisible();

    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("button", { name: "Context" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open reports", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open operations", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open operations workspace", exact: true })).toBeVisible();

    await page.close();
  });
});
