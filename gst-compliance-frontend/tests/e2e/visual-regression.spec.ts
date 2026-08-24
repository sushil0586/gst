import { expect, test } from "../fixtures/visual-fixture";

function jsonSuccess(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "success",
      message: "Success",
      data,
    }),
  };
}

function buildImsSessionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "provider-session-1",
    workspace: "workspace-1",
    workspace_name: "Primary Workspace",
    client: "client-1",
    client_name: "Acme Client Private Limited",
    gstin: "gstin-1",
    gstin_value: "27ABCDE1234F1Z5",
    provider: "whitebooks",
    email: "ims-ops@example.com",
    txn: "txn-ims-123",
    status: "session_active",
    otp_request_payload: {},
    auth_token_payload: {},
    session_metadata: {},
    freshness_summary: {
      max_age_minutes: 360,
      verified_at: "2026-06-20T10:00:00Z",
      expires_at: "2026-06-20T16:00:00Z",
      is_stale: false,
      stale_reason: "",
    },
    error_summary: {},
    response_contract_confirmed: true,
    last_requested_at: "2026-06-20T10:00:00Z",
    verified_at: "2026-06-20T10:05:00Z",
    initiated_by: 1,
    initiated_by_name: "Owner Accounts",
    verified_by: 1,
    verified_by_name: "Owner Accounts",
    created_at: "2026-06-20T10:00:00Z",
    updated_at: "2026-06-20T10:05:00Z",
    ...overrides,
  };
}

test.describe("Visual regression", () => {
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

  test("ims workbench remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();

    await page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [buildImsSessionRecord()],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.goto("/ims");
    await expect(page.getByRole("main").getByRole("heading", { name: "IMS", exact: true })).toBeVisible();
    await expect(page.getByText("WhiteBooks auth session", { exact: true })).toBeVisible();
    await expect(page.getByText("IMS actions", { exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("ims-workbench.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("settings landing remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();

    await page.goto("/settings");
    await expect(page.getByRole("main").getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByText("Administration hub", { exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("settings-landing.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("team management remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockWorkspaceMembersApis();

    await page.goto("/settings/team");
    await expect(page.getByRole("main").getByRole("heading", { name: "Team Management", exact: true })).toBeVisible();
    await expect(page.getByText("Recommended workspace role usage", { exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("team-management.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("notices create dialog remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();
    await app.mockNoticesApis();

    await page.goto("/notices");
    await expect(page.getByRole("main").getByRole("heading", { name: "Notices", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add Notice", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create notice" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Reference number")).toBeVisible();

    await expect(dialog).toHaveScreenshot("notices-create-dialog.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("audit trail remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockAuditApis();

    await page.goto("/audit-trail");
    await expect(page.getByRole("main").getByRole("heading", { name: "Audit Trail", exact: true })).toBeVisible();
    await expect(page.getByText("Audit log stream", { exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("audit-trail.png", {
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

  test("reports remediation ownership remains visually stable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();
    await app.mockWorkspaceMembersApis();

    await page.goto("/reports");
    await expect(page.getByRole("main").getByRole("heading", { name: "Transaction Review", exact: true })).toBeVisible();

    const ownershipHeading = page.getByText("Remediation ownership", { exact: true });
    await ownershipHeading.scrollIntoViewIfNeeded();
    await expect(ownershipHeading).toBeVisible();
    await expect(page.getByText("Preparing remediation ownership...")).toHaveCount(0);

    await expect(page.getByText("Needs attention", { exact: true })).toBeVisible();
    await expect(page.getByText("Follow-up queue", { exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("reports-remediation-ownership.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("dashboard mobile layout remains visually stable", async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.mockAuthenticatedShell();
    await app.mockDashboardApis();

    await page.goto("/dashboard");
    await expect(page.getByRole("main").getByRole("heading", { name: /Welcome to GST Compliance Workspace/i })).toBeVisible();
    await expect(page.getByText("Quick Actions", { exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("dashboard-mobile.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("reports mobile layout remains visually stable", async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();

    await page.goto("/reports");
    await expect(page.getByRole("main").getByRole("heading", { name: "Transaction Review", exact: true })).toBeVisible();
    await expect(page.getByText("Review filters", { exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("reports-mobile.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("ims mobile layout remains visually stable", async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();

    await page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [buildImsSessionRecord()],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.goto("/ims");
    await expect(page.getByRole("main").getByRole("heading", { name: "IMS", exact: true })).toBeVisible();
    await expect(page.getByText("Live context & access", { exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("ims-mobile.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("team management tablet layout remains visually stable", async ({ page, app }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await app.mockAuthenticatedShell();
    await app.mockWorkspaceMembersApis();

    await page.goto("/settings/team");
    await expect(page.getByRole("main").getByRole("heading", { name: "Team Management", exact: true })).toBeVisible();
    await expect(page.getByText("Recommended workspace role usage", { exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("team-management-tablet.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("reports tablet layout remains visually stable", async ({ page, app }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();

    await page.goto("/reports");
    await expect(page.getByRole("main").getByRole("heading", { name: "Transaction Review", exact: true })).toBeVisible();
    await expect(page.getByText("Review filters", { exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("reports-tablet.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("ims tablet layout remains visually stable", async ({ page, app }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();

    await page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [buildImsSessionRecord()],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.goto("/ims");
    await expect(page.getByRole("main").getByRole("heading", { name: "IMS", exact: true })).toBeVisible();
    await expect(page.getByText("Live context & access", { exact: true })).toBeVisible();

    await expect(page.getByRole("main")).toHaveScreenshot("ims-tablet.png", {
      animations: "disabled",
      caret: "hide",
    });
  });
});
