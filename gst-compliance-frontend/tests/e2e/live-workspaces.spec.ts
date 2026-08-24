import { expect, test } from "@playwright/test";

import { getLiveCredentials } from "../fixtures/live-env";
import { LoginPage } from "../pages/login-page";

const live = getLiveCredentials();

test.describe("Live workspaces", () => {
  test.skip(!live, "Set PLAYWRIGHT_BASE_URL, PLAYWRIGHT_LIVE_EMAIL, and PLAYWRIGHT_LIVE_PASSWORD to run live workspace tests.");

  test("shows import empty states and opens import history details", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/imports");
    await expect(page.getByRole("main").getByRole("heading", { name: "Import Center", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload file", exact: true })).toBeDisabled();
    await expect(page.getByText("No templates saved yet", { exact: true })).toBeVisible();

    const sampleLink = page.getByRole("link", { name: "Download sample CSV", exact: true });
    await expect(sampleLink).toHaveAttribute("href", "/sample-files/import-template-sample.csv");

    await page.locator('[data-testid^="import-batch-open-"]:visible').first().click();

    const detailsDialog = page.getByRole("dialog", { name: "Import batch details" });
    await expect(detailsDialog).toBeVisible();
    await expect(detailsDialog.getByText("No row-level issues", { exact: true })).toBeVisible();
    await expect(detailsDialog).toContainText("Status");
    await expect(detailsDialog).toContainText("queued");
  });

  test("explains blocked return preparation and routes the operator toward imports and reconciliation", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/returns");
    await expect(page.getByRole("main").getByRole("heading", { name: "Returns", exact: true })).toBeVisible();
    await expect(page.getByText("Outward transactions are required", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Reconciliation has not been run", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare GSTR-3B", exact: true })).toBeDisabled();
    await expect(page.getByText(/Preparation is currently blocked for at least one return type\./)).toBeVisible();
    await expect(page.getByText("No outward transactions are available to compute GSTR-3B liability.", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Go to reconciliation", exact: true }).click();
    await expect(page).toHaveURL(/\/reconciliation$/);
    await expect(page.getByRole("main").getByRole("heading", { name: "2B Reconciliation", exact: true })).toBeVisible();

    await page.goto("/returns");
    await page.getByRole("link", { name: "Review imports", exact: true }).first().click();
    await expect(page).toHaveURL(/\/imports$/);
    await expect(page.getByRole("main").getByRole("heading", { name: "Import Center", exact: true })).toBeVisible();
  });
});
