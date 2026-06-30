import { expect, test } from "@playwright/test";

import { getLiveCredentials } from "../fixtures/live-env";
import { LoginPage } from "../pages/login-page";

const live = getLiveCredentials();

test.describe("Live operations support", () => {
  test.skip(!live, "Set PLAYWRIGHT_BASE_URL, PLAYWRIGHT_LIVE_EMAIL, and PLAYWRIGHT_LIVE_PASSWORD to run live operations-support tests.");

  test("shows stable empty states in operations and approvals", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/operations");
    await expect(page.getByRole("main").getByRole("heading", { name: "Filing Operations", exact: true })).toBeVisible();
    await expect(page.getByText("No filing operations match these filters", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Try broadening the queue scope or clearing status filters to bring more filing states into view.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Open Follow-ups", exact: true }).click();
    await expect(page).toHaveURL(/\/operations\/follow-ups$/);

    await page.goto("/approvals");
    await expect(page.getByRole("main").getByRole("heading", { name: "Approvals", exact: true })).toBeVisible();
    await expect(page.getByText("No approvals found", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Approval requests will appear here when returns or other entities are sent for review.", { exact: true }),
    ).toBeVisible();
  });

  test("opens follow-up creation and audit event detail from live queues", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/operations/follow-ups");
    await expect(page.getByRole("main").getByRole("heading", { name: "Operational Follow-ups", exact: true })).toBeVisible();
    await expect(page.getByText("No operational follow-ups yet", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create Follow-up", exact: true }).click();

    const followUpDialog = page.getByRole("dialog", { name: "Create operational follow-up" });
    await expect(followUpDialog).toBeVisible();
    await expect(followUpDialog.getByText("No saved contact", { exact: true })).toBeVisible();
    await expect(followUpDialog).toContainText("Assigned to");
    await expect(followUpDialog).toContainText("Unassigned");
    await followUpDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(followUpDialog).not.toBeVisible();

    await page.goto("/audit-trail");
    await expect(page.getByRole("main").getByRole("heading", { name: "Audit Trail", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: /import\.uploaded/i }).first()).toBeVisible();
    await page.getByRole("button", { name: "View", exact: true }).first().click();

    const auditDialog = page.getByRole("dialog", { name: "Audit event detail" });
    await expect(auditDialog).toBeVisible();
    await expect(auditDialog.getByText("Metadata", { exact: true })).toBeVisible();
    await expect(auditDialog.getByText("Before state", { exact: true })).toBeVisible();
    await expect(auditDialog.getByText("After state", { exact: true })).toBeVisible();
    await expect(auditDialog).toContainText("sales_standard.csv");
  });
});
