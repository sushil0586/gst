import path from "node:path";

import { expect, test } from "../fixtures/app-fixture";
import { ImportsPage } from "../pages/imports-page";

const purchaseSample = path.resolve(
  "/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/01_happy_path_basic/purchase_standard.csv",
);

test.describe("Import center", () => {
  test("opens row-correction and row-discard drill-downs from batch details", async ({ page, app }) => {
    const importsPage = new ImportsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockImportsApis();

    await page.route("**/api/backend/imports/batches/*/errors/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [{
            id: "error-1",
            row_number: 4,
            field_name: "document_number",
            error_code: "missing_document_number",
            severity: "error",
            error_message: "Document number is required for this row.",
            raw_row: {
              document_number: "",
              invoice_date: "2026-05-11",
              taxable_value: "2500.00",
            },
          }],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await importsPage.goto();
    await importsPage.expectReady();
    await importsPage.uploadFile(purchaseSample);

    const detailsDialog = page.getByRole("dialog", { name: "Import batch details" });
    await expect(detailsDialog).toBeVisible();
    await expect(detailsDialog.getByText("Row errors", { exact: true })).toBeVisible();
    await expect(detailsDialog.getByText("Document number is required for this row.")).toBeVisible();

    await detailsDialog.getByRole("button", { name: "Correct row", exact: true }).click();
    const correctionDialog = page.getByRole("dialog", { name: "Correct import row" });
    await expect(correctionDialog).toBeVisible();
    await expect(correctionDialog.getByText("Correction checkpoint", { exact: true })).toBeVisible();
    await expect(correctionDialog.getByText("Editable source values", { exact: true })).toBeVisible();
    await expect(correctionDialog.getByText("Next step after save", { exact: true })).toBeVisible();
    await correctionDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(correctionDialog).not.toBeVisible();

    await detailsDialog.getByRole("button", { name: "Discard row", exact: true }).click();
    const discardRowDialog = page.getByRole("dialog", { name: "Discard import row" });
    await expect(discardRowDialog).toBeVisible();
    await expect(discardRowDialog.getByText("Discard checkpoint", { exact: true })).toBeVisible();
    await expect(discardRowDialog.getByText("Row preview", { exact: true })).toBeVisible();
    await expect(discardRowDialog.getByText("Next step after discard", { exact: true })).toBeVisible();
    await discardRowDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(discardRowDialog).not.toBeVisible();
  });

  test("uploads a purchase file and shows processed batch feedback", async ({ page, app }) => {
    const importsPage = new ImportsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockImportsApis();

    await importsPage.goto();
    await importsPage.expectReady();

    const uploadButton = page.getByRole("button", { name: "Upload file" });
    await expect(uploadButton).toBeDisabled();

    await importsPage.uploadFile(purchaseSample);

    const detailsDialog = page.getByRole("dialog", { name: "Import batch details" });
    await expect(detailsDialog).toBeVisible();
    await expect(detailsDialog.getByText("purchase_standard.csv")).toBeVisible();
    await expect(detailsDialog.getByText("Transactions created")).toBeVisible();
    await expect(detailsDialog.getByRole("heading", { name: "No row-level issues" })).toBeVisible();
  });

  test("fetches GSTR-2B from the provider channel and opens the provider batch", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockImportsApis();

    await page.goto("/imports");

    await expect(page.getByText("Provider GSTR-2B fetch", { exact: true })).toBeVisible();
    await expect(page.getByText("Ready", { exact: true })).toBeVisible();

    await page.getByTestId("fetch-provider-gstr2b").click();

    await expect(page.getByText("Provider 2B available", { exact: true })).toBeVisible();
    await expect(page.getByTestId("import-batch-row-batch-3").getByText("acme-client-gstr2b-052026.provider.json")).toBeVisible();

    const detailsDialog = page.getByRole("dialog", { name: "Import batch details" });
    await expect(detailsDialog).toBeVisible();
    await expect(detailsDialog.getByText("acme-client-gstr2b-052026.provider.json")).toBeVisible();
  });

  test("opens import history details from a stable batch action hook", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockImportsApis();

    await page.goto("/imports");

    await page.getByTestId("import-batch-row-batch-1").getByTestId("import-batch-open-batch-1").click();

    const detailsDialog = page.getByRole("dialog", { name: "Import batch details" });
    await expect(detailsDialog).toBeVisible();
    await expect(page.getByTestId("import-batch-row-batch-1")).toBeVisible();
    await expect(detailsDialog).toContainText("purchase_standard.csv");
  });

  test("opens batch-level reprocess, replace, and discard dialogs from import details", async ({ page, app }) => {
    const importsPage = new ImportsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockImportsApis();

    await importsPage.goto();
    await importsPage.expectReady();
    await importsPage.uploadFile(purchaseSample);

    const detailsDialog = page.getByRole("dialog", { name: "Import batch details" });
    await expect(detailsDialog).toBeVisible();

    await detailsDialog.getByRole("button", { name: "Reprocess batch", exact: true }).click();
    const reprocessDialog = page.getByRole("dialog", { name: "Reprocess import batch" });
    await expect(reprocessDialog).toBeVisible();
    await expect(reprocessDialog.getByText("Reprocess checkpoint", { exact: true })).toBeVisible();
    await expect(reprocessDialog.getByText("The batch will be regenerated in place.", { exact: true })).toBeVisible();
    await expect(reprocessDialog.getByText("Next step after reprocess", { exact: true })).toBeVisible();
    await reprocessDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(reprocessDialog).not.toBeVisible();

    await detailsDialog.getByRole("button", { name: "Replace file", exact: true }).click();
    const replaceDialog = page.getByRole("dialog", { name: "Replace import batch file" });
    await expect(replaceDialog).toBeVisible();
    await expect(replaceDialog.getByText("Replacement checkpoint", { exact: true })).toBeVisible();
    await expect(replaceDialog.getByText("Replacement file", { exact: true })).toBeVisible();
    await expect(replaceDialog.getByRole("button", { name: "Create replacement batch", exact: true })).toBeDisabled();
    await replaceDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(replaceDialog).not.toBeVisible();

    await detailsDialog.getByRole("button", { name: "Discard batch", exact: true }).click();
    const discardBatchDialog = page.getByRole("dialog", { name: "Discard import batch" });
    await expect(discardBatchDialog).toBeVisible();
    await expect(discardBatchDialog.getByText("Batch discard checkpoint", { exact: true })).toBeVisible();
    await expect(discardBatchDialog.getByText("Batch impact snapshot", { exact: true })).toBeVisible();
    await expect(discardBatchDialog.getByText("Next step after discard", { exact: true })).toBeVisible();
    await discardBatchDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(discardBatchDialog).not.toBeVisible();
  });

  test("shows locked-period guidance before the user attempts an upload", async ({ page, app }) => {
    await app.mockAuthenticatedShell({ lockedPeriod: true });
    await app.mockImportsApis();

    await page.goto("/imports");

    await expect(page.getByText("This period is locked. Unlock it before uploading any new files.")).toBeVisible();
    await expect(page.getByText("Locked for changes")).toBeVisible();
  });

  test("renders import history as stacked cards on mobile width", async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.mockAuthenticatedShell();
    await app.mockImportsApis();

    await page.goto("/imports");

    await expect(page.getByRole("heading", { name: "Import Center" })).toBeVisible();
    await expect(page.locator("table")).not.toBeVisible();
    await expect(page.getByText("sales_standard.csv").first()).toBeVisible();
    await expect(page.getByText("Valid / Invalid").first()).toBeVisible();
    await expect(page.locator('[data-testid="import-batch-open-batch-1"]:visible').first()).toBeVisible();
  });
});
