import { expect, test } from "@playwright/test";

import { getLiveCredentials } from "../fixtures/live-env";
import { LoginPage } from "../pages/login-page";

const live = getLiveCredentials();

test.describe("Live notices and audit", () => {
  test.skip(!live, "Set PLAYWRIGHT_BASE_URL, PLAYWRIGHT_LIVE_EMAIL, and PLAYWRIGHT_LIVE_PASSWORD to run live notices-and-audit tests.");

  test("shows notice empty state and opens the add-notice modal", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/notices");
    await expect(page.getByRole("main").getByRole("heading", { name: "Notices", exact: true })).toBeVisible();
    await expect(page.getByText("No notices found", { exact: true })).toBeVisible();
    await expect(page.getByText("No live notices match the current filters for this client context.", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add Notice", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "Create notice" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("GSTIN");
    await expect(dialog).toContainText("29ABCDE1234F1Z5");
    await expect(dialog).toContainText("Owner");
    await expect(dialog).toContainText("Unassigned");
    await expect(dialog).toContainText("Notices remain tied to a GSTIN so response tracking stays audit-ready.");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("filters audit logs, shows empty-state guidance, opens detail, and exports xlsx", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/audit-trail");
    await expect(page.getByRole("main").getByRole("heading", { name: "Audit Trail", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: /import\.uploaded/i }).first()).toBeVisible();

    await page.getByPlaceholder("Action contains...").fill("nonexistent-event");
    await expect(page.getByText("No audit logs match these filters", { exact: true })).toBeVisible();
    await expect(page.getByText("Try broadening the date range or clearing action/work item filters.", { exact: true })).toBeVisible();

    await page.getByPlaceholder("Action contains...").fill("");
    await expect(page.getByRole("cell", { name: /import\.uploaded/i }).first()).toBeVisible();

    await page.getByRole("button", { name: "View", exact: true }).first().click();
    const auditDialog = page.getByRole("dialog", { name: "Audit event detail" });
    await expect(auditDialog).toBeVisible();
    await expect(auditDialog.getByText("Metadata", { exact: true })).toBeVisible();
    await expect(auditDialog).toContainText("sales_standard.csv");
    await auditDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(auditDialog).not.toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export XLSX", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("audit-logs.xlsx");
  });
});
