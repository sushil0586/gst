import { expect, test } from "../fixtures/app-fixture";
import { NoticesPage } from "../pages/notices-page";

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

    await noticesPage.noticeDialog().getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Escalated" }).click();

    await noticesPage.noticeDialog().getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: "Senior Reviewer" }).click();

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
    await noticesPage.noticeDialog().getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Closed" }).click();
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
    await expect(page.getByRole("button", { name: "Update" })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "ASMT-10/2026/1184" })).toBeVisible();
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
});
