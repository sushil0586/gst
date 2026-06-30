import type { Page, Route } from "@playwright/test";

import { expect, test } from "../fixtures/app-fixture";
import { createCloseManagerReport, createDashboardSummary } from "../fixtures/app-data";
import { DashboardPage } from "../pages/dashboard-page";

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

function paginated(data: unknown[], count = data.length) {
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

async function mockDashboardSurface(
  page: Page,
  options?: {
    summary?: Record<string, unknown>;
    summaryError?: boolean;
    digests?: Array<Record<string, unknown>>;
    filingOperations?: Array<Record<string, unknown>>;
  },
) {
  await page.route(/\/api\/backend\/dashboard\/summary\/?(?:\?.*)?$/, async (route: Route) => {
    if (options?.summaryError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Dashboard summary unavailable." }),
      });
      return;
    }

    await route.fulfill(jsonSuccess(options?.summary ?? createDashboardSummary()));
  });

  await page.route(/\/api\/backend\/dashboard\/close-manager\/report\/?(?:\?.*)?$/, async (route: Route) => {
    await route.fulfill(jsonSuccess(createCloseManagerReport()));
  });

  await page.route("**/api/backend/gst-transaction-remediation-digests/**", async (route: Route) => {
    await route.fulfill(paginated(options?.digests ?? []));
  });

  await page.route("**/api/backend/filings/operations/**", async (route: Route) => {
    await route.fulfill(paginated(options?.filingOperations ?? []));
  });
}

test.describe("Dashboard experience", () => {
  test("guides the operator through the live monthly dashboard and quick actions", async ({ page, app }) => {
    const dashboardPage = new DashboardPage(page);

    await app.mockAuthenticatedShell();
    await app.mockDashboardApis();
    await app.mockReturnsApis();

    await dashboardPage.goto();
    await dashboardPage.expectReady();

    await expect(page.getByText("Next best move", { exact: true })).toBeVisible();
    await expect(page.getByText("Clear approvals", { exact: true })).toBeVisible();
    await expect(page.getByText("Workspace close manager", { exact: true })).toBeVisible();
    await expect(page.getByText("No digests generated yet", { exact: true })).toBeVisible();
    await expect(page.getByText("Filing operations queue", { exact: true })).toBeVisible();
    await expect(page.getByText("No unresolved filing operations", { exact: true })).toBeVisible();

    await dashboardPage.openQuickAction("Prepare Return");
    await expect(page).toHaveURL(/\/returns\?/);
    await expect(page.getByRole("main").getByRole("heading", { name: "Returns", exact: true })).toBeVisible();
  });

  test("shows first-cycle guidance when the workspace context is selected but no live activity exists", async ({ page, app }) => {
    const dashboardPage = new DashboardPage(page);
    const emptySummary = {
      ...createDashboardSummary(),
      import_summary: {
        total_batches: 0,
        by_type: {
          sales: 0,
          purchase: 0,
          gstr_2b: 0,
        },
      },
      transaction_summary: {
        total_transactions: 0,
      },
      reconciliation_summary: {
        ...createDashboardSummary().reconciliation_summary,
        latest_run: null,
        mismatch_count: 0,
        partial_match_count: 0,
        total_itc_at_risk: "0.00",
        open_issue_count: 0,
      },
      approval_summary: {
        pending_count: 0,
        approved_count: 0,
      },
      return_summary: {
        gstr1: { status: "not_prepared" },
        gstr3b: { status: "not_prepared" },
        filed_count: 0,
        total_expected: 2,
      },
      filing_status: {
        all_filed: false,
        gstr1_status: "not_prepared",
        gstr3b_status: "not_prepared",
      },
      open_issues: 0,
      recent_activity: [],
    };

    await app.mockAuthenticatedShell();
    await app.mockImportsApis();
    await mockDashboardSurface(page, { summary: emptySummary });

    await dashboardPage.goto();
    await dashboardPage.expectReady();

    await expect(page.getByText("This monthly workspace is ready for its first cycle", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Start by uploading sales, purchase, and GSTR-2B data. Once imports arrive, reconciliation, returns, and audit metrics will populate automatically.",
        { exact: true },
      ),
    ).toBeVisible();

    await page.getByRole("link", { name: "Go to Imports", exact: true }).click();
    await expect(page.getByRole("main").getByRole("heading", { name: "Import Center", exact: true })).toBeVisible();
  });

  test("shows a stable error state when live dashboard metrics cannot be loaded", async ({ page, app }) => {
    const dashboardPage = new DashboardPage(page);

    await app.mockAuthenticatedShell();
    await mockDashboardSurface(page, { summaryError: true });

    await dashboardPage.goto();
    await dashboardPage.expectReady();

    await expect(
      page.getByText(
        "We couldn't load the live dashboard summary. Resolve the API issue before relying on dashboard metrics.",
        { exact: true },
      ),
    ).toBeVisible();
  });
});
