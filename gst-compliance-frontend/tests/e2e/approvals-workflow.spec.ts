import { expect, test } from "../fixtures/app-fixture";

test.describe("Approvals workflow", () => {
  test("requests approval for a review-ready draft and approves a pending request", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockApprovalsWorkflowApis();

    await page.goto("/approvals");

    await expect(page.getByRole("main").getByRole("heading", { name: "Approvals", exact: true })).toBeVisible();

    const requestableRow = page.getByRole("row").filter({ hasText: "GSTR1 return draft" });
    await requestableRow.getByRole("button", { name: "Request approval", exact: true }).click();
    await expect(page.getByText("Approval request created.")).toBeVisible();

    const pendingRow = page.getByTestId("approval-row-approval-1");
    await pendingRow.getByTestId("approval-approve-approval-1").click();
    const actionDialog = page.getByRole("dialog", { name: "Approve approval request" });
    await actionDialog.getByLabel("Review remarks").fill("Reviewed and approved for controlled filing.");
    await actionDialog.getByRole("button", { name: "Confirm", exact: true }).click();

    await expect(page.getByText("Approval request approved.")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "return-1" })).toHaveCount(0);
  });

  test("links review-ready drafts into the dedicated return review workspace", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockApprovalsWorkflowApis();

    await page.goto("/approvals");

    const draftRow = page.getByRole("row").filter({ hasText: "GSTR1 return draft" });
    await expect(draftRow.getByRole("link", { name: "View return", exact: true })).toHaveAttribute(
      "href",
      /\/returns\/gstr1-review\?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-2&tab=overview/,
    );
  });

  test("captures rejection remarks before rejecting a pending approval request", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockApprovalsWorkflowApis();

    await page.goto("/approvals");

    const pendingRow = page.getByTestId("approval-row-approval-1");
    await pendingRow.getByTestId("approval-reject-approval-1").click();

    const actionDialog = page.getByRole("dialog", { name: "Reject approval request" });
    await expect(actionDialog).toBeVisible();
    await expect(actionDialog.getByRole("textbox").first()).toHaveValue("return preparation");
    await expect(actionDialog.getByLabel("Review remarks")).toBeVisible();
    await actionDialog.getByLabel("Review remarks").fill("Mismatch noted. Rejecting until exception evidence is attached.");
    await actionDialog.getByRole("button", { name: "Confirm", exact: true }).click();

    await expect(page.getByText("Approval request rejected.")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "return-1" })).toHaveCount(0);
  });

  test("shows an empty state when there are no approval requests or review-ready drafts", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockApprovalsApis();

    await page.goto("/approvals");

    await expect(page.getByRole("main").getByRole("heading", { name: "Approvals", exact: true })).toBeVisible();
    await expect(page.getByText("No approvals found")).toBeVisible();
    await expect(
      page.getByText("Approval requests will appear here when returns or other entities are sent for review."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Open returns workspace", exact: true })).toHaveAttribute("href", "/returns");
    await expect(page.getByRole("link", { name: "Review imports", exact: true })).toHaveAttribute("href", "/imports");
  });

  test("shows a clear error state when the approval queue cannot be loaded", async ({ page, app }) => {
    await app.mockAuthenticatedShell();

    await page.route("**/api/backend/approvals/**", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Approval service unavailable" }),
      });
    });

    await page.route("**/api/backend/returns/**", async (route) => {
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

    await page.goto("/approvals");

    await expect(page.getByRole("main").getByRole("heading", { name: "Approvals", exact: true })).toBeVisible();
    await expect(page.getByText("We couldn’t load this section")).toBeVisible();
  });
});
