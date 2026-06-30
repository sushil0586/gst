import { expect, test } from "../fixtures/app-fixture";
import { GstinsPage } from "../pages/gstins-page";

test.describe("GSTIN management", () => {
  test("creates and updates a GSTIN for the active client", async ({ page, app }) => {
    const gstinsPage = new GstinsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();

    await gstinsPage.goto();
    await gstinsPage.expectReady();

    await gstinsPage.createGstin({
      gstin: "29AAACZ1234K1Z2",
      stateCode: "29",
      registrationType: "Composition",
      username: "zenith.portal",
    });

    await expect(page.getByText("GSTIN created successfully.")).toBeVisible();
    await expect(gstinsPage.row("29AAACZ1234K1Z2")).toBeVisible();
    await expect(gstinsPage.row("29AAACZ1234K1Z2").getByText("Composition")).toBeVisible();

    await gstinsPage.row("29AAACZ1234K1Z2").getByRole("button", { name: "Edit", exact: true }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit GSTIN" });
    await editDialog.getByLabel("State code", { exact: true }).fill("09");
    await editDialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "SEZ Unit", exact: true }).click();
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("GSTIN updated successfully.")).toBeVisible();
    await expect(gstinsPage.row("29AAACZ1234K1Z2").getByText("09")).toBeVisible();
    await expect(gstinsPage.row("29AAACZ1234K1Z2").getByText("SEZ Unit")).toBeVisible();
  });

  test("hides GSTIN management actions for view-only users", async ({ page, app }) => {
    await app.mockAuthenticatedShell({ limitedPermissions: true });
    await app.mockFoundationApis();

    await page.goto("/gstins");

    await expect(page.getByRole("main").getByRole("heading", { name: "GSTINs", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add GSTIN" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  });
});
