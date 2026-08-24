import { expect, test } from "../fixtures/visual-smoke-fixture";

test.describe("Cross-browser visual smoke", () => {
  test.skip(({ browserName }) => browserName === "chromium", "This smoke slice is intended for Firefox and WebKit only.");

  test("login screen remains visually sane", async ({ page, app, browserName }) => {
    await app.mockLoggedOutShell();

    await page.goto("/login");
    await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();

    await expect(page.locator("body")).toHaveScreenshot(`login-smoke-${browserName}.png`, {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("dashboard remains visually sane", async ({ page, app, browserName }) => {
    await app.mockAuthenticatedShell();
    await app.mockDashboardApis();
    await app.mockReturnsApis();

    await page.goto("/dashboard");
    await expect(page.getByRole("main").getByRole("heading", { name: /Welcome to GST Compliance Workspace/i })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot(`dashboard-smoke-${browserName}.png`, {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("imports workspace remains visually sane", async ({ page, app, browserName }) => {
    await app.mockAuthenticatedShell();
    await app.mockImportsApis();

    await page.goto("/imports");
    await expect(page.getByRole("main").getByRole("heading", { name: "Import Center", exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot(`imports-smoke-${browserName}.png`, {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("returns workspace remains visually sane", async ({ page, app, browserName }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnsApis();

    await page.goto("/returns");
    await expect(page.getByRole("main").getByRole("heading", { name: "Returns", exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot(`returns-smoke-${browserName}.png`, {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("reports workspace remains visually sane", async ({ page, app, browserName }) => {
    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();

    await page.goto("/reports");
    await expect(page.getByRole("main").getByRole("heading", { name: "Transaction Review", exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot(`reports-smoke-${browserName}.png`, {
      animations: "disabled",
      caret: "hide",
    });
  });
});
