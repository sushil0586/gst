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

    await page.route(/\/api\/backend\/ims\/invoices\/?(?:\?.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill(
        jsonSuccess({
          status_cd: "1",
          section: url.searchParams.get("section"),
          provider_status: url.searchParams.get("status"),
          invoices: [{ inum: "INV-IMS-001", ctin: "29ABCDE1234F1Z5" }],
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

    await page.getByRole("tab", { name: "Invoices", exact: true }).click();
    await page.getByRole("button", { name: "Fetch invoices", exact: true }).click();
    await expect(page.getByRole("heading", { name: "IMS", exact: true })).toBeVisible();
    await expect(page.getByText("Provider outcome", { exact: true })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: "PENDING" })).toBeVisible();
    await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
    await page.getByText("Debug payload", { exact: true }).click();
    await expect(page.getByText("INV-IMS-001")).toBeVisible();

    await page.getByRole("tab", { name: "Status", exact: true }).click();
    await page.getByPlaceholder("ims-int-001").fill("ims-int-789");
    await page.getByRole("button", { name: "Fetch status", exact: true }).click();
    await expect(page.getByText("ims-int-789", { exact: true })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: "COMPLETED" })).toBeVisible();
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

    await page.goto("/ims");

    await page.getByRole("tab", { name: "Draft save/reset", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save IMS draft", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Reset IMS draft", exact: true })).toBeDisabled();
    await expect(page.getByText("save and reset remain disabled because this role does not have filing permission")).toBeVisible();
  });

  test("allows users with filing permission to submit save and reset payloads", async ({ page, app }) => {
    const writePermissions = [...sessionPayload.permissions_summary.codes, "file_return"];
    let savedPayload: Record<string, unknown> | null = null;
    let resetPayload: Record<string, unknown> | null = null;

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

    await page.route(/\/api\/backend\/ims\/save\/?$/, async (route) => {
      savedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill(
        jsonSuccess({
          status_cd: "1",
          request_type: "SAVE",
          accepted: true,
        }),
      );
    });

    await page.route(/\/api\/backend\/ims\/reset\/?$/, async (route) => {
      resetPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill(
        jsonSuccess({
          status_cd: "1",
          request_type: "RESET",
          accepted: true,
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

    await page.getByRole("button", { name: "Save IMS draft", exact: true }).click();
    await expect(page.getByText("SAVE", { exact: true })).toBeVisible();
    await expect.poll(() => savedPayload).not.toBeNull();
    await expect(savedPayload).toMatchObject({
      workspace: "workspace-1",
      client: "client-1",
      gstin: "gstin-1",
      ret_period: "052026",
    });

    await page.getByRole("button", { name: "Reset IMS draft", exact: true }).click();
    await expect(page.getByText("RESET", { exact: true })).toBeVisible();
    await expect.poll(() => resetPayload).not.toBeNull();
    await expect(resetPayload).toMatchObject({
      workspace: "workspace-1",
      client: "client-1",
      gstin: "gstin-1",
      ret_period: "052026",
    });
  });
});
