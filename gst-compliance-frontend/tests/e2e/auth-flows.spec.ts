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
