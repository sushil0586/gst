import { expect, test } from "../fixtures/app-fixture";
import { ReturnStatusPage } from "../pages/return-status-page";

test.describe("Return status register", () => {
  test("filters blocked returns and creates a follow-up from a return row", async ({ page, app }) => {
    const returnStatusPage = new ReturnStatusPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnStatusReportApis();

    await returnStatusPage.goto();
    await returnStatusPage.expectReady();

    await expect(page.getByRole("row", { name: /Acme Client Private Limited/ }).first()).toBeVisible();
    await expect(page.getByText("Need signed approval on draft numbers")).toBeVisible();

    await page.getByText("Status bucket").locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "Blocked" }).click();
    await page.getByText("Pending with").locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "Customer" }).click();
    await page.getByText("Visibility").locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "Only overdue rows" }).click();

    const blockedRow = page.getByRole("row", { name: /Need signed approval on draft numbers/ });
    await expect(blockedRow).toBeVisible();
    await expect(page.getByText("AA270625000123A")).toHaveCount(0);

    await blockedRow.getByRole("button", { name: "Create follow-up" }).click();

    await expect(returnStatusPage.followUpDialog().getByRole("heading", { name: "Create follow-up from return row" })).toBeVisible();
    await returnStatusPage.followUpDialog().getByLabel("Title").fill("Need final approval before filing");
    await returnStatusPage.followUpDialog().getByLabel("Reason").fill("Customer still has not approved the final draft.");
    await returnStatusPage.followUpDialog().getByText("Assigned to").locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "Senior Reviewer • senior_ca" }).click();
    await returnStatusPage.followUpDialog().getByRole("button", { name: "Create follow-up" }).click();

    await expect(page.getByText("Operational follow-up created from return status register.")).toBeVisible();
  });

  test("shows an empty state when no return rows match the current scope", async ({ page, app }) => {
    const returnStatusPage = new ReturnStatusPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnStatusReportApis({ empty: true });

    await returnStatusPage.goto();
    await returnStatusPage.expectReady();

    await expect(page.getByText("No return status rows match this scope")).toBeVisible();
    await expect(page.getByText("Create compliance periods, returns, or customer follow-ups to start managing this register.")).toBeVisible();
  });

  test("shows a stable error state when the register cannot be loaded", async ({ page, app }) => {
    const returnStatusPage = new ReturnStatusPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnStatusReportApis({ error: true });

    await returnStatusPage.goto();
    await returnStatusPage.expectReady();

    await expect(page.getByText("We couldn't load the return status register right now.")).toBeVisible();
  });

  test("shows validation feedback when a return follow-up is submitted without required fields", async ({ page, app }) => {
    const returnStatusPage = new ReturnStatusPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnStatusReportApis();

    await returnStatusPage.goto();
    await returnStatusPage.expectReady();

    const blockedRow = page.getByRole("row", { name: /Need signed approval on draft numbers/ });
    await blockedRow.getByRole("button", { name: "Create follow-up" }).click();

    const dialog = returnStatusPage.followUpDialog();
    await expect(dialog.getByRole("heading", { name: "Create follow-up from return row" })).toBeVisible();
    await dialog.getByLabel("Title").fill("");
    await dialog.getByLabel("Reason").fill("");
    await dialog.getByLabel("Due time").fill("");
    await dialog.getByRole("button", { name: "Create follow-up" }).click();

    await expect(page.getByText("Title, reason, and due time are required.")).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});
