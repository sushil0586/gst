import { expect, test } from "../fixtures/app-fixture";

test.describe("Visual regression", () => {
  test.use({ viewport: { width: 1440, height: 1200 } });

  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName !== "chromium", "Visual baselines are maintained on Chromium to reduce cross-browser snapshot noise.");
  });

  test("dashboard live workspace remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockDashboardApis();
    await app.mockReturnsApis();

    await page.goto("/dashboard");
    await expect(page.getByRole("main").getByRole("heading", { name: /Welcome to GST Compliance Workspace/i })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("dashboard-live.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("imports workspace remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockImportsApis();

    await page.goto("/imports");
    await expect(page.getByRole("main").getByRole("heading", { name: "Import Center", exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("imports-workspace.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("reconciliation workspace remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReconciliationApis();

    await page.goto("/reconciliation");
    await expect(page.getByRole("main").getByRole("heading", { name: "2B Reconciliation", exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("reconciliation-workspace.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("returns workspace remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnsApis();

    await page.goto("/returns");
    await expect(page.getByRole("main").getByRole("heading", { name: "Returns", exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("returns-workspace.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("gstr-3b review workspace remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr3b-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1");
    await expect(page.getByRole("main").getByRole("heading", { name: "GSTR-3B Review", exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("gstr3b-review-workspace.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("approvals workspace remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockApprovalsWorkflowApis();

    await page.goto("/approvals");
    await expect(page.getByRole("main").getByRole("heading", { name: "Approvals", exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("approvals-workspace.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("operations workspace remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockOperationsWorkflowApis();

    await page.goto("/operations");
    await expect(page.getByRole("main").getByRole("heading", { name: "Filing Operations", exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("operations-workspace.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("reports transaction review remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();

    await page.goto("/reports");
    await expect(page.getByRole("main").getByRole("heading", { name: "Transaction Review", exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("reports-transaction-review.png", {
      animations: "disabled",
      caret: "hide",
    });
  });
});
