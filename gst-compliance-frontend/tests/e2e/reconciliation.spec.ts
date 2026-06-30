import { expect, test } from "../fixtures/app-fixture";
import { ReconciliationPage } from "../pages/reconciliation-page";

test.describe("Reconciliation", () => {
  test("runs reconciliation and shows issue output", async ({ page, app }) => {
    const reconciliationPage = new ReconciliationPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReconciliationApis();

    await reconciliationPage.goto();
    await reconciliationPage.expectReady();

    await reconciliationPage.runReconciliation();

    await expect(page.getByText("Reconciliation run created.")).toBeVisible();
    await page.getByTestId("reconciliation-run-open-run-1").click();
    await expect(page.getByText("Vendor One")).toBeVisible();
  });

  test("opens reconciliation issue drill-downs and saves operator actions", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReconciliationApis();

    await page.goto("/reconciliation");

    await expect(page.getByTestId("reconciliation-run-row-run-1")).toBeVisible();
    await page.getByTestId("reconciliation-run-open-run-1").click();
    const issueRow = page.getByRole("row").filter({ hasText: "Vendor One" });
    await issueRow.getByRole("button", { name: "Review", exact: true }).click();

    const reviewDialog = page.getByRole("dialog", { name: "Reconciliation issue action" });
    await expect(reviewDialog).toBeVisible();
    await expect(reviewDialog.getByText("Issue summary")).toBeVisible();
    await expect(reviewDialog.getByText("Correct books entry")).toBeVisible();
    await expect(reviewDialog.getByText("Update action")).toBeVisible();

    await reviewDialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Claim now", exact: true }).click();

    await reviewDialog.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: "Owner Accounts", exact: true }).click();

    await reviewDialog.getByRole("combobox").nth(3).click();
    await page.getByRole("option", { name: "Assigned", exact: true }).click();

    await reviewDialog
      .getByPlaceholder("Add follow-up notes, vendor comments, or resolution detail...")
      .fill("Vendor mismatch assigned for CA review and follow-up.");
    await reviewDialog.getByRole("button", { name: "Save action", exact: true }).click();

    await expect(page.getByText("Reconciliation item updated.")).toBeVisible();
    await expect(reviewDialog).toHaveCount(0);
  });

  test("guides the user through the OTP verification modal before fetching GSTR-2B", async ({ page, app }) => {
    let providerSession: Record<string, unknown> | null = null;

    await app.mockAuthenticatedShell();
    await app.mockReconciliationApis();

    await page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
      const request = route.request();
      const url = request.url();

      if (request.method() === "POST" && url.includes("/request-otp/")) {
        providerSession = {
          id: "session-1",
          workspace: "workspace-1",
          client: "client-1",
          gstin: "gstin-1",
          provider: "whitebooks",
          status: "otp_requested",
          txn: "WB-TXN-001",
          response_contract_confirmed: false,
          last_requested_at: "2026-06-05T09:30:00Z",
          verified_at: null,
          freshness_summary: {
            verified_at: null,
            expires_at: null,
            is_stale: false,
            stale_reason: "",
          },
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "success",
            message: "Success",
            data: providerSession,
          }),
        });
        return;
      }

      if (request.method() === "POST" && url.includes("/verify-otp/")) {
        providerSession = {
          ...providerSession,
          status: "verified",
          response_contract_confirmed: true,
          verified_at: "2026-06-05T09:32:00Z",
          freshness_summary: {
            verified_at: "2026-06-05T09:32:00Z",
            expires_at: "2026-06-05T11:32:00Z",
            is_stale: false,
            stale_reason: "",
          },
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "success",
            message: "Success",
            data: providerSession,
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
          data: providerSession ? [providerSession] : [],
          pagination: { count: providerSession ? 1 : 0, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.goto("/reconciliation");

    await page.getByRole("button", { name: "Fetch 2B from filing channel", exact: true }).click();

    const otpDialog = page.getByRole("dialog", { name: "Verification needed to fetch GSTR-2B" });
    await expect(otpDialog).toBeVisible();
    await expect(otpDialog.getByText("1. Request OTP")).toBeVisible();
    await expect(otpDialog.getByText("2. Verify OTP")).toBeVisible();
    await expect(otpDialog.getByText("3. Fetch GSTR-2B")).toBeVisible();

    await otpDialog.getByRole("button", { name: "Request OTP", exact: true }).click();
    await expect(page.getByText("OTP requested. Enter the OTP for this GSTIN to continue.")).toBeVisible();
    await expect(otpDialog.getByLabel("Session reference")).toHaveValue("WB-TXN-001");

    await otpDialog.getByLabel("OTP").fill("482913");
    await otpDialog.getByRole("button", { name: "Verify OTP and continue", exact: true }).click();

    await expect(page.getByText("Verification complete for this GSTIN. Continuing GSTR-2B fetch...")).toBeVisible();
    await expect(page.getByText(/Fetched 24 GSTR-2B transaction\(s\) from the connected filing channel\./)).toBeVisible();
    await expect(otpDialog).toHaveCount(0);
  });

  test("guides the user when purchase and 2B data are missing", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReconciliationApis({ missingData: true });

    await page.goto("/reconciliation");

    await expect(page.getByText("Purchase and GSTR-2B data required")).toBeVisible();
    await expect(page.getByText("No reconciliation runs yet")).toBeVisible();
  });
});
