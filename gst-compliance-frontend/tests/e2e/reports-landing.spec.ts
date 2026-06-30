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
