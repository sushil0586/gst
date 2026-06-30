import { expect, test } from "../fixtures/app-fixture";
import { LoginPage } from "../pages/login-page";
import { ShellPage } from "../pages/shell-page";

test.describe("Auth flows", () => {
  test("validates login inputs before submit", async ({ page, app }) => {
    const loginPage = new LoginPage(page);

    await app.mockLoggedOutShell();
    await loginPage.goto();
    await loginPage.expectVisible();

    await loginPage.signIn("bad-email", "123");

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
  });

  test("signs in and signs out like a real user", async ({ page, app }) => {
    const loginPage = new LoginPage(page);
    const shell = new ShellPage(page);

    await app.mockAuthFlows();
    await app.mockAuthenticatedShell({ skipSessionRoute: true });
    await app.mockDashboardApis();

    await loginPage.goto();
    await loginPage.signIn("owner@example.com", "owner-pass-123");

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("main").getByRole("heading", {
        name: /Welcome to GST Compliance Workspace/i,
      }),
    ).toBeVisible();
    await expect(page.getByText("Signed in successfully.")).toBeVisible();

    await shell.signOut();

    await expect(page).toHaveURL(/\/login$/);
    await loginPage.expectVisible();
  });

  test("keeps the user on login and shows an error when sign-in fails", async ({ page, app }) => {
    const loginPage = new LoginPage(page);

    await app.mockLoggedOutShell();
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid email or password." }),
      });
    });

    await loginPage.goto();
    await loginPage.signIn("owner@example.com", "wrong-pass-123");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await loginPage.expectVisible();
  });

  test("shows change-password API failure and keeps the form available for retry", async ({ page, app }) => {
    await app.mockAuthenticatedShell();

    await page.route("**/api/auth/change-password", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Current password is incorrect." }),
      });
    });

    await page.goto("/settings/change-password");

    await expect(page.getByRole("main").getByRole("heading", { name: "Change password", exact: true })).toBeVisible();
    await page.locator("#current_password").fill("wrong-current-pass");
    await page.locator("#new_password").fill("new-pass-123");
    await page.locator("#confirm_new_password").fill("new-pass-123");
    await page.getByRole("button", { name: "Change password", exact: true }).click();

    await expect(page.getByText("Current password is incorrect.")).toBeVisible();
    await expect(page.locator("#current_password")).toHaveValue("wrong-current-pass");
    await expect(page.locator("#new_password")).toHaveValue("new-pass-123");
  });

  test("supports register, forgot-password, and reset-password happy paths", async ({ page, app }) => {
    const shell = new ShellPage(page);

    await app.mockAuthFlows();
    await app.mockAuthenticatedShell({ skipSessionRoute: true });
    await app.mockDashboardApis();

    await page.goto("/register");
    await page.getByLabel("First name").fill("Owner");
    await page.getByLabel("Last name").fill("Accounts");
    await page.getByLabel("Email").fill("owner@example.com");
    await page.getByLabel("Password").fill("owner-pass-123");
    await page.getByLabel("Organization name").fill("Acme Org");
    await page.getByLabel("Workspace name").fill("Primary Workspace");
    await page.getByLabel("Timezone").fill("Asia/Kolkata");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await shell.signOut();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("owner@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If your account exists, a password reset link has been sent.")).toBeVisible();

    await page.goto("/reset-password?uid=abc123&token=token123");
    await page.locator("#password").fill("brand-new-pass-123");
    await page.locator("#confirm_password").fill("brand-new-pass-123");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
