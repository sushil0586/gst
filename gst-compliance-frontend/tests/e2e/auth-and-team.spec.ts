import { expect, test } from "@playwright/test";

const sessionPayload = {
  full_name: "Owner Accounts",
  user: {
    id: 1,
    username: "owner-accounts",
    email: "owner@example.com",
    first_name: "Owner",
    last_name: "Accounts",
    full_name: "Owner Accounts",
  },
  organizations: [
    {
      id: "org-1",
      name: "Acme Org",
      code: "ACME-ORG",
    },
  ],
  workspaces: [
    {
      id: "workspace-1",
      name: "Primary Workspace",
      code: "PRIMARY",
      timezone: "Asia/Kolkata",
      organization_id: "org-1",
      organization_name: "Acme Org",
      role: "owner",
      permissions: ["manage_users", "view_client"],
    },
  ],
  default_workspace: {
    id: "workspace-1",
    name: "Primary Workspace",
    code: "PRIMARY",
    timezone: "Asia/Kolkata",
    organization_id: "org-1",
    organization_name: "Acme Org",
    role: "owner",
    permissions: ["manage_users", "view_client"],
  },
  is_platform_admin: false,
  permissions_summary: {
    codes: ["manage_users", "view_client"],
    total: 2,
    memberships: [
      {
        workspace_id: "workspace-1",
        workspace_name: "Primary Workspace",
        organization_id: "org-1",
        organization_name: "Acme Org",
        role: "owner",
        permissions: ["manage_users", "view_client"],
      },
    ],
  },
};

function successResponse(data: unknown) {
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

function paginatedResponse(data: unknown[], count = data.length) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "success",
      message: "Success",
      data,
      pagination: {
        count,
        next: null,
        previous: null,
        page: 1,
        page_size: 50,
      },
    }),
  };
}

function createImportBatchRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "batch-1",
    workspace: "workspace-1",
    workspace_name: "Primary Workspace",
    client: "client-1",
    client_name: "Acme Client Private Limited",
    gstin: "gstin-1",
    gstin_value: "27ABCDE1234F1Z5",
    import_template: null,
    import_template_name: null,
    compliance_period: "period-1",
    compliance_period_label: "2026-05",
    import_type: "purchase",
    source_type: "csv",
    file_name: "purchase_standard.csv",
    source_metadata: {},
    status: "processed",
    total_rows: 24,
    valid_rows: 24,
    invalid_rows: 0,
    processed_rows: 24,
    error_summary: {
      errors: 0,
      warnings: 0,
      by_field: {},
      message: "All rows processed successfully.",
    },
    processed_at: "2026-06-05T10:30:00Z",
    uploaded_by_name: "Owner Accounts",
    transaction_count: 24,
    correction_summary: null,
    superseded_by: null,
    supersedes_batch: null,
    created_at: "2026-06-05T10:25:00Z",
    updated_at: "2026-06-05T10:30:00Z",
    ...overrides,
  };
}

function createReconciliationRunRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "run-1",
    workspace: "workspace-1",
    workspace_name: "Primary Workspace",
    client: "client-1",
    client_name: "Acme Client Private Limited",
    gstin: "gstin-1",
    gstin_value: "27ABCDE1234F1Z5",
    compliance_period: "period-1",
    compliance_period_label: "2026-05",
    run_type: "gstr_2b_purchase",
    status: "completed",
    notes: "",
    matched_count: 24,
    mismatch_count: 0,
    partial_match_count: 0,
    missing_in_books_count: 0,
    missing_in_portal_count: 0,
    duplicate_count: 0,
    total_tax_difference: "0.00",
    total_itc_at_risk: "0.00",
    processed_at: "2026-06-05T11:05:00Z",
    error_summary: {},
    is_stale: false,
    invalidated_at: null,
    invalidated_by: null,
    invalidated_by_name: null,
    invalidation_reason: "",
    created_at: "2026-06-05T11:00:00Z",
    updated_at: "2026-06-05T11:05:00Z",
    ...overrides,
  };
}

function createPreparedReturnRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "return-1",
    workspace: "workspace-1",
    workspace_name: "Primary Workspace",
    client: "client-1",
    client_name: "Acme Client Private Limited",
    gstin: "gstin-1",
    gstin_value: "27ABCDE1234F1Z5",
    compliance_period: "period-1",
    compliance_period_label: "2026-05",
    return_type: "gstr3b",
    status: "draft",
    summary_snapshot: {
      outward_supplies: {
        total_taxable_value: "850000.00",
        total_tax_amount: "153000.00",
      },
      itc_summary: {
        eligible_itc: "72000.00",
        net_tax_payable: "81000.00",
      },
    },
    prepared_by: 1,
    prepared_by_name: "Owner Accounts",
    approved_by: null,
    approved_by_name: null,
    filed_by: null,
    filed_by_name: null,
    filed_at: null,
    arn: "",
    is_blocked_by_stale_reconciliation: false,
    blocking_reason: "",
    created_at: "2026-06-05T11:15:00Z",
    updated_at: "2026-06-05T11:15:00Z",
    ...overrides,
  };
}

async function mockAuthenticatedShell(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: sessionPayload,
      }),
    });
  });

  await page.route("**/api/backend/workspaces/context/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: {
          workspace: {
            id: "workspace-1",
            organization: "org-1",
            name: "Primary Workspace",
            code: "PRIMARY",
            timezone: "Asia/Kolkata",
            is_active: true,
          },
          clients: [
            {
              id: "client-1",
              workspace: "workspace-1",
              legal_name: "Acme Client Private Limited",
              trade_name: "Acme Client",
              client_code: "ACME001",
              pan: "ABCDE1234F",
              email: "ops@acme.example.com",
              is_active: true,
            },
          ],
          gstins: [],
          periods: [],
        },
      }),
    });
  });
}

async function mockScopedWorkspaceShell(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: sessionPayload,
      }),
    });
  });

  await page.route("**/api/backend/workspaces/context/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: {
          workspace: {
            id: "workspace-1",
            organization: "org-1",
            name: "Primary Workspace",
            code: "PRIMARY",
            timezone: "Asia/Kolkata",
            is_active: true,
          },
          clients: [
            {
              id: "client-1",
              workspace: "workspace-1",
              legal_name: "Alpha Client Private Limited",
              trade_name: "Alpha Client",
              client_code: "ALPHA001",
              pan: "ABCDE1234F",
              email: "ops@alpha.example.com",
              is_active: true,
            },
            {
              id: "client-2",
              workspace: "workspace-1",
              legal_name: "Beta Client Private Limited",
              trade_name: "Beta Client",
              client_code: "BETA001",
              pan: "ABCDE5678G",
              email: "ops@beta.example.com",
              is_active: true,
            },
          ],
          gstins: [
            {
              id: "gstin-1",
              client: "client-1",
              gstin: "27ABCDE1234F1Z5",
              registration_type: "regular",
              state_code: "27",
              is_active: true,
            },
            {
              id: "gstin-2",
              client: "client-2",
              gstin: "29ABCDE5678G1Z5",
              registration_type: "regular",
              state_code: "29",
              is_active: true,
            },
          ],
          periods: [
            {
              id: "period-1",
              gstin: "gstin-1",
              gstin_value: "27ABCDE1234F1Z5",
              client_id: "client-1",
              client_name: "Alpha Client Private Limited",
              period: "2026-05",
              return_type: "GSTR-3B",
              status: "open",
              due_date: "2026-06-20",
              is_locked: false,
            },
            {
              id: "period-2",
              gstin: "gstin-2",
              gstin_value: "29ABCDE5678G1Z5",
              client_id: "client-2",
              client_name: "Beta Client Private Limited",
              period: "2026-06",
              return_type: "GSTR-3B",
              status: "open",
              due_date: "2026-07-20",
              is_locked: false,
            },
          ],
        },
      }),
    });
  });
}

async function mockWorkflowShell(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill(successResponse(sessionPayload));
  });

  await page.route("**/api/backend/workspaces/context/**", async (route) => {
    await route.fulfill(successResponse({
      workspace: {
        id: "workspace-1",
        organization: "org-1",
        name: "Primary Workspace",
        code: "PRIMARY",
        timezone: "Asia/Kolkata",
        is_active: true,
      },
      clients: [
        {
          id: "client-1",
          workspace: "workspace-1",
          legal_name: "Acme Client Private Limited",
          trade_name: "Acme Client",
          client_code: "ACME001",
          pan: "ABCDE1234F",
          email: "ops@acme.example.com",
          is_active: true,
        },
      ],
      gstins: [
        {
          id: "gstin-1",
          client: "client-1",
          gstin: "27ABCDE1234F1Z5",
          registration_type: "regular",
          state_code: "27",
          is_active: true,
        },
      ],
      periods: [
        {
          id: "period-1",
          gstin: "gstin-1",
          gstin_value: "27ABCDE1234F1Z5",
          client_id: "client-1",
          client_name: "Acme Client Private Limited",
          period: "2026-05",
          return_type: "GSTR-3B",
          status: "open",
          due_date: "2026-06-20",
          is_locked: false,
        },
      ],
    }));
  });
}

async function mockMonthlyWorkflowApis(page: import("@playwright/test").Page) {
  let importBatches: Array<Record<string, unknown>> = [createImportBatchRecord()];
  let reconciliationRuns: Array<Record<string, unknown>> = [createReconciliationRunRecord()];
  let preparedReturns: Array<Record<string, unknown>> = [];
  let purchaseTransactionsCount = 24;
  let gstr2bTransactionsCount = 0;
  const salesTransactionsCount = 18;
  let fetch2bSeen = false;
  let prepareReturnSeen = false;

  await page.route("**/api/backend/import-templates/**", async (route) => {
    await route.fulfill(paginatedResponse([]));
  });

  await page.route("**/api/backend/imports/batches/fetch-gstr2b/", async (route) => {
    fetch2bSeen = true;
    gstr2bTransactionsCount = 18;
    const batch = createImportBatchRecord({
      id: "batch-2",
      import_type: "gstr_2b",
      source_type: "provider",
      file_name: "gstr_2b_fetched.json",
      total_rows: 18,
      valid_rows: 18,
      processed_rows: 18,
      transaction_count: 18,
    });
    importBatches = [batch, ...importBatches];
    await route.fulfill(successResponse(batch));
  });

  await page.route("**/api/backend/imports/batches/", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill(paginatedResponse(importBatches));
      return;
    }

    purchaseTransactionsCount = 24;
    const batch = createImportBatchRecord();
    importBatches = [batch, ...importBatches];
    await route.fulfill(successResponse(batch));
  });

  await page.route("**/api/backend/imports/batches/*/errors/", async (route) => {
    await route.fulfill(paginatedResponse([]));
  });

  await page.route("**/api/backend/imports/batches/*/correction-policy/", async (route) => {
    await route.fulfill(successResponse({
      lifecycle_state: "processed",
      can_edit_rows: true,
      can_discard_rows: true,
      can_discard_batch: true,
      can_replace_file: true,
      can_reprocess: true,
      has_downstream_dependencies: false,
      requires_reconciliation_rerun: false,
      requires_return_refresh: false,
      is_locked_by_filing: false,
      requires_elevated_role: false,
      warning_message: "",
      next_required_action: "",
      affected_reconciliation_runs: 0,
      affected_return_preparations: 0,
      affected_filings: 0,
      invalidation_reason: "",
    }));
  });

  await page.route("**/api/backend/imports/batches/*/impact-summary/", async (route) => {
    await route.fulfill(successResponse({
      summary_title: "No downstream impact",
      summary_message: "This batch is ready for downstream workflow.",
      severity: "success",
      next_required_action: "",
      invalidation_reason: "",
      lifecycle_state: "processed",
      actions: [],
      affected_reconciliation_runs: 0,
      affected_return_preparations: 0,
      affected_filings: 0,
    }));
  });

  await page.route("**/api/backend/imports/batches/*", async (route) => {
    const batchId = route.request().url().split("/imports/batches/")[1]?.replace(/\/$/, "");
    const batch = importBatches.find((entry) => entry.id === batchId) ?? createImportBatchRecord();
    await route.fulfill(successResponse(batch));
  });

  await page.route("**/api/backend/gst-transactions/**", async (route) => {
    const url = new URL(route.request().url());
    const transactionType = url.searchParams.get("transaction_type");
    const count =
      transactionType === "purchase"
        ? purchaseTransactionsCount
        : transactionType === "gstr_2b"
          ? gstr2bTransactionsCount
          : transactionType === "sales"
            ? salesTransactionsCount
            : 0;
    const items = Array.from({ length: count }, (_, index) => ({
              id: `txn-${transactionType ?? "unknown"}-${index + 1}`,
              workspace: "workspace-1",
              client: "client-1",
              client_name: "Acme Client Private Limited",
              gstin: "gstin-1",
              gstin_value: "27ABCDE1234F1Z5",
              compliance_period: "period-1",
              compliance_period_label: "2026-05",
              transaction_type: transactionType ?? "purchase",
              document_type: "invoice",
              document_number: `INV-${index + 1}`,
              document_date: "2026-05-05",
              counterparty_gstin: "29ABCDE1234F1Z5",
              counterparty_name: "Vendor One",
              taxable_value: "1000.00",
              cgst_amount: "90.00",
              sgst_amount: "90.00",
              igst_amount: "0.00",
              cess_amount: "0.00",
              total_amount: "1180.00",
              place_of_supply: "27",
              reverse_charge: false,
              source_import_batch: importBatches[0]?.id ?? null,
              status: "processed",
              line_items: [],
              created_at: "2026-06-05T10:25:00Z",
              updated_at: "2026-06-05T10:25:00Z",
            }));

    await route.fulfill(paginatedResponse(items, count));
  });

  await page.route("**/api/backend/reconciliation/runs/", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill(paginatedResponse(reconciliationRuns));
      return;
    }

    const payload = route.request().postDataJSON() as Record<string, string>;
    expect(payload.compliance_period).toBe("period-1");
    const run = createReconciliationRunRecord();
    reconciliationRuns = [run];
    await route.fulfill(successResponse(run));
  });

  await page.route("**/api/backend/reconciliation/runs/*/items/**", async (route) => {
    await route.fulfill(paginatedResponse([]));
  });

  await page.route("**/api/backend/reconciliation/runs/*", async (route) => {
    await route.fulfill(successResponse(reconciliationRuns[0] ?? createReconciliationRunRecord()));
  });

  await page.route("**/api/backend/returns/readiness/**", async (route) => {
    const activePreparedReturn =
      preparedReturns.find((entry) => entry.return_type === "gstr3b") ?? null;
    await route.fulfill(successResponse({
      context: {
        workspace: "workspace-1",
        workspace_name: "Primary Workspace",
        client: "client-1",
        client_name: "Acme Client Private Limited",
        gstin: "gstin-1",
        gstin_value: "27ABCDE1234F1Z5",
        compliance_period: "period-1",
        period_label: "2026-05",
        is_locked: false,
      },
      gstr1: {
        return_type: "gstr1",
        status: "ready",
        can_prepare: true,
        can_export: true,
        warning_count: 0,
        error_count: 0,
        issues: [],
        prepared_return: null,
        metrics: {},
      },
      gstr3b: {
        return_type: "gstr3b",
        status: "ready",
        can_prepare: true,
        can_export: true,
        warning_count: 0,
        error_count: 0,
        issues: [],
        prepared_return: activePreparedReturn
          ? {
              id: String(activePreparedReturn.id),
              status: "draft",
              updated_at: String(activePreparedReturn.updated_at),
            }
          : null,
        metrics: {},
      },
      overall_status: "ready",
    }));
  });

  await page.route("**/api/backend/returns/prepare/", async (route) => {
    prepareReturnSeen = true;
    const payload = route.request().postDataJSON() as Record<string, string>;
    expect(payload.return_type).toBe("gstr3b");
    const preparedReturn = createPreparedReturnRecord();
    preparedReturns = [preparedReturn];
    await route.fulfill(successResponse(preparedReturn));
  });

  await page.route("**/api/backend/returns/", async (route) => {
    await route.fulfill(paginatedResponse(preparedReturns));
  });

  await page.route("**/api/backend/returns/*", async (route) => {
    await route.fulfill(successResponse(preparedReturns[0] ?? createPreparedReturnRecord()));
  });

  await page.route("**/api/backend/approvals/**", async (route) => {
    await route.fulfill(paginatedResponse([]));
  });

  await page.route("**/api/backend/filings/**", async (route) => {
    await route.fulfill(paginatedResponse([]));
  });

  await page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
    await route.fulfill(paginatedResponse([]));
  });

  return {
    assertWorkflowReachedExpectedBackends() {
      expect(fetch2bSeen).toBe(true);
      expect(prepareReturnSeen).toBe(true);
    },
  };
}

test("forgot-password flow submits successfully", async ({ page }) => {
  await page.route("**/api/auth/forgot-password", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "If an account exists for this email, a reset link has been sent." }),
    });
  });

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(page.getByText("Reset access")).toBeVisible();
});

test("reset-password flow submits and redirects to login", async ({ page }) => {
  await page.route("**/api/auth/reset-password", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Password reset successful." }),
    });
  });

  await page.goto("/reset-password?uid=abc123&token=secure-token");
  await page.locator("#password").fill("brand-new-pass-123");
  await page.locator("#confirm_password").fill("brand-new-pass-123");
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page).toHaveURL(/\/login$/);
});

test("team-management page loads workspace members and management actions", async ({ page }) => {
  await mockAuthenticatedShell(page);
  await page.route("**/api/backend/workspace-members/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: [
          {
            id: "membership-1",
            workspace_id: "workspace-1",
            workspace_name: "Primary Workspace",
            user_id: 21,
            username: "filer.user",
            email: "filer@example.com",
            first_name: "Filer",
            last_name: "User",
            full_name: "Filer User",
            role: "filer",
            permissions: ["prepare_return"],
            is_active: true,
            created_at: "2026-06-05T10:00:00Z",
            updated_at: "2026-06-05T10:00:00Z",
          },
        ],
        pagination: {
          count: 1,
          next: null,
          previous: null,
          page: 1,
          page_size: 20,
        },
      }),
    });
  });

  await page.goto("/settings/team");
  await expect(page).toHaveURL(/\/settings\/team$/);
  await expect(page.getByRole("main").getByRole("heading", { name: "Team Management" })).toBeVisible();
  await expect(page.getByText("Workspace team")).toBeVisible();
  await expect(page.getByText("filer@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Member" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deactivate" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Filer", exact: true })).toBeVisible();
});

test("login flow signs in and logout returns to login", async ({ page }) => {
  let signedIn = false;

  await page.route("**/api/auth/me", async (route) => {
    if (!signedIn) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not authenticated" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: sessionPayload,
      }),
    });
  });

  await page.route("**/api/auth/login", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, string>;
    expect(payload.email).toBe("owner@example.com");
    expect(payload.password).toBe("owner-pass-123");
    signedIn = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: sessionPayload }),
    });
  });

  await page.route("**/api/auth/logout", async (route) => {
    signedIn = false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route("**/api/backend/workspaces/context/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: {
          workspace: {
            id: "workspace-1",
            organization: "org-1",
            name: "Primary Workspace",
            code: "PRIMARY",
            timezone: "Asia/Kolkata",
            is_active: true,
          },
          clients: [
            {
              id: "client-1",
              workspace: "workspace-1",
              legal_name: "Acme Client Private Limited",
              trade_name: "Acme Client",
              client_code: "ACME001",
              pan: "ABCDE1234F",
              email: "ops@acme.example.com",
              is_active: true,
            },
          ],
          gstins: [],
          periods: [],
        },
      }),
    });
  });

  await page.goto("/login");
  await page.locator("#email").fill("owner@example.com");
  await page.locator("#password").fill("owner-pass-123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("banner").getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: /Owner Accounts owner/i }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Welcome back")).toBeVisible();
});

test("settings page opens the change-password workspace", async ({ page }) => {
  await mockAuthenticatedShell(page);
  await page.goto("/settings");
  await expect(page.getByRole("main").getByRole("heading", { name: "Settings" })).toBeVisible();
  const changePasswordLink = page.getByRole("link", { name: "Open password" });
  await expect(changePasswordLink).toHaveAttribute("href", "/settings/change-password");
  await page.goto("/settings/change-password");
  await expect(page).toHaveURL(/\/settings\/change-password$/);
  await expect(page.getByRole("main").getByRole("heading", { name: "Change password" })).toBeVisible();
  await expect(page.locator("#current_password")).toBeVisible();
  await expect(page.locator("#new_password")).toBeVisible();
  await expect(page.locator("#confirm_new_password")).toBeVisible();
});

test("scoped returns URL hydrates the linked client and period context", async ({ page }) => {
  await mockScopedWorkspaceShell(page);

  await page.route("**/api/backend/client-contacts/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: [],
        pagination: { count: 0, next: null, previous: null, page: 1, page_size: 20 },
      }),
    });
  });

  await page.route("**/api/backend/workspace-members/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: [],
        pagination: { count: 0, next: null, previous: null, page: 1, page_size: 20 },
      }),
    });
  });

  await page.route("**/api/backend/operational-follow-ups/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: [
          {
            id: "follow-1",
            workspace: "workspace-1",
            client: "client-2",
            client_name: "Beta Client Private Limited",
            gstin: "gstin-2",
            gstin_value: "29ABCDE5678G1Z5",
            compliance_period: "period-2",
            period_label: "2026-06",
            return_preparation: null,
            return_filing: null,
            notice: null,
            contact: null,
            contact_name_snapshot: "",
            mobile_number_snapshot: "",
            email_snapshot: "",
            follow_up_type: "data_request",
            reason: "Sales data pending from customer",
            pending_with: "customer",
            status: "open",
            priority: "high",
            title: "Need June sales data",
            notes: "",
            next_action: "Call customer",
            due_at: "2026-06-06T10:00:00Z",
            completed_at: null,
            last_contacted_at: null,
            assigned_to: null,
            completed_by: null,
            escalated_at: null,
            closed_reason: "",
            return_type: "gstr3b",
            is_overdue: false,
            created_at: "2026-06-05T10:00:00Z",
            updated_at: "2026-06-05T10:00:00Z",
          },
        ],
        pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
      }),
    });
  });

  let returnsRequestMatchedScope = false;
  await page.route("**/api/backend/returns/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const url = new URL(route.request().url());
    if (
      url.searchParams.get("client") === "client-2" &&
      url.searchParams.get("gstin") === "gstin-2" &&
      url.searchParams.get("period") === "period-2"
    ) {
      returnsRequestMatchedScope = true;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: [],
        pagination: { count: 0, next: null, previous: null, page: 1, page_size: 20 },
      }),
    });
  });

  await page.route("**/api/backend/reconciliation/runs/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: [],
        pagination: { count: 0, next: null, previous: null, page: 1, page_size: 20 },
      }),
    });
  });

  await page.route("**/api/backend/gst-transactions/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: [],
        pagination: { count: 0, next: null, previous: null, page: 1, page_size: 20 },
      }),
    });
  });

  await page.route("**/api/backend/filings/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: [],
        pagination: { count: 0, next: null, previous: null, page: 1, page_size: 20 },
      }),
    });
  });

  await page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: [],
        pagination: { count: 0, next: null, previous: null, page: 1, page_size: 20 },
      }),
    });
  });

  await page.goto("/returns?workspace=workspace-1&client=client-2&gstin=gstin-2&period=period-2");

  await expect(page).toHaveURL(/\/returns\?/);
  await expect(page.getByRole("main").getByRole("heading", { name: "Returns" })).toBeVisible();
  await expect.poll(() => returnsRequestMatchedScope).toBeTruthy();
});

test("scoped approvals and audit URLs hydrate the linked period context", async ({ page }) => {
  await mockScopedWorkspaceShell(page);

  await page.route("**/api/backend/clients/client-2/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: {
          id: "client-2",
          workspace: "workspace-1",
          legal_name: "Beta Client Private Limited",
          trade_name: "Beta Client",
          client_code: "BETA001",
          pan: "ABCDE5678G",
          email: "ops@beta.example.com",
          is_active: true,
        },
      }),
    });
  });

  await page.route("**/api/backend/compliance-periods/period-2/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: {
          id: "period-2",
          gstin: "gstin-2",
          gstin_value: "29ABCDE5678G1Z5",
          client_id: "client-2",
          client_name: "Beta Client Private Limited",
          period: "2026-06",
          return_type: "GSTR-3B",
          status: "open",
          due_date: "2026-07-20",
          is_locked: false,
        },
      }),
    });
  });

  await page.route("**/api/backend/compliance-periods/period-2/workspace-summary/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: {
          period_details: { period: "2026-06", due_date: "2026-07-20" },
          reconciliation_issue_counts: {
            mismatches: 0,
            partial_matches: 0,
            missing_in_books: 0,
            missing_in_portal: 0,
            duplicates: 0,
          },
          imports_by_type_status: { by_type: { sales: 1, purchase: 1, gstr_2b: 1 } },
          latest_reconciliation_run: null,
          return_preparation_statuses: {
            gstr1: { status: "not_prepared" },
            gstr3b: { status: "not_prepared" },
          },
          approvals: { pending_count: 1, approved_count: 0 },
          lock_state: { is_locked: false },
          next_recommended_action: "Open approvals for review.",
        },
      }),
    });
  });

  let approvalsRequestMatchedScope = false;
  await page.route("**/api/backend/approvals/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const url = new URL(route.request().url());
    if (url.searchParams.get("client") === "client-2" && url.searchParams.get("period") === "period-2") {
      approvalsRequestMatchedScope = true;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: [],
        pagination: { count: 0, next: null, previous: null, page: 1, page_size: 20 },
      }),
    });
  });

  let auditRequestMatchedScope = false;
  await page.route("**/api/backend/audit-logs/**", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.searchParams.get("workspace_id_ref") === "workspace-1" &&
      url.searchParams.get("client_id_ref") === "client-2" &&
      url.searchParams.get("gstin") === "gstin-2" &&
      url.searchParams.get("period") === "period-2"
    ) {
      auditRequestMatchedScope = true;
    }
    if (url.pathname.endsWith("/api/backend/audit-logs/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [],
          pagination: { count: 0, next: null, previous: null, page: 1, page_size: 20 },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Success",
        data: {
          id: "audit-1",
          actor_name: "Owner Accounts",
          action: "period.reviewed",
          entity_type: "compliance_period",
          entity_id: "period-2",
          metadata: {},
          before_state: {},
          after_state: {},
          created_at: "2026-06-05T10:00:00Z",
        },
      }),
    });
  });

  await page.goto("/approvals?workspace=workspace-1&client=client-2&gstin=gstin-2&period=period-2");
  await expect(page).toHaveURL(/\/approvals\?/);
  await expect(page.getByRole("main").getByRole("heading", { name: "Approvals" })).toBeVisible();
  await expect.poll(() => approvalsRequestMatchedScope).toBeTruthy();

  await page.goto("/audit-trail?workspace=workspace-1&client=client-2&gstin=gstin-2&period=period-2");
  await expect(page).toHaveURL(/\/audit-trail\?/);
  await expect(page.getByRole("main").getByRole("heading", { name: "Audit Trail" })).toBeVisible();
  await expect.poll(() => auditRequestMatchedScope).toBeTruthy();
});

test("monthly workflow opens reconciliation, refreshes 2B, and prepares a return", async ({ page }) => {
  await mockWorkflowShell(page);
  const workflow = await mockMonthlyWorkflowApis(page);

  await test.step("open reconciliation in the same monthly context and refresh 2B", async () => {
    await page.goto("/reconciliation");
    await expect(page).toHaveURL(/\/reconciliation$/);
    await expect(page.getByRole("main").getByRole("heading", { name: "2B Reconciliation" })).toBeVisible();

    await page.getByRole("button", { name: "Fetch 2B from filing channel" }).click();
    await expect(page.getByText("Fetched 18 GSTR-2B transaction(s) from the connected filing channel.")).toBeVisible();
  });

  await test.step("prepare the return after reconciliation is complete", async () => {
    await page.goto("/returns");
    await expect(page).toHaveURL(/\/returns$/);
    await expect(page.getByRole("main").getByRole("heading", { name: "Returns" })).toBeVisible();

    await page.getByRole("button", { name: "Prepare GSTR-3B" }).click();
    await expect(page.getByText("GSTR3B draft prepared.")).toBeVisible();
    await expect(page.getByText("GSTR3B").first()).toBeVisible();
  });

  workflow.assertWorkflowReachedExpectedBackends();
});
