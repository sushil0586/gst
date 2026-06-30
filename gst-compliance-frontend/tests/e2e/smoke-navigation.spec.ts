import { expect, test } from "../fixtures/app-fixture";
test.describe("Smoke navigation", () => {
  test("loads the main workspace screens from an authenticated session", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockDashboardApis();
    await app.mockImportsApis();
    await app.mockReconciliationApis();
    await app.mockReturnsApis();
    await app.mockApprovalsApis();

    await page.goto("/dashboard");
    await expect(
      page.getByRole("main").getByRole("heading", {
        name: /Welcome to GST Compliance Workspace/i,
      }),
    ).toBeVisible();
    await expect(page.getByText("Quick Actions")).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Imports", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Returns", exact: true })).toBeVisible();

    await page.goto("/imports");
    await expect(page.getByRole("main").getByRole("heading", { name: "Import Center", exact: true })).toBeVisible();

    await page.goto("/reconciliation");
    await expect(page.getByRole("main").getByRole("heading", { name: "2B Reconciliation", exact: true })).toBeVisible();

    await page.goto("/returns");
    await expect(page.getByRole("main").getByRole("heading", { name: "Returns", exact: true })).toBeVisible();

    await page.goto("/approvals");
    await expect(page.getByRole("main").getByRole("heading", { name: "Approvals", exact: true })).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByRole("main").getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  });
});
