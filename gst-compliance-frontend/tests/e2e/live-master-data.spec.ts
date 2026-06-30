import { expect, test } from "@playwright/test";

import { getLiveCredentials } from "../fixtures/live-env";
import { LoginPage } from "../pages/login-page";

const live = getLiveCredentials();

test.describe("Live master data", () => {
  test.skip(!live, "Set PLAYWRIGHT_BASE_URL, PLAYWRIGHT_LIVE_EMAIL, and PLAYWRIGHT_LIVE_PASSWORD to run live master-data tests.");

  test("searches clients and validates the add-client form without creating data", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/clients");
    await expect(page.getByRole("main").getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
    await expect(page.getByText("Demo Client Private Limited", { exact: true })).toBeVisible();

    await page.getByPlaceholder("Search by client name, code, PAN, trade name, or email").fill("nonexistent-client");
    await expect(page.getByRole("heading", { name: "No matching client found", exact: true })).toBeVisible();
    await expect(page.getByText("Try a different name, code, PAN, or email to find the client you want to work on.", { exact: true })).toBeVisible();

    await page.getByPlaceholder("Search by client name, code, PAN, trade name, or email").fill("");
    await page.getByRole("button", { name: "Add Client", exact: true }).click();

    const clientDialog = page.getByRole("dialog", { name: "Create client" });
    await expect(clientDialog).toBeVisible();
    await expect(clientDialog).toContainText("GSTIN lookup assist");
    await expect(clientDialog).toContainText("Create GSTIN now");

    await clientDialog.getByLabel("Legal name").fill("A");
    await clientDialog.getByLabel("Client code").fill("Z");
    await clientDialog.getByLabel("PAN").fill("123");
    await clientDialog.getByLabel("Email").fill("bad-email");
    await clientDialog.getByRole("button", { name: "Create client", exact: true }).click();

    await expect(clientDialog.getByText("Legal name is required.", { exact: true })).toBeVisible();
    await expect(clientDialog.getByText("Client code is required.", { exact: true })).toBeVisible();
    await expect(clientDialog.getByText("PAN must be 10 characters.", { exact: true })).toBeVisible();
    await expect(clientDialog.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
    await clientDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  test("opens GSTIN and compliance-period forms in edit mode without saving changes", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/gstins");
    await expect(page.getByRole("main").getByRole("heading", { name: "GSTINs", exact: true })).toBeVisible();
    await expect(page.getByText("29ABCDE1234F1Z5", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    const gstinDialog = page.getByRole("dialog", { name: "Edit GSTIN" });
    await expect(gstinDialog).toBeVisible();
    await expect(gstinDialog).toContainText("Customer GST portal username (Recommended)");
    await expect(gstinDialog.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
    await gstinDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(gstinDialog).not.toBeVisible();

    await page.goto("/compliance-periods");
    await expect(page.getByRole("main").getByRole("heading", { name: "Compliance Periods", exact: true })).toBeVisible();
    await expect(page.getByText("2026-04", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    const periodDialog = page.getByRole("dialog", { name: "Edit compliance period" });
    await expect(periodDialog).toBeVisible();
    await expect(periodDialog).toContainText("Periods drive reconciliation, returns, approvals, and close tracking.");
    await expect(periodDialog.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
    await periodDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(periodDialog).not.toBeVisible();
  });
});
