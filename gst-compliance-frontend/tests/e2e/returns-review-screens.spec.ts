import { expect, test } from "../fixtures/app-fixture";
import { ReturnReviewPage } from "../pages/return-review-page";

test.describe("Return review screens", () => {
  test("loads GSTR-1 review with focused export guidance and source documents", async ({ page, app }) => {
    const reviewPage = new ReturnReviewPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr1-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr1&tab=exports");

    await reviewPage.expectHeading("GSTR-1 Review");
    await expect(page.getByText("Focused review entry")).toBeVisible();
    await expect(page.getByText("Export section totals")).toBeVisible();
    await expect(page.getByText("Export-linked source documents")).toBeVisible();
    await expect(page.getByText("Export evidence still needs review")).toBeVisible();
  });

  test("lets the user switch GSTR-1 review tabs and return to the returns workspace", async ({ page, app }) => {
    const reviewPage = new ReturnReviewPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr1-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr1");

    await reviewPage.expectHeading("GSTR-1 Review");
    await expect(page.getByText("Current review risks")).toBeVisible();

    await page.getByRole("tab", { name: "HSN & Documents", exact: true }).click();
    await expect(page.getByText("HSN summary", { exact: true })).toBeVisible();
    await expect(page.getByText("Documents issued", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: /Use export and filing actions in Returns/i }).click();
    await expect(page).toHaveURL(/\/returns\?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr1$/);
  });

  test("loads GSTR-3B review with reconciliation, ITC, and exception context", async ({ page, app }) => {
    const reviewPage = new ReturnReviewPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr3b-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr3b&tab=reconciliation");

    await reviewPage.expectHeading("GSTR-3B Review");
    await expect(page.getByText("Focused review entry")).toBeVisible();
    await expect(page.getByText("Latest reconciliation run", { exact: true })).toBeVisible();
    await expect(page.getByText("Unresolved reconciliation rows", { exact: true })).toBeVisible();
    await expect(page.getByText("Manual ITC decision remains in scope")).toBeVisible();
  });

  test("lets the user switch GSTR-3B review tabs and inspect exception posture", async ({ page, app }) => {
    const reviewPage = new ReturnReviewPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr3b-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr3b");

    await reviewPage.expectHeading("GSTR-3B Review");
    await expect(page.getByText("Prepared GSTR-3B snapshot", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Exceptions", exact: true }).click();
    await expect(page.getByText("Period exceptions and context risks", { exact: true })).toBeVisible();
    await expect(page.getByText("Exception-focused warnings", { exact: true })).toBeVisible();
    await expect(page.getByText("Source period exceptions")).toBeVisible();
  });

  test("loads GSTR-7 review with deductee and source-import visibility", async ({ page, app }) => {
    const reviewPage = new ReturnReviewPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr7-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr7&tab=source-imports");

    await reviewPage.expectHeading("GSTR-7 Review");
    await expect(page.getByText("Source imports", { exact: true })).toBeVisible();
    await expect(page.getByText("tds_deducted_may.csv")).toBeVisible();
  });

  test("loads GSTR-9 review with annual source-month coverage", async ({ page, app }) => {
    const reviewPage = new ReturnReviewPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr9-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr9&tab=source-months");

    await reviewPage.expectHeading("GSTR-9 Review");
    await expect(page.getByText("Focused review entry")).toBeVisible();
    await expect(page.getByText("Source month coverage")).toBeVisible();
    await expect(page.getByText("Linked source returns")).toBeVisible();
    await expect(page.getByText("One monthly source period is missing")).toBeVisible();
  });

  test("lets the user switch GSTR-9 annual tabs and return to the returns workspace", async ({ page, app }) => {
    const reviewPage = new ReturnReviewPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr9-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr9");

    await reviewPage.expectHeading("GSTR-9 Review");
    await expect(page.getByText("Prepared GSTR-9 snapshot", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "ITC", exact: true }).click();
    await expect(page.getByText("Annual ITC summary", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Exceptions", exact: true }).click();
    await expect(page.getByText("Annual exception posture", { exact: true })).toBeVisible();
    await expect(page.getByText("Exception-focused warnings", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Return to returns workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/returns\?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr9$/);
  });

  test("loads GSTR-9C review with annual comparison details", async ({ page, app }) => {
    const reviewPage = new ReturnReviewPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr9c-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr9c&tab=comparison");

    await reviewPage.expectHeading("GSTR-9C Review");
    await expect(page.getByText("Focused review entry")).toBeVisible();
    await expect(page.getByText("Comparison details")).toBeVisible();
    await expect(page.getByText("Rs. 1,50,000.00")).toBeVisible();
    await expect(page.getByText("Rs. 25,000.00")).toBeVisible();
  });

  test("lets the user switch GSTR-9C annual comparison tabs", async ({ page, app }) => {
    const reviewPage = new ReturnReviewPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr9c-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr9c");

    await reviewPage.expectHeading("GSTR-9C Review");
    await expect(page.getByText("Annual comparison summary", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "GSTR-9 Base", exact: true }).click();
    await expect(page.getByText("Anchor GSTR-9 base", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Exceptions", exact: true }).click();
    await expect(page.getByText("Warnings and blockers", { exact: true })).toBeVisible();
    await expect(page.getByText("Source dependencies", { exact: true })).toBeVisible();
  });

  test("shows a full-context prompt before opening annual review pages", async ({ page, app }) => {
    await app.mockAuthenticatedShell({ noContext: true });
    await app.mockReturnReviewApis();

    await page.goto("/returns/gstr9-review");

    await expect(page.getByText("Choose a full workspace context")).toBeVisible();
    await expect(page.getByText("Select workspace, client, GSTIN, and period before reviewing a GSTR-9 draft.")).toBeVisible();
  });

  test("shows a clear no-draft state when a review draft is missing", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis({ missingDrafts: ["gstr9c"] });

    await page.goto("/returns/gstr9c-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1");

    await expect(page.getByText("No GSTR-9C draft found")).toBeVisible();
    await expect(page.getByText("Prepare a GSTR-9C return for the selected context before opening the review workspace.")).toBeVisible();
  });

  test("shows a clear error state when the GSTR-1 review workspace cannot be loaded", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis({ error: true });

    await page.goto("/returns/gstr1-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1&returnId=return-gstr1");

    await expect(page.getByText("We couldn’t load the GSTR-1 review workspace")).toBeVisible();
    await expect(page.getByText("Refresh the page or return to the returns workspace and try again.")).toBeVisible();
  });

  test("shows a clear no-draft state when the GSTR-3B review draft is missing", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis({ missingDrafts: ["gstr3b"] });

    await page.goto("/returns/gstr3b-review?workspace=workspace-1&client=client-1&gstin=gstin-1&period=period-1");

    await expect(page.getByText("No GSTR-3B draft found")).toBeVisible();
    await expect(page.getByText("Prepare a GSTR-3B return for the selected context before opening the review workspace.")).toBeVisible();
  });
});
