import { expect, test } from "../fixtures/app-fixture";

test.describe("Settings launch smoke", () => {
  test("@launch shows the administration hub and routes operators into supported settings workflows", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();

    await page.goto("/settings");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(
      main.getByText(
        "Manage workspace control, access, security, and operational readiness from one launch-ready administration hub.",
        { exact: true },
      ),
    ).toBeVisible();

    await expect(main.getByText("Administration hub", { exact: true })).toBeVisible();
    await expect(
      main.getByText(
        "Use these settings surfaces to control who has access, which workspaces are active, and how launch operations stay supportable.",
        { exact: true },
      ),
    ).toBeVisible();

    await expect(main.getByText("Workspace management", { exact: true })).toBeVisible();
    await expect(main.getByText("Team management", { exact: true })).toBeVisible();
    await expect(main.getByText("Pilot readiness", { exact: true })).toBeVisible();
    await expect(main.getByText("User guide & UAT", { exact: true })).toBeVisible();
    await expect(main.getByText("Change password", { exact: true }).first()).toBeVisible();

    await expect(main.getByRole("link", { name: "Open workspaces", exact: true })).toHaveAttribute("href", "/settings/workspaces");
    await expect(main.getByRole("link", { name: "Open team", exact: true })).toHaveAttribute("href", "/settings/team");
    await expect(main.getByRole("link", { name: "Open readiness", exact: true })).toHaveAttribute("href", "/settings/pilot-readiness");
    await expect(main.getByRole("link", { name: "Open guide", exact: true })).toHaveAttribute("href", "/settings/user-guide");
    await expect(main.getByRole("link", { name: "Change password", exact: true })).toHaveAttribute("href", "/settings/change-password");

    await expect(main.getByText("Launch standard", { exact: true })).toBeVisible();
    await expect(
      main.getByText(
        "This settings area is part of the released product surface and should be treated as an operational control center.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      main.getByText(
        "Settings now acts as the operational entry point for access control, workspace administration, and release-readiness support.",
        { exact: true },
      ),
    ).toBeVisible();

    await main.getByRole("link", { name: "Open workspaces", exact: true }).click();
    await expect(page).toHaveURL("/settings/workspaces");
    await expect(page.getByRole("main").getByRole("heading", { name: "Workspace Management", exact: true })).toBeVisible();

    await page.goto("/settings");
    await main.getByRole("link", { name: "Open team", exact: true }).click();
    await expect(page).toHaveURL("/settings/team");
    await expect(page.getByRole("main").getByRole("heading", { name: "Team Management", exact: true })).toBeVisible();
  });
});
