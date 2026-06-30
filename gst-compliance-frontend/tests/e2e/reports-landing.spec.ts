import { expect, test } from "../fixtures/app-fixture";
import { ReportsPage } from "../pages/reports-page";

test.describe("Reports landing", () => {
  test("loads transaction review in a working compliance context", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();

    await reportsPage.goto();
    await reportsPage.expectReady();

    await expect(page.getByText("Review filters")).toBeVisible();
    await expect(page.getByText("Normalized GST transactions", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "PUR-002 invoice" })).toBeVisible();

    await page.getByRole("link", { name: "Return Status Register" }).click();
    await expect(page).toHaveURL(/\/reports\/return-status$/);
  });

  test("redirects the transaction-review deep link into the reports workspace", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();

    await page.goto("/reports/transaction-review?client=client-1&period=period-1");

    await expect(page).toHaveURL(/\/reports\?client=client-1&period=period-1$/);
    await expect(page.getByRole("heading", { name: "Transaction Review" })).toBeVisible();
    await expect(page.getByText("Normalized GST transactions", { exact: true })).toBeVisible();
  });

  test("surfaces focused deep-link guidance and lets the operator inspect transaction detail", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();

    await page.goto("/reports?client=client-1&period=period-1&ids=txn-2&focus=missing_hsn&suggest_mode=bulk_correct&suggest_fields=hsn_code");

    await expect(page.getByText("Showing the exact transactions linked to")).toBeVisible();
    await expect(page.getByText("Suggested bulk fix: fill HSN code").first()).toBeVisible();
    const bulkDialog = page.getByRole("dialog", { name: "Bulk correct filing metadata" });
    await expect(bulkDialog).toBeVisible();
    await bulkDialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.getByRole("button", { name: "View detail", exact: true }).nth(1).click();

    const detailDialog = page.getByRole("dialog", { name: "Transaction detail" });
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByText("Document summary", { exact: true })).toBeVisible();
    await expect(detailDialog).toContainText("PUR-002");
    await expect(detailDialog).toContainText("Vendor Two");
  });

  test("lets the operator correct transaction metadata from the detail drill-down", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();

    await page.goto("/reports");

    await page.getByRole("button", { name: "View detail", exact: true }).nth(1).click();

    const detailDialog = page.getByRole("dialog", { name: "Transaction detail" });
    await expect(detailDialog).toBeVisible();
    await detailDialog.getByRole("button", { name: "Edit metadata", exact: true }).click();

    const editDialog = page.getByRole("dialog", { name: "Correct transaction metadata" });
    await expect(editDialog).toBeVisible();
    await editDialog.locator("input").first().fill("Vendor Two Updated");
    await editDialog.getByRole("button", { name: "Save corrections", exact: true }).click();

    await expect(page.getByText("Transaction corrections saved.")).toBeVisible();
    await expect(detailDialog).toContainText("Vendor Two Updated");
  });

  test("shows a no-results state when the focused transaction set is empty", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();

    await page.route(/\/api\/backend\/gst-transactions\/?(?:\?.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("ids") === "missing-row") {
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
        return;
      }
      await route.fallback();
    });

    await page.goto("/reports?client=client-1&period=period-1&ids=missing-row&focus=missing_hsn");

    await reportsPage.expectReady();
    await expect(page.getByText("Showing the exact transactions linked to")).toBeVisible();
    await expect(page.getByText("No transactions match these filters")).toBeVisible();
  });

  test("explains when client and period context are missing", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await app.mockAuthenticatedShell({ noContext: true });

    await reportsPage.goto();
    await reportsPage.expectReady();

    await expect(page.getByText("Select client and period first")).toBeVisible();
    await expect(
      page.getByText("Use the topbar selectors to choose a client and compliance period before reviewing normalized transactions."),
    ).toBeVisible();
    await expect(page.getByText("Transaction review will appear here")).toBeVisible();
  });

  test("shows a clear error state when transaction review cannot be loaded", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await app.mockAuthenticatedShell();

    await page.route(/\/api\/backend\/gst-transactions\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Transaction review unavailable" }),
      });
    });

    await page.route(/\/api\/backend\/imports\/batches\/?(?:\?.*)?$/, async (route) => {
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

    await page.route(/\/api\/backend\/gst-transaction-review-snapshots\/?(?:\?.*)?$/, async (route) => {
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

    await page.route(/\/api\/backend\/gst-transaction-remediation-assignments\/?(?:\?.*)?$/, async (route) => {
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

    await page.route(/\/api\/backend\/gst-transaction-remediation-follow-ups\/?(?:\?.*)?$/, async (route) => {
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

    await reportsPage.goto();
    await reportsPage.expectReady();

    await expect(page.getByText("We couldn’t load GST transactions")).toBeVisible();
    await expect(page.getByText("Something went wrong.")).toBeVisible();
  });
});
