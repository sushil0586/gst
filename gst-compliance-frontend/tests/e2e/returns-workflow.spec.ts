import { expect, test } from "../fixtures/app-fixture";
import { ReturnsPage } from "../pages/returns-page";

test.describe("Returns workflow", () => {
  test("opens a prepared review workspace and requests approval from the returns desk", async ({ page, app }) => {
    const returnsPage = new ReturnsPage(page);

    let approvals: Array<Record<string, unknown>> = [];

    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.route(/\/api\/backend\/approvals\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "success",
            message: "Success",
            data: approvals,
            pagination: { count: approvals.length, next: null, previous: null, page: 1, page_size: 50 },
          }),
        });
        return;
      }

      const nextApproval = {
        id: "approval-from-returns-1",
        workspace: "workspace-1",
        client: "client-1",
        client_name: "Acme Client Private Limited",
        gstin: "gstin-1",
        gstin_value: "27ABCDE1234F1Z5",
        compliance_period: "period-1",
        compliance_period_label: "2026-05",
        entity_type: "return_preparation",
        entity_id: "return-gstr1",
        requested_to: 1,
        requested_to_name: "Owner Accounts",
        status: "pending",
        comments: "Please review this prepared return before filing.",
        resolution_comments: "",
        resolved_by: null,
        resolved_by_name: null,
        resolved_at: null,
        created_at: "2026-06-05T11:20:00Z",
        updated_at: "2026-06-05T11:20:00Z",
      };
      approvals = [nextApproval];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "Success", data: nextApproval }),
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
          pagination: { count: 0, next: null, previous: null, page: 1, page_size: 50 },
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
          pagination: { count: 0, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await returnsPage.goto();
    await returnsPage.expectReady();

    await page.getByRole("link", { name: "Open GSTR-1 Review", exact: true }).click();
    await expect(page).toHaveURL(/\/returns\/gstr1-review\?/);
    await expect(page.getByRole("main").getByRole("heading", { name: "GSTR-1 Review", exact: true })).toBeVisible();

    await page.goto("/returns");
    await returnsPage.expectReady();

    const gstr1Row = page.getByRole("row", { name: /GSTR1.*2026-05/i });
    await expect(gstr1Row).toBeVisible();
    await gstr1Row.getByRole("button", { name: "Review & file", exact: true }).click();

    const reviewDialog = page.getByRole("dialog", { name: "GSTR1 review summary" });
    await expect(reviewDialog).toBeVisible();
    await expect(reviewDialog.getByText("Filing flow", { exact: true })).toBeVisible();

    await reviewDialog.getByRole("button", { name: "Request approval", exact: true }).click();
    await expect(page.getByText("Approval request created.")).toBeVisible();
    await expect(page.getByText("Approval status")).toBeVisible();
    await expect(page.getByText("pending • Reviewer: Owner Accounts")).toBeVisible();
  });

  test("prepares a GSTR-3B draft from the returns workspace", async ({ page, app }) => {
    const returnsPage = new ReturnsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnsApis();

    await returnsPage.goto();
    await returnsPage.expectReady();

    await returnsPage.prepareGstr3b();

    await expect(page.getByText("GSTR3B draft prepared.")).toBeVisible();
  });

  test("warns the user when return preparation is blocked by stale reconciliation", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnsApis({ staleRun: true });

    await page.goto("/returns");

    await expect(page.getByText("Reconciliation is no longer current")).toBeVisible();
    await expect(
      page.getByText(
        "Source imports were changed after the last reconciliation run. Re-run reconciliation before approving, filing, or sharing this return output.",
      ),
    ).toBeVisible();
    await expect(page.getByText(/Preparation is currently blocked for at least one return type\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare GSTR-3B" })).toBeDisabled();
  });

  test("shows live portal ledger evidence for a filing-ready GSTR-3B context", async ({ page, app }) => {
    const returnsPage = new ReturnsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnsApis({ portalReadiness: "ready" });

    await returnsPage.goto();
    await returnsPage.expectReady();

    await expect(page.getByText("WhiteBooks balance payload fetched successfully.")).toBeVisible();
    await expect(page.getByText("Latest CPIN detected: CPIN0001234567")).toBeVisible();
    await expect(page.getByText("Cash ledger closing").locator("..")).toContainText("1,25,000.50");

    await returnsPage.openPortalLedgers();

    await expect(page.getByRole("heading", { name: "Portal ledger evidence" })).toBeVisible();
    await expect(page.getByText("Latest CPIN: CPIN0001234567")).toBeVisible();
    await expect(page.getByText("cashEntries")).toBeVisible();
    await expect(page.getByText("liabilityEntries")).toBeVisible();
  });

  test("validates and generates a portal challan from the returns workspace", async ({ page, app }) => {
    const returnsPage = new ReturnsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnsApis({ portalReadiness: "ready" });

    await returnsPage.goto();
    await returnsPage.expectReady();

    await returnsPage.openGeneratePortalChallan();
    await expect(page.getByRole("heading", { name: "Generate portal challan" })).toBeVisible();

    await returnsPage.fillPortalChallanForm({
      reason: "MONTHLYPAY",
      mobileNumber: "9876543210",
      address: "Mumbai, Maharashtra",
      cgst: "20000",
      igst: "15000",
      sgst: "20000",
      cess: "500",
    });

    await expect(page.getByText("Rs. 55,500.00")).toBeVisible();

    await page.getByRole("button", { name: "Validate challan" }).click();
    await expect(page.getByText("Validation passed")).toBeVisible();
    await expect(page.getByText("Portal challan validation succeeded.")).toBeVisible();

    await page.getByRole("button", { name: "Generate challan" }).click();
    await expect(page.getByText("Portal challan generated. CPIN: CPIN0007654321")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Generate portal challan" })).not.toBeVisible();

    const generatedChallanRow = page.getByRole("row", { name: /CPIN0007654321/ });
    await expect(generatedChallanRow).toBeVisible();
    await expect(generatedChallanRow).toContainText("MONTHLYPAY");
    await expect(generatedChallanRow).toContainText("55,500.00");
  });

  test("keeps portal challan actions disabled when the WhiteBooks session is unavailable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnsApis({ portalReadiness: "blocked" });

    await page.goto("/returns");

    await expect(page.getByText("Portal fetch blockers")).toBeVisible();
    await expect(page.getByText("Verified portal session is not available for this GSTIN.")).toBeVisible();

    const generateChallanButton = page.getByRole("button", { name: "Generate portal challan" });
    await expect(generateChallanButton).toBeDisabled();
    await expect(page.getByText("Challan reads are feature-gated off.")).toBeVisible();
  });

  test("shows validation failure feedback before challan generation", async ({ page, app }) => {
    const returnsPage = new ReturnsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnsApis({ portalReadiness: "ready", challanValidationFails: true });

    await returnsPage.goto();
    await returnsPage.expectReady();

    await returnsPage.openGeneratePortalChallan();
    await expect(page.getByRole("heading", { name: "Generate portal challan" })).toBeVisible();

    await returnsPage.fillPortalChallanForm({
      reason: "MONTHLYPAY",
      mobileNumber: "9876543210",
      address: "Mumbai, Maharashtra",
      cgst: "20000",
      igst: "15000",
      sgst: "20000",
      cess: "500",
    });

    await page.getByRole("button", { name: "Validate challan" }).click();

    await expect(page.getByText("Validation failed")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Portal validation rejected the challan payload.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Generate portal challan" })).toBeVisible();
    await expect(page.getByRole("row", { name: /CPIN0007654321/ })).toHaveCount(0);
  });
});
