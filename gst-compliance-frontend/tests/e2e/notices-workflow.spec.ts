import { expect, test } from "../fixtures/app-fixture";
import { NoticesPage } from "../pages/notices-page";

async function openDialogSelectOption(dialog: ReturnType<NoticesPage["noticeDialog"]>, label: string, optionName: string) {
  const field = dialog.locator("label").filter({ hasText: label }).first().locator("xpath=..");
  await field.getByRole("combobox").click();
  await dialog.page().getByRole("option", { name: optionName, exact: true }).click();
}

test.describe("Notices workflow", () => {
  test("creates, filters, and updates a notice from the register", async ({ page, app }) => {
    const noticesPage = new NoticesPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();
    await app.mockNoticesApis();

    await noticesPage.goto();
    await noticesPage.expectReady();

    await expect(page.getByRole("cell", { name: "ASMT-10/2026/1184" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "DRC-01/2026/44" })).toBeVisible();

    await page.getByPlaceholder("Search reference, title, or GSTIN").fill("DRC-01/2026/44");
    await expect(page.getByRole("cell", { name: "DRC-01/2026/44" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "ASMT-10/2026/1184" })).toHaveCount(0);

    await page.getByPlaceholder("Search reference, title, or GSTIN").fill("");

    await noticesPage.openCreateNotice();
    await expect(noticesPage.noticeDialog().getByRole("heading", { name: "Create notice" })).toBeVisible();

    await noticesPage.noticeDialog().getByLabel("Reference number").fill("REG-21/2026/900");
    await noticesPage.noticeDialog().getByLabel("Title").fill("Registration clarification needed");
    await noticesPage.noticeDialog().getByLabel("Response due date").fill("2026-06-25");
    await noticesPage.noticeDialog().getByLabel("Description").fill("Officer asked for additional registration support documents.");

    await openDialogSelectOption(noticesPage.noticeDialog(), "Status", "Escalated");

    await openDialogSelectOption(noticesPage.noticeDialog(), "Owner", "Senior Reviewer");

    await noticesPage.noticeDialog().getByRole("button", { name: "Create notice" }).click();
    await expect(page.getByText("Notice created.")).toBeVisible();

    const createdRow = page.getByRole("row", { name: /REG-21\/2026\/900/ });
    await expect(createdRow).toBeVisible();
    await expect(createdRow).toContainText("Registration clarification needed");
    await expect(createdRow).toContainText("Senior Reviewer");
    await expect(createdRow).toContainText("escalated");

    await createdRow.getByRole("button", { name: "Update" }).click();
    await expect(noticesPage.noticeDialog().getByRole("heading", { name: "Update notice" })).toBeVisible();

    await noticesPage.noticeDialog().getByLabel("Title").fill("Registration clarification resolved");
    await openDialogSelectOption(noticesPage.noticeDialog(), "Status", "Closed");
    await noticesPage.noticeDialog().getByRole("button", { name: "Update notice" }).click();

    await expect(page.getByText("Notice updated.")).toBeVisible();
    await expect(createdRow).toContainText("Registration clarification resolved");
    await expect(createdRow).toContainText("closed");
  });

  test("hides notice management actions for a low-access user", async ({ page, app }) => {
    const noticesPage = new NoticesPage(page);

    await app.mockAuthenticatedShell({ limitedPermissions: true });
    await app.mockFoundationApis();
    await app.mockNoticesApis();

    await noticesPage.goto();
    await noticesPage.expectReady();

    await expect(page.getByRole("button", { name: "Add Notice" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sync WhiteBooks" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create Follow-up" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Update" })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "ASMT-10/2026/1184" })).toBeVisible();
  });

  test("syncs WhiteBooks notices into the register", async ({ page, app }) => {
    const noticesPage = new NoticesPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();
    await app.mockNoticesApis();

    await noticesPage.goto();
    await noticesPage.expectReady();

    await page.getByRole("button", { name: "Sync WhiteBooks" }).click();

    await expect(page.getByText("WhiteBooks notices synced. 1 created, 0 updated, 0 skipped.")).toBeVisible();
    const syncedRow = page.getByRole("row", { name: /WB-NTC-2026-01/ });
    await expect(syncedRow).toBeVisible();
    await expect(syncedRow).toContainText("WhiteBooks");
    await expect(syncedRow).toContainText("ASMT-10");
    await expect(syncedRow).toContainText("Portal: OPEN");
  });

  test("shows notice sync history from the register", async ({ page, app }) => {
    const noticesPage = new NoticesPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();
    await app.mockNoticesApis();

    await noticesPage.goto();
    await noticesPage.expectReady();

    await page.getByRole("button", { name: "Sync WhiteBooks" }).click();
    const syncedRow = page.getByRole("row", { name: /WB-NTC-2026-01/ });
    await expect(syncedRow).toBeVisible();

    await syncedRow.getByRole("button", { name: "History" }).click();

    await expect(page.getByRole("heading", { name: "Notice history" })).toBeVisible();
    await expect(page.getByText("List sync")).toBeVisible();
    await expect(page.getByText("WhiteBooks notices synced for 30/08/2026.")).toBeVisible();
    await expect(page.getByText(/created count: 1/)).toBeVisible();
  });

  test("fetches WhiteBooks notice detail and surfaces provider evidence", async ({ page, app }) => {
    const noticesPage = new NoticesPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();
    await app.mockNoticesApis();

    await noticesPage.goto();
    await noticesPage.expectReady();

    await page.getByRole("button", { name: "Sync WhiteBooks" }).click();
    const syncedRow = page.getByRole("row", { name: /WB-NTC-2026-01/ });
    await expect(syncedRow).toBeVisible();

    await syncedRow.getByRole("button", { name: "Fetch Detail" }).click();
    await expect(page.getByText("WhiteBooks notice detail fetched.")).toBeVisible();
    await expect(syncedRow).toContainText("Portal: REPLIED");

    await syncedRow.getByRole("button", { name: "Update" }).click();
    const dialog = noticesPage.noticeDialog();
    await expect(dialog.getByText("Portal reference")).toBeVisible();
    await expect(dialog.getByText("WB-NTC-2026-01")).toBeVisible();
    await expect(dialog.getByText("Portal status")).toBeVisible();
    await expect(dialog.getByText("REPLIED")).toBeVisible();
    await expect(dialog.getByText("Detail fetched")).toBeVisible();
    await expect(dialog.getByText("30 Aug 2026")).toBeVisible();
  });

  test("creates a notice-linked operational follow-up from the register", async ({ page, app }) => {
    const noticesPage = new NoticesPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();
    await app.mockNoticesApis();

    await noticesPage.goto();
    await noticesPage.expectReady();

    const noticeRow = page.getByRole("row", { name: /ASMT-10\/2026\/1184/ });
    await expect(noticeRow).toBeVisible();
    await expect(noticeRow).toContainText("0 open");

    await noticeRow.getByRole("button", { name: "Create Follow-up" }).click();

    await expect(page.getByText("Notice follow-up created.")).toBeVisible();
    await expect(noticeRow).toContainText("1 open");
    await expect(noticeRow).toContainText("Notice follow-up: ASMT-10/2026/1184");
  });

  test("shows a clear error state when notices cannot be loaded", async ({ page, app }) => {
    const noticesPage = new NoticesPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();
    await app.mockNoticesApis({ error: true });

    await noticesPage.goto();
    await noticesPage.expectReady();

    await expect(page.getByText("We couldn’t load this section")).toBeVisible();
    await expect(page.getByText("Something went wrong.")).toBeVisible();
  });

  test("keeps the create notice dialog open when required fields are missing", async ({ page, app }) => {
    const noticesPage = new NoticesPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();
    await app.mockNoticesApis();

    await noticesPage.goto();
    await noticesPage.expectReady();

    await noticesPage.openCreateNotice();
    const dialog = noticesPage.noticeDialog();
    await expect(dialog.getByRole("heading", { name: "Create notice" })).toBeVisible();

    await dialog.getByRole("button", { name: "Create notice" }).click();

    await expect(page.getByText("Select a GSTIN and fill the reference number plus title before creating a notice.")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Reference number")).toHaveValue("");
    await expect(dialog.getByLabel("Title")).toHaveValue("");
  });

  test("@launch shows launch-ready notice posture with overdue visibility and live owner reassignment", async ({ page, app }) => {
    const noticesPage = new NoticesPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();
    await app.mockNoticesApis();

    await noticesPage.goto();
    await noticesPage.expectReady();

    await expect(page.getByText("Operational posture", { exact: true })).toBeVisible();
    await expect(page.getByText("Use these live metrics to see where notice response work needs immediate attention.")).toBeVisible();
    await expect(page.getByText("Open notices", { exact: true })).toBeVisible();
    await expect(page.getByText("Escalated", { exact: true })).toBeVisible();
    await expect(page.getByText("Assigned owners", { exact: true })).toBeVisible();
    await expect(page.getByText("Overdue responses", { exact: true })).toBeVisible();
    await expect(page.getByText("Ownership rule", { exact: true })).toBeVisible();

    const overdueRow = page.getByRole("row", { name: /ASMT-10\/2026\/1184/ });
    await expect(overdueRow).toBeVisible();
    await expect(overdueRow).toContainText("Overdue");
    await expect(overdueRow).toContainText("Filer User");

    await overdueRow.getByRole("button", { name: "Update" }).click();
    const dialog = noticesPage.noticeDialog();
    await expect(dialog.getByRole("heading", { name: "Update notice" })).toBeVisible();
    await expect(dialog.getByText("GSTIN stays locked during updates so the notice history remains traceable.")).toBeVisible();

    await openDialogSelectOption(dialog, "Owner", "Senior Reviewer");
    await dialog.getByRole("button", { name: "Update notice" }).click();

    await expect(page.getByText("Notice updated.")).toBeVisible();
    await expect(overdueRow).toContainText("Senior Reviewer");
    await expect(overdueRow).toContainText("open");
  });
});
