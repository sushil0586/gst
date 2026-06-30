import { expect, test } from "../fixtures/app-fixture";

test.describe("Filing operations", () => {
  test("resyncs a filing, retries a safe failure, and requeues after review", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockOperationsWorkflowApis();

    await page.goto("/operations");

    await expect(page.getByRole("main").getByRole("heading", { name: "Filing Operations", exact: true })).toBeVisible();

    const submittedRow = page.getByRole("row").filter({ hasText: "submitted" }).filter({ hasText: "GSTR1" });
    await submittedRow.getByRole("button", { name: "Resync", exact: true }).click();
    await expect(page.getByText("Filing status resynced.")).toBeVisible();

    const retryRow = page.getByRole("row").filter({ hasText: "Acme Client Private Limited • GSTR3B" });
    await retryRow.getByRole("button").nth(1).click();
    await expect(page.getByText("Filing retry started.")).toBeVisible();

    await retryRow.getByRole("button", { name: "Requeue", exact: true }).click();
    const requeueDialog = page.getByRole("dialog", { name: "Requeue after review" });
    await requeueDialog.getByPlaceholder("Summarize the filing review, decision, and why this filing is being requeued...").fill(
      "Reviewed provider failure details and sending the filing back to the controlled queue.",
    );
    await requeueDialog.getByRole("button", { name: "Confirm requeue", exact: true }).click();

    await expect(page.getByText("Filing requeued after review.")).toBeVisible();
  });

  test("falls back to a workspace-level queue when client context is missing", async ({ page, app }) => {
    await app.mockAuthenticatedShell({ noContext: true });
    await app.mockOperationsWorkflowApis();

    await page.goto("/operations");

    await expect(page.getByRole("main").getByRole("heading", { name: "Filing Operations", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Client Ctrl\/Cmd\+K/i })).toBeDisabled();
    await expect(page.getByText("2 filing(s)")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Acme Client Private Limited • GSTR3B" })).toBeVisible();
  });

  test("shows an empty state when no filing operations match the current queue", async ({ page, app }) => {
    await app.mockAuthenticatedShell();

    await page.route("**/api/backend/filings/operations/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [],
          pagination: {
            count: 0,
            next: null,
            previous: null,
            page: 1,
            page_size: 50,
          },
        }),
      });
    });

    await page.route("**/api/backend/client-contacts/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [],
          pagination: {
            count: 0,
            next: null,
            previous: null,
            page: 1,
            page_size: 50,
          },
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
          pagination: {
            count: 0,
            next: null,
            previous: null,
            page: 1,
            page_size: 50,
          },
        }),
      });
    });

    await page.goto("/operations");

    await expect(page.getByRole("main").getByRole("heading", { name: "Filing Operations", exact: true })).toBeVisible();
    await expect(page.getByText("No filing operations match these filters")).toBeVisible();
    await expect(
      page.getByText("Try broadening the queue scope or clearing status filters to bring more filing states into view."),
    ).toBeVisible();
  });

  test("expands operator drill-down details and escalates filing alerts", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockOperationsWorkflowApis();

    await page.goto("/operations");

    const retryRow = page.getByRole("row").filter({ hasText: "Acme Client Private Limited • GSTR3B" });
    await expect(retryRow).toBeVisible();
    await retryRow.getByRole("button").first().click();

    await expect(page.getByText("Operator status summary")).toBeVisible();
    await expect(page.getByText("Filing activity snapshot")).toBeVisible();
    await expect(page.getByText("Operational alerts")).toBeVisible();
    await expect(page.getByText("Available actions")).toBeVisible();
    await expect(page.getByText("Recent interventions")).toBeVisible();
    await expect(page.getByText("Incident notes", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Escalate alerts", exact: true }).click();
    await expect(page.getByText("Operational alerts escalated.")).toBeVisible();
  });

  test("lets the operator back out of requeue review without changing filing state", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockOperationsWorkflowApis();

    await page.goto("/operations");

    const retryRow = page.getByRole("row").filter({ hasText: "Acme Client Private Limited • GSTR3B" });
    await retryRow.getByRole("button", { name: "Requeue", exact: true }).click();

    const requeueDialog = page.getByRole("dialog", { name: "Requeue after review" });
    await expect(requeueDialog).toBeVisible();
    await requeueDialog.getByPlaceholder("Summarize the filing review, decision, and why this filing is being requeued...").fill(
      "Draft note that should not be submitted.",
    );
    await requeueDialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(requeueDialog).toHaveCount(0);
    await expect(page.getByText("Filing requeued after review.")).toHaveCount(0);
    await expect(retryRow).toContainText("needs retry");
  });
});
