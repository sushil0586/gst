import { expect, test } from "../fixtures/app-fixture";

test.describe("Workspace management", () => {
  test("validates required workspace fields before create and lets the operator recover", async ({ page, app }) => {
    await app.mockAuthenticatedShell();

    let createRequests = 0;

    await page.route(/\/api\/backend\/workspaces\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "POST") {
        createRequests += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "success",
            message: "Success",
            data: {
              id: "workspace-2",
              organization: "org-1",
              name: "Delhi Office",
              code: "DELHI",
              timezone: "Asia/Kolkata",
              is_active: true,
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [{
            id: "workspace-1",
            organization: "org-1",
            name: "Primary Workspace",
            code: "PRIMARY",
            timezone: "Asia/Kolkata",
            is_active: true,
            office_label: "Acme Org",
            address_line_1: "",
            address_line_2: "",
            city: "",
            state: "",
            postal_code: "",
            contact_email: "",
            contact_phone: "",
          }],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.goto("/settings/workspaces");

    await expect(page.getByRole("main").getByRole("heading", { name: "Workspace Management", exact: true })).toBeVisible();

    await page.getByLabel("Workspace name").fill("");
    await page.getByLabel("Workspace code").fill("");
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();

    await expect(page.getByText("Please complete: workspace name, workspace code.")).toBeVisible();
    expect(createRequests).toBe(0);

    await page.getByLabel("Workspace name").fill("Delhi Office");
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();

    await expect(page.getByText("Workspace created.")).toBeVisible();
    expect(createRequests).toBe(1);
  });

  test("opens inline workspace edit, saves changes, and shows operator shortcut links", async ({ page, app }) => {
    await app.mockAuthenticatedShell();

    let workspaces = [{
      id: "workspace-1",
      organization: "org-1",
      name: "Primary Workspace",
      code: "PRIMARY",
      timezone: "Asia/Kolkata",
      is_active: true,
      office_label: "Acme Org",
      address_line_1: "",
      address_line_2: "",
      city: "",
      state: "",
      postal_code: "",
      contact_email: "",
      contact_phone: "",
    }];

    await page.route(/\/api\/backend\/workspaces\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: workspaces,
          pagination: { count: workspaces.length, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/workspaces\/[^/]+\/$/, async (route) => {
      const payload = route.request().postDataJSON() as Record<string, string>;
      workspaces = workspaces.map((workspace) =>
        workspace.id === "workspace-1"
          ? {
              ...workspace,
              ...payload,
            }
          : workspace,
      );

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: workspaces[0],
        }),
      });
    });

    await page.goto("/settings/workspaces");

    await page.getByRole("button", { name: "Edit workspace", exact: true }).click();
    await expect(page.getByLabel("Workspace name")).toHaveValue("Primary Workspace");
    await expect(page.getByRole("button", { name: "Save workspace", exact: true })).toBeVisible();
    await page.getByLabel("Workspace name").fill("North Office");
    await page.getByLabel("Office phone").fill("+91 11 4000 1234");
    await page.getByRole("button", { name: "Save workspace", exact: true }).click();

    await expect(page.getByText("Workspace updated.")).toBeVisible();
    await expect(page.getByRole("main").getByText("North Office", { exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByText("+91 11 4000 1234", { exact: true })).toBeVisible();

    await expect(page.getByRole("link", { name: "Open clients", exact: true })).toHaveAttribute("href", "/clients");
    await expect(page.getByRole("link", { name: "Open team management", exact: true })).toHaveAttribute("href", "/settings/team");
  });

  test("shows fallback error guidance when workspace data cannot refresh", async ({ page, app }) => {
    await app.mockAuthenticatedShell();

    await page.route(/\/api\/backend\/workspaces\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Workspace service unavailable" }),
      });
    });

    await page.route(/\/api\/backend\/organizations\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Organization service unavailable" }),
      });
    });

    await page.goto("/settings/workspaces");

    await expect(page.getByRole("main").getByRole("heading", { name: "Workspace Management", exact: true })).toBeVisible();
    await expect(page.getByText("We couldn't refresh live workspace details right now. Showing the workspaces available in your current signed-in session.")).toBeVisible();
    await expect(page.getByText("Session view", { exact: true })).toBeVisible();
  });

  test("requires confirmation before deactivating a workspace", async ({ page, app }) => {
    await app.mockAuthenticatedShell();

    let deleteRequests = 0;

    await page.route(/\/api\/backend\/workspaces\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [{
            id: "workspace-1",
            organization: "org-1",
            name: "Primary Workspace",
            code: "PRIMARY",
            timezone: "Asia/Kolkata",
            is_active: true,
            office_label: "Acme Org",
            address_line_1: "",
            address_line_2: "",
            city: "",
            state: "",
            postal_code: "",
            contact_email: "",
            contact_phone: "",
          }],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/workspaces\/[^/]+\/$/, async (route) => {
      if (route.request().method() === "DELETE") {
        deleteRequests += 1;
      }
      await route.fulfill({
        status: 204,
        contentType: "application/json",
        body: "",
      });
    });

    await page.goto("/settings/workspaces");

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Deactivate Primary Workspace?");
      await dialog.dismiss();
    });

    await page.getByRole("button", { name: "Deactivate", exact: true }).click();
    await expect(page.getByRole("main").getByRole("heading", { name: "Workspace Management", exact: true })).toBeVisible();
    expect(deleteRequests).toBe(0);
  });
});
