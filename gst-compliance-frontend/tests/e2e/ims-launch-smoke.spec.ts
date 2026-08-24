import { expect, test } from "../fixtures/app-fixture";
import { sessionPayload } from "../fixtures/app-data";

function buildSessionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "provider-session-launch-1",
    workspace: "workspace-1",
    workspace_name: "Primary Workspace",
    client: "client-1",
    client_name: "Acme Client Private Limited",
    gstin: "gstin-1",
    gstin_value: "27ABCDE1234F1Z5",
    provider: "whitebooks",
    email: "ims-ops@example.com",
    txn: "txn-ims-launch-123",
    status: "session_active",
    freshness_summary: {
      max_age_minutes: 360,
      verified_at: "2026-06-20T10:00:00Z",
      expires_at: "2026-06-20T16:00:00Z",
      is_stale: false,
      stale_reason: "",
    },
    response_contract_confirmed: true,
    last_requested_at: "2026-06-20T10:00:00Z",
    verified_at: "2026-06-20T10:05:00Z",
    created_at: "2026-06-20T10:00:00Z",
    updated_at: "2026-06-20T10:05:00Z",
    ...overrides,
  };
}

test.describe("IMS launch smoke", () => {
  test("@launch shows IMS as a supported operator surface with control posture, live context, and action tabs", async ({ page, app }) => {
    await app.mockAuthenticatedShell({
      customPermissions: [...sessionPayload.permissions_summary.codes, "file_return"],
    });
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

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "IMS", exact: true })).toBeVisible();
    await expect(
      main.getByText(
        "Manage IMS investigation, provider response checks, supplier and rejection drill-downs, and controlled draft actions from one supported operations surface.",
        { exact: true },
      ),
    ).toBeVisible();

    await expect(main.getByText("IMS control posture", { exact: true })).toBeVisible();
    await expect(main.getByText("Active context", { exact: true })).toBeVisible();
    await expect(main.getByText("Session state", { exact: true })).toBeVisible();
    await expect(main.getByText("Verified session", { exact: true })).toBeVisible();
    await expect(main.getByText("Write action policy", { exact: true })).toBeVisible();
    await expect(main.getByText("Ready for operator actions", { exact: true })).toBeVisible();
    await expect(main.getByText("ims-ops@example.com", { exact: true }).first()).toBeVisible();
    await expect(main.getByText("Save and reset available", { exact: true })).toBeVisible();

    await expect(main.getByText("Live context & access", { exact: true })).toBeVisible();
    await expect(main.getByText("Primary Workspace", { exact: true })).toBeVisible();
    await expect(main.getByText("Acme Client Private Limited", { exact: true }).first()).toBeVisible();
    await expect(main.getByText("27ABCDE1234F1Z5", { exact: true }).first()).toBeVisible();
    await expect(main.getByText("contract confirmed", { exact: true })).toBeVisible();
    await expect(main.getByText("Operator guidance", { exact: true })).toBeVisible();
    await expect(main.getByText("Read actions are safe for investigation and drill-down workflows.", { exact: true })).toBeVisible();

    await expect(main.getByText("IMS actions", { exact: true })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Invoices", exact: true })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Supplier", exact: true })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Rejected", exact: true })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Status", exact: true })).toBeVisible();
    await expect(main.getByRole("tab", { name: "File", exact: true })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Draft save/reset", exact: true })).toBeVisible();

    await main.getByRole("tab", { name: "Draft save/reset", exact: true }).click();
    await expect(main.getByRole("button", { name: "Save IMS draft", exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Reset IMS draft", exact: true })).toBeVisible();

    await main.getByRole("tab", { name: "Status", exact: true }).click();
    await expect(main.getByRole("button", { name: "Fetch status", exact: true })).toBeVisible();
    await expect(main.getByPlaceholder("ims-int-001")).toBeVisible();
  });
});
