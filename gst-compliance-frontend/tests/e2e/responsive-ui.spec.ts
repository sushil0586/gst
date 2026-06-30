import { expect, test } from "../fixtures/app-fixture";

test.describe("Responsive UI", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps the login screen usable on mobile width", async ({ page, app }) => {
    await app.mockLoggedOutShell();

    await page.goto("/login");
    await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("keeps the import workspace readable on mobile width", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockImportsApis();

    await page.goto("/imports");
    await expect(page.getByRole("heading", { name: "Import Center" })).toBeVisible();
    await expect(page.getByText("Upload source file", { exact: true })).toBeVisible();
    await expect(page.getByText("Monthly import readiness")).toBeVisible();
  });

  test("keeps the dashboard readable on mobile width", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockDashboardApis();

    await page.goto("/dashboard");
    await expect(page.getByRole("main").getByRole("heading", { name: /Welcome to GST Compliance Workspace/i })).toBeVisible();
    await expect(page.getByText("Quick Actions", { exact: true })).toBeVisible();
    await expect(page.getByText("What needs attention now", { exact: true })).toBeVisible();
  });

  test("opens mobile navigation and routes into another workspace screen", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockDashboardApis();
    await app.mockReportsWorkflowApis();

    await page.goto("/dashboard");

    await page.getByTestId("mobile-nav-trigger").click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.getByRole("navigation").getByRole("link", { name: "Reports", exact: true }).click();

    await expect(page.getByRole("main").getByRole("heading", { name: "Transaction Review", exact: true })).toBeVisible();
  });

  test("keeps operations drill-downs and requeue dialog usable on mobile width", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockOperationsWorkflowApis();

    await page.goto("/operations");

    const retryRow = page.getByRole("row").filter({ hasText: "Acme Client Private Limited • GSTR3B" });
    await retryRow.getByRole("button").first().click();

    await expect(page.getByText("Operator status summary")).toBeVisible();
    await expect(page.getByText("Operational alerts")).toBeVisible();

    await retryRow.getByRole("button", { name: "Requeue", exact: true }).click();
    const requeueDialog = page.getByRole("dialog", { name: "Requeue after review" });
    await expect(requeueDialog).toBeVisible();
    await expect(
      requeueDialog.getByPlaceholder("Summarize the filing review, decision, and why this filing is being requeued..."),
    ).toBeVisible();
    await expect(requeueDialog.getByRole("button", { name: "Confirm requeue", exact: true })).toBeVisible();
  });

  test("keeps the return-status follow-up modal usable on mobile width", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnStatusReportApis();

    await page.goto("/reports/return-status");

    const blockedRow = page.getByRole("row", { name: /Need signed approval on draft numbers/ });
    await blockedRow.getByRole("button", { name: "Create follow-up" }).click();

    const followUpDialog = page.getByRole("dialog", { name: "Create follow-up from return row" });
    await expect(followUpDialog).toBeVisible();
    await expect(followUpDialog.getByLabel("Title")).toBeVisible();
    await expect(followUpDialog.getByLabel("Reason")).toBeVisible();
    await expect(followUpDialog.getByLabel("Due time")).toBeVisible();
    await expect(followUpDialog.getByRole("button", { name: "Create follow-up" })).toBeVisible();
  });

  test("keeps the GSTR-1 review tabs usable on mobile width", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr1-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr1");

    await expect(page.getByRole("main").getByRole("heading", { name: "GSTR-1 Review", exact: true })).toBeVisible();
    await expect(page.getByText("Review posture", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "HSN & Documents", exact: true }).click();
    await expect(page.getByText("HSN summary", { exact: true })).toBeVisible();
    await expect(page.getByText("Documents issued", { exact: true })).toBeVisible();
  });

  test("keeps the GSTR-3B review exception workflow usable on mobile width", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr3b-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr3b");

    await expect(page.getByRole("main").getByRole("heading", { name: "GSTR-3B Review", exact: true })).toBeVisible();
    await expect(page.getByText("Review posture", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Exceptions", exact: true }).click();
    await expect(page.getByText("Period exceptions and context risks", { exact: true })).toBeVisible();
    await expect(page.getByText("Exception-focused warnings", { exact: true })).toBeVisible();
  });

  test("keeps annual review prompts understandable on mobile width when context is incomplete", async ({ page, app }) => {
    await app.mockAuthenticatedShell({ noContext: true });
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr9-review");

    await expect(page.getByText("Choose a full workspace context")).toBeVisible();
    await expect(page.getByText("Select workspace, client, GSTIN, and period before reviewing a GSTR-9 draft.")).toBeVisible();
  });
});
