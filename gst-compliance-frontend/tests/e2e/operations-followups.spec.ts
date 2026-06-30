import { expect, test } from "../fixtures/app-fixture";
import { OperationalFollowUpsPage } from "../pages/operational-followups-page";

test.describe("Operational follow-ups", () => {
  test("creates, updates, logs contact, escalates, and completes a follow-up", async ({ page, app }) => {
    const followUpsPage = new OperationalFollowUpsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockOperationalFollowUpsApis();

    await followUpsPage.goto();
    await followUpsPage.expectReady();

    await page.getByRole("button", { name: "Create Follow-up", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Create operational follow-up" })).toBeVisible();

    await page.getByLabel("Title").fill("Need customer OTP for final filing");
    await page.getByLabel("Reason").fill("OTP confirmation is still pending before the filing can be completed.");
    await page.getByLabel("Next action").fill("Call the finance contact at 4 PM and confirm OTP readiness.");
    await page.getByRole("button", { name: "Create follow-up", exact: true }).click();

    await expect(page.getByText("Operational follow-up created.")).toBeVisible();

    await expect(page.getByText("Need customer OTP for final filing")).toBeVisible();

    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await expect(page.getByRole("dialog", { name: "Update operational follow-up" })).toBeVisible();
    await page.getByLabel("Reason").fill("OTP confirmation is still pending and the customer requested a callback.");
    await page.getByRole("button", { name: "Save follow-up", exact: true }).click();

    await expect(page.getByText("Operational follow-up updated.")).toBeVisible();
    await expect(page.getByText("OTP confirmation is still pending and the customer requested a callback.")).toBeVisible();

    await page.getByRole("button", { name: "Log Contact", exact: true }).first().click();
    await expect(page.getByText("Contact log saved.")).toBeVisible();

    await page.getByRole("button", { name: "Escalate", exact: true }).first().click();
    await expect(page.getByText("Operational follow-up escalated.")).toBeVisible();

    await page.getByRole("button", { name: "Complete", exact: true }).first().click();
    await expect(page.getByText("Operational follow-up completed.")).toBeVisible();
  });

  test("guides the user when workspace and client context are missing", async ({ page, app }) => {
    const followUpsPage = new OperationalFollowUpsPage(page);

    await app.mockAuthenticatedShell({ noContext: true });
    await app.mockOperationalFollowUpsApis();

    await followUpsPage.goto();
    await followUpsPage.expectReady();

    await expect(page.getByText("Select workspace and client first")).toBeVisible();
    await expect(page.getByText("Use the topbar context selectors before managing customer follow-ups.")).toBeVisible();
  });

  test("shows an empty state when no follow-ups exist", async ({ page, app }) => {
    const followUpsPage = new OperationalFollowUpsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockOperationalFollowUpsApis({ empty: true });

    await followUpsPage.goto();
    await followUpsPage.expectReady();

    await expect(page.getByText("No operational follow-ups yet")).toBeVisible();
    await expect(
      page.getByText("Create customer-facing follow-ups for pending filings, OTP coordination, data requests, or notice work."),
    ).toBeVisible();
  });

  test("shows a clear error state when follow-ups cannot be loaded", async ({ page, app }) => {
    const followUpsPage = new OperationalFollowUpsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockOperationalFollowUpsApis({ error: true });

    await followUpsPage.goto();
    await followUpsPage.expectReady();

    await expect(page.getByText("We couldn’t load this section")).toBeVisible();
    await expect(page.getByText("We couldn't load operational follow-ups right now.")).toBeVisible();
  });

  test("keeps the follow-up submit action disabled until required fields are entered", async ({ page, app }) => {
    const followUpsPage = new OperationalFollowUpsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockOperationalFollowUpsApis();

    await followUpsPage.goto();
    await followUpsPage.expectReady();

    await page.getByRole("button", { name: "Create Follow-up", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create operational follow-up" });
    await expect(dialog).toBeVisible();

    const submitButton = dialog.getByRole("button", { name: "Create follow-up", exact: true });
    await expect(submitButton).toBeDisabled();

    await dialog.getByLabel("Title").fill("Customer payment reminder");
    await expect(submitButton).toBeDisabled();

    await dialog.getByLabel("Reason").fill("Payment proof is still pending.");
    await expect(submitButton).toBeEnabled();
  });

  test("hides management actions for a low-access user", async ({ page, app }) => {
    const followUpsPage = new OperationalFollowUpsPage(page);

    await app.mockAuthenticatedShell({ limitedPermissions: true });
    await app.mockOperationalFollowUpsApis();

    await followUpsPage.goto();
    await followUpsPage.expectReady();

    await expect(page.getByRole("button", { name: "Create Follow-up", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Complete", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Escalate", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log Contact", exact: true })).toHaveCount(0);
  });
});
