import { expect, test } from "@playwright/test";

import { getLiveCredentials } from "../fixtures/live-env";
import { LoginPage } from "../pages/login-page";

const live = getLiveCredentials();

test.describe("Live settings and access", () => {
  test.skip(!live, "Set PLAYWRIGHT_BASE_URL, PLAYWRIGHT_LIVE_EMAIL, and PLAYWRIGHT_LIVE_PASSWORD to run live settings tests.");

  test("navigates core settings surfaces and opens the team member dialog", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/settings");
    await expect(page.getByRole("main").getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open team", exact: true })).toHaveAttribute("href", "/settings/team");
    await expect(page.getByRole("link", { name: "Open workspaces", exact: true })).toHaveAttribute("href", "/settings/workspaces");
    await expect(page.getByRole("link", { name: "Change password", exact: true })).toHaveAttribute("href", "/settings/change-password");

    await page.goto("/settings/team");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Team Management", exact: true })).toBeVisible();
    await expect(main.getByRole("cell", { name: "demo_admin@example.com", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add Member", exact: true }).click();

    const memberDialog = page.getByRole("dialog", { name: "Add workspace member" });
    await expect(memberDialog).toBeVisible();
    await expect(memberDialog).toContainText("Role");
    await expect(memberDialog).toContainText("Filer");
    await expect(memberDialog).toContainText("Initial password");
    await memberDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(memberDialog).not.toBeVisible();
  });

  test("shows change-password validation and workspace management context without mutating data", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/settings/change-password");
    await expect(page.getByRole("main").getByRole("heading", { name: "Change password", exact: true })).toBeVisible();
    await page.locator("#current_password").fill("demo12345");
    await page.locator("#new_password").fill("new-pass-123");
    await page.locator("#confirm_new_password").fill("different-pass-123");
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page.getByText("Passwords do not match.", { exact: true })).toBeVisible();

    await page.goto("/settings/workspaces");
    await expect(page.getByRole("main").getByRole("heading", { name: "Workspace Management", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByText("Demo Workspace", { exact: true })).toBeVisible();
    await expect(page.getByText("Create workspace", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Organization", { exact: true }).first()).toBeVisible();
  });
});
