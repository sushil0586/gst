import { expect, test } from "../fixtures/app-fixture";
import { CompliancePeriodsPage } from "../pages/compliance-periods-page";

test.describe("Compliance periods", () => {
  test("creates, edits, and lock-toggles a compliance period", async ({ page, app }) => {
    const periodsPage = new CompliancePeriodsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();

    await periodsPage.goto();
    await periodsPage.expectReady();

    await periodsPage.createPeriod({
      period: "2026-06",
      dueDate: "2026-07-20",
      returnType: "GSTR-1",
      status: "In Progress",
    });

    await expect(page.getByText("Compliance period created successfully.")).toBeVisible();
    await expect(periodsPage.row("2026-06")).toBeVisible();

    await periodsPage.row("2026-06").getByRole("button", { name: "Edit", exact: true }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit compliance period" });
    await editDialog.getByLabel("Due date", { exact: true }).fill("2026-07-25");
    await editDialog.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: "Closed", exact: true }).click();
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Compliance period updated successfully.")).toBeVisible();
    await expect(periodsPage.row("2026-06").getByText("closed")).toBeVisible();

    await periodsPage.row("2026-06").getByRole("button", { name: "Lock", exact: true }).click();
    await expect(page.getByText("Compliance period locked.")).toBeVisible();
    await expect(periodsPage.row("2026-06").getByText("Locked")).toBeVisible();

    await periodsPage.row("2026-06").getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByText("Compliance period unlocked.")).toBeVisible();
  });

  test("prevents unlock actions when the user lacks settings access", async ({ page, app }) => {
    await app.mockAuthenticatedShell({
      customPermissions: ["view_client", "prepare_return"],
      lockedPeriod: true,
    });
    await app.mockFoundationApis({ lockedPeriod: true });

    await page.goto("/compliance-periods");

    const lockedRow = page.getByRole("row").filter({ hasText: "2026-05" });
    await expect(page.getByRole("button", { name: "Add Period" })).toBeVisible();
    await expect(lockedRow.getByRole("button", { name: "Unlock", exact: true })).toBeDisabled();
  });
});
