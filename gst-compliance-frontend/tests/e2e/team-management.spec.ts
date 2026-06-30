import { expect, test } from "../fixtures/app-fixture";
import { TeamManagementPage } from "../pages/team-management-page";

test.describe("Team management", () => {
  test("requires confirmation before deactivating a workspace member", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockWorkspaceMembersApis();

    let deleteRequests = 0;
    await page.route(/\/api\/backend\/workspace-members\/[^/]+\/$/, async (route) => {
      if (route.request().method() === "DELETE") {
        deleteRequests += 1;
      }
      await route.fallback();
    });

    await page.goto("/settings/team");
    await expect(page.getByRole("heading", { name: "Team Management" })).toBeVisible();

    const targetRow = page.getByRole("row").filter({ hasText: "seniorca@example.com" });
    await targetRow.getByRole("button", { name: "Deactivate", exact: true }).click();

    const confirmationDialog = page.getByRole("dialog", { name: "Deactivate workspace member" });
    await expect(confirmationDialog).toBeVisible();
    await expect(confirmationDialog).toContainText("Senior Reviewer");
    await expect(confirmationDialog.getByRole("button", { name: "Confirm deactivation", exact: true })).toBeVisible();
    expect(deleteRequests).toBe(0);

    await confirmationDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirmationDialog).not.toBeVisible();
    await expect(targetRow).toBeVisible();
    expect(deleteRequests).toBe(0);
  });

  test("adds, edits, and deactivates workspace members", async ({ page, app }) => {
    const teamPage = new TeamManagementPage(page);

    await app.mockAuthenticatedShell();
    await app.mockWorkspaceMembersApis();

    await teamPage.goto();
    await expect(page.getByRole("heading", { name: "Team Management" })).toBeVisible();

    await teamPage.addMember({
      email: "reviewer@example.com",
      firstName: "Riya",
      lastName: "Reviewer",
      role: "Reviewer",
      password: "temp-pass-123",
    });
    await expect(page.getByText("Workspace member added.")).toBeVisible();
    await teamPage.expectMemberVisible("reviewer@example.com");

    await teamPage.editMember("reviewer@example.com", {
      firstName: "Riya Updated",
      role: "Senior CA",
    });
    await expect(page.getByText("Workspace member updated.")).toBeVisible();
    await expect(page.getByText("Riya Updated Reviewer")).toBeVisible();

    await teamPage.deactivateMember("reviewer@example.com");
    await expect(page.getByText("Workspace member deactivated.")).toBeVisible();
    await expect(page.getByText("reviewer@example.com")).not.toBeVisible();
  });

  test("hides member-management actions for a low-access user", async ({ page, app }) => {
    await app.mockAuthenticatedShell({ limitedPermissions: true });
    await app.mockWorkspaceMembersApis();

    await page.goto("/settings/team");
    await expect(page.getByRole("heading", { name: "Team Management" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Member" })).toHaveCount(0);
  });

  test("shows an API error and keeps the add-member dialog open when member creation fails", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockWorkspaceMembersApis();

    await page.route(/\/api\/backend\/workspace-members\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Member service unavailable" }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("/settings/team");
    await expect(page.getByRole("heading", { name: "Team Management" })).toBeVisible();

    await page.getByRole("button", { name: "Add Member", exact: true }).click();
    const memberDialog = page.getByRole("dialog", { name: "Add workspace member" });
    await expect(memberDialog).toBeVisible();

    await memberDialog.getByLabel("Email").fill("ops-reviewer@example.com");
    await memberDialog.getByLabel("First name").fill("Ops");
    await memberDialog.getByLabel("Last name").fill("Reviewer");
    await memberDialog.getByLabel("Initial password").fill("temp-pass-123");
    await memberDialog.getByRole("button", { name: "Add member", exact: true }).click();

    await expect(memberDialog).toBeVisible();
    await expect(page.getByText("Workspace member added.")).toHaveCount(0);
    await expect(memberDialog.getByLabel("Email")).toHaveValue("ops-reviewer@example.com");
  });
});
