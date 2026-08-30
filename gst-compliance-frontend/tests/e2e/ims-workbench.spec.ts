import { expect, test } from "../fixtures/app-fixture";
import { sessionPayload } from "../fixtures/app-data";

function buildSessionRecord(overrides: Record<string, unknown> = {}) {
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

function buildActionBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "ims-batch-existing-1",
    workspace: "workspace-1",
    client: "client-1",
    gstin: "gstin-1",
    auth_session: "provider-session-1",
    provider: "whitebooks",
    action_type: "save",
    ret_period: "052026",
    status: "submitted",
    provider_transaction_id: "ims-int-existing-001",
    request_payload_hash: "hash-existing-001",
    error_message: "",
    requested_by: 1,
    submitted_at: "2026-06-20T10:00:00Z",
    completed_at: "2026-06-20T10:00:00Z",
    created_at: "2026-06-20T10:00:00Z",
    updated_at: "2026-06-20T10:00:00Z",
    ...overrides,
  };
}

test.describe("IMS workbench", () => {
  test("renders the IMS operator workbench and fetches invoice and status drill-down data", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();

    await page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [buildSessionRecord()],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/ims\/action-batches\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(jsonSuccess([buildActionBatch()]));
    });

    await page.route(/\/api\/backend\/ims\/invoices\/?(?:\?.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill(
        jsonSuccess({
          status_cd: "1",
          section: url.searchParams.get("section"),
          provider_status: url.searchParams.get("status"),
          invoices: [
            {
              ctin: "29ABCDE1234F1Z5",
              inv: [
                {
                  inum: "INV-IMS-001",
                  idt: "01-05-2026",
                  val: 1180,
                  status: "PENDING",
                  itms: [{ itm_det: { txval: 1000, iamt: 180, camt: 0, samt: 0, csamt: 0 } }],
                },
              ],
            },
          ],
        }),
      );
    });

    await page.route(/\/api\/backend\/ims\/invoices-count\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(
        jsonSuccess({
          status_cd: "1",
          data: {
            pending_count: 3,
            accepted_count: 2,
            total_count: 5,
          },
        }),
      );
    });

    await page.route(/\/api\/backend\/ims\/status\/?(?:\?.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill(
        jsonSuccess({
          status_cd: "1",
          int_tran_id: url.searchParams.get("int_tran_id"),
          processing_status: "COMPLETED",
        }),
      );
    });

    await page.goto("/ims");

    await expect(page.getByRole("main").getByRole("heading", { name: "IMS", exact: true })).toBeVisible();
    await expect(page.getByText("Manage IMS investigation, provider response checks", { exact: false })).toBeVisible();
    await expect(page.getByText("ims-ops@example.com", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("contract confirmed", { exact: true })).toBeVisible();
    await expect(page.getByText("Recent IMS action batches", { exact: true })).toBeVisible();
    await expect(page.getByText("ims-int-existing-001", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Invoices", exact: true }).click();
    await page.getByRole("button", { name: "Fetch invoices", exact: true }).click();
    await expect(page.getByRole("heading", { name: "IMS", exact: true })).toBeVisible();
    await expect(page.getByText("Provider outcome", { exact: true })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: "PENDING" })).toBeVisible();
    await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Normalized IMS invoice table", { exact: true })).toBeVisible();
    await expect(page.getByText("INV-IMS-001", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("29ABCDE1234F1Z5", { exact: true }).first()).toBeVisible();
    await page.getByText("Debug payload", { exact: true }).click();
    await expect(page.getByText("INV-IMS-001").first()).toBeVisible();

    await page.getByRole("button", { name: "Fetch count", exact: true }).click();
    await expect(page.getByText("Normalized IMS count summary", { exact: true })).toBeVisible();
    await expect(page.getByText("Data Pending Count", { exact: true })).toBeVisible();
    await expect(page.getByText("3", { exact: true }).first()).toBeVisible();

    await page.getByRole("tab", { name: "Status", exact: true }).click();
    await page.getByPlaceholder("ims-int-001").fill("ims-int-789");
    await page.getByRole("button", { name: "Fetch status", exact: true }).click();
    await expect(page.getByText("ims-int-789", { exact: true })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^COMPLETED$/ })).toBeVisible();
  });

  test("keeps draft save and reset disabled for users without filing permission", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();

    await page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [buildSessionRecord()],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/ims\/action-batches\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(jsonSuccess([]));
    });

    await page.goto("/ims");

    await page.getByRole("tab", { name: "Draft save/reset", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save IMS draft", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Reset IMS draft", exact: true })).toBeDisabled();
    await expect(page.getByText("save and reset remain disabled because this role does not have filing permission")).toBeVisible();
  });

  test("lets filing operators retry failed batches and refresh provider status", async ({ page, app }) => {
    const writePermissions = [...sessionPayload.permissions_summary.codes, "file_return"];
    let retryPayload: Record<string, unknown> | null = null;
    let statusPayload: Record<string, unknown> | null = null;
    let actionBatches = [
      buildActionBatch(),
      buildActionBatch({
        id: "ims-batch-failed-1",
        status: "failed",
        provider_transaction_id: "",
        request_payload_hash: "hash-failed-001",
        error_message: "IMS provider timeout.",
        completed_at: "2026-06-20T10:10:00Z",
        created_at: "2026-06-20T10:10:00Z",
        updated_at: "2026-06-20T10:10:00Z",
      }),
    ];

    await app.mockAuthenticatedShell({ customPermissions: writePermissions });
    await app.mockFoundationApis();

    await page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [buildSessionRecord()],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/ims\/action-batches\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(jsonSuccess(actionBatches));
    });

    await page.route(/\/api\/backend\/ims\/action-batches\/ims-batch-existing-1\/status\/?$/, async (route) => {
      statusPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill(
        jsonSuccess({
          status_cd: "1",
          int_tran_id: "ims-int-existing-001",
          processing_status: "COMPLETED",
          action_batch: actionBatches[0],
        }),
      );
    });

    await page.route(/\/api\/backend\/ims\/action-batches\/ims-batch-failed-1\/retry\/?$/, async (route) => {
      retryPayload = route.request().postDataJSON() as Record<string, unknown>;
      const batch = buildActionBatch({
        id: "ims-batch-retry-1",
        provider_transaction_id: "ims-int-retry-001",
        request_payload_hash: "hash-retry-001",
        submitted_at: "2026-06-20T10:30:00Z",
        completed_at: "2026-06-20T10:30:00Z",
        created_at: "2026-06-20T10:30:00Z",
        updated_at: "2026-06-20T10:30:00Z",
      });
      actionBatches = [batch, ...actionBatches];
      await route.fulfill(
        jsonSuccess({
          status_cd: "1",
          message: "retried",
          int_tran_id: "ims-int-retry-001",
          action_batch: batch,
        }),
      );
    });

    await page.goto("/ims");

    await expect(page.getByText("IMS provider timeout.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Refresh status", exact: true }).first().click();
    await expect(page.getByText("COMPLETED", { exact: true }).first()).toBeVisible();
    await expect.poll(() => statusPayload).not.toBeNull();
    await expect(statusPayload).toMatchObject({
      workspace: "workspace-1",
      client: "client-1",
      gstin: "gstin-1",
    });

    await page.getByPlaceholder("RETRY").fill("RETRY");
    await page.locator('button:has-text("Retry batch"):not(:disabled)').click();
    await expect(page.getByText("ims-batch-retry-1", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ims-int-retry-001", { exact: true }).first()).toBeVisible();
    await expect.poll(() => retryPayload).not.toBeNull();
    await expect(retryPayload).toMatchObject({
      workspace: "workspace-1",
      client: "client-1",
      gstin: "gstin-1",
    });
  });

  test("allows users with filing permission to submit save and reset payloads", async ({ page, app }) => {
    const writePermissions = [...sessionPayload.permissions_summary.codes, "file_return"];
    let savedPayload: Record<string, unknown> | null = null;
    let resetPayload: Record<string, unknown> | null = null;
    let actionBatches = [buildActionBatch()];

    await app.mockAuthenticatedShell({ customPermissions: writePermissions });
    await app.mockFoundationApis();

    await page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [buildSessionRecord()],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/ims\/action-batches\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(jsonSuccess(actionBatches));
    });

    await page.route(/\/api\/backend\/ims\/save\/?$/, async (route) => {
      savedPayload = route.request().postDataJSON() as Record<string, unknown>;
      const batch = buildActionBatch({
        id: "ims-batch-save-1",
        action_type: "save",
        provider_transaction_id: "ims-int-save-001",
        request_payload_hash: "hash-save-001",
        submitted_at: "2026-06-20T10:15:00Z",
        completed_at: "2026-06-20T10:15:00Z",
        created_at: "2026-06-20T10:15:00Z",
        updated_at: "2026-06-20T10:15:00Z",
      });
      actionBatches = [batch, ...actionBatches];
      await route.fulfill(
        jsonSuccess({
          status_cd: "1",
          request_type: "SAVE",
          int_tran_id: "ims-int-save-001",
          accepted: true,
          action_batch: batch,
        }),
      );
    });

    await page.route(/\/api\/backend\/ims\/reset\/?$/, async (route) => {
      resetPayload = route.request().postDataJSON() as Record<string, unknown>;
      const batch = buildActionBatch({
        id: "ims-batch-reset-1",
        action_type: "reset",
        provider_transaction_id: "ims-int-reset-001",
        request_payload_hash: "hash-reset-001",
        submitted_at: "2026-06-20T10:20:00Z",
        completed_at: "2026-06-20T10:20:00Z",
        created_at: "2026-06-20T10:20:00Z",
        updated_at: "2026-06-20T10:20:00Z",
      });
      actionBatches = [batch, ...actionBatches];
      await route.fulfill(
        jsonSuccess({
          status_cd: "1",
          request_type: "RESET",
          int_tran_id: "ims-int-reset-001",
          accepted: true,
          action_batch: batch,
        }),
      );
    });

    await page.goto("/ims");
    await page.getByRole("tab", { name: "Draft save/reset", exact: true }).click();

    const payloadEditor = page.locator('textarea[data-slot="textarea"]');
    await payloadEditor.fill(
      JSON.stringify(
        {
          b2b: [
            {
              ctin: "29ABCDE1234F1Z5",
              inv: [{ inum: "IMS-NEW-001" }],
            },
          ],
        },
        null,
        2,
      ),
    );

    await expect(page.getByRole("button", { name: "Save IMS draft", exact: true })).toBeDisabled();
    await page.getByLabel("I confirm this IMS save/reset payload should be sent for the selected GSTIN and return period.").check();
    await page.getByPlaceholder("052026").fill("052026");
    await expect(page.getByRole("button", { name: "Save IMS draft", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "Save IMS draft", exact: true }).click();
    await expect(page.getByText("SAVE", { exact: true })).toBeVisible();
    await expect(page.getByText("IMS action batch evidence", { exact: true })).toBeVisible();
    await expect(page.getByText("ims-batch-save-1", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ims-int-save-001", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Payload hash: hash-save-001", { exact: true }).first()).toBeVisible();
    await expect.poll(() => savedPayload).not.toBeNull();
    await expect(savedPayload).toMatchObject({
      workspace: "workspace-1",
      client: "client-1",
      gstin: "gstin-1",
      ret_period: "052026",
    });

    await page.getByRole("button", { name: "Reset IMS draft", exact: true }).click();
    await expect(page.getByText("RESET", { exact: true })).toBeVisible();
    await expect(page.getByText("ims-batch-reset-1", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ims-int-reset-001", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Payload hash: hash-reset-001", { exact: true }).first()).toBeVisible();
    await expect.poll(() => resetPayload).not.toBeNull();
    await expect(resetPayload).toMatchObject({
      workspace: "workspace-1",
      client: "client-1",
      gstin: "gstin-1",
      ret_period: "052026",
    });
  });
});
