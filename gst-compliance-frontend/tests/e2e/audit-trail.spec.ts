import { expect, test } from "../fixtures/app-fixture";
import { AuditTrailPage } from "../pages/audit-trail-page";

test.describe("Audit trail", () => {
  test("filters the audit stream and opens event detail", async ({ page, app }) => {
    const auditTrailPage = new AuditTrailPage(page);

    await app.mockAuthenticatedShell();
    await app.mockAuditApis();

    await auditTrailPage.goto();
    await auditTrailPage.expectReady();

    await expect(page.getByRole("cell", { name: "Owner Accounts" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Filer User" })).toBeVisible();

    await page.getByPlaceholder("Action contains...").fill("notice");
    await expect(page.getByRole("cell", { name: "notice.updated" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "return.prepared" })).toHaveCount(0);

    await page.getByPlaceholder("Work item type...").fill("notice");

    const filteredRow = page.getByRole("row", { name: /Filer User/ });
    await filteredRow.getByRole("button", { name: "View" }).click();

    await expect(auditTrailPage.detailDialog().getByRole("heading", { name: "Audit event detail" })).toBeVisible();
    await expect(auditTrailPage.detailDialog().getByText("notice.updated")).toBeVisible();
    await expect(auditTrailPage.detailDialog().getByText("Filer User")).toBeVisible();
    await expect(auditTrailPage.detailDialog().getByText('"status": "open"')).toBeVisible();
    await expect(auditTrailPage.detailDialog().getByText('"status": "responded"').first()).toBeVisible();
  });

  test("shows an empty state when audit filters remove every event", async ({ page, app }) => {
    const auditTrailPage = new AuditTrailPage(page);

    await app.mockAuthenticatedShell();
    await app.mockAuditApis();

    await auditTrailPage.goto();
    await auditTrailPage.expectReady();

    await page.getByPlaceholder("Action contains...").fill("nonexistent-event");

    await expect(page.getByText("No audit logs match these filters")).toBeVisible();
    await expect(page.getByText("Try broadening the date range or clearing action/work item filters.")).toBeVisible();
  });

  test("shows a clear error state when audit logs cannot be loaded", async ({ page, app }) => {
    const auditTrailPage = new AuditTrailPage(page);

    await app.mockAuthenticatedShell();
    await app.mockAuditApis({ error: true });

    await auditTrailPage.goto();
    await auditTrailPage.expectReady();

    await expect(page.getByText("We couldn’t load this section")).toBeVisible();
    await expect(page.getByText("Something went wrong.")).toBeVisible();
  });
});
