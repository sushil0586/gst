import { expect, test } from "../fixtures/app-fixture";
import { ClientsPage } from "../pages/clients-page";

test.describe("Clients management", () => {
  test("creates, filters, edits, and deletes a client from the portfolio view", async ({ page, app }) => {
    const clientsPage = new ClientsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();

    await clientsPage.goto();
    await clientsPage.expectReady();

    await clientsPage.createClient({
      legalName: "Zenith Retail Private Limited",
      tradeName: "Zenith Retail",
      clientCode: "ZENITH01",
      pan: "AAACZ1234K",
      email: "finance@zenith.example.com",
    });

    await expect(page.getByText("Client created successfully.")).toBeVisible();
    await expect(clientsPage.row("Zenith Retail Private Limited")).toBeVisible();

    await clientsPage.search("ZENITH01");
    await expect(page.getByText("Showing 1 of 2 clients")).toBeVisible();

    const createdRow = clientsPage.row("Zenith Retail Private Limited");
    await createdRow.getByRole("button", { name: "Edit", exact: true }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit client" });
    await editDialog.getByLabel("Legal name").fill("Zenith Retail Holdings Private Limited");
    await editDialog.getByLabel("Client code").fill("ZENITH02");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Client updated successfully.")).toBeVisible();
    await clientsPage.search("Zenith Retail Holdings");
    await expect(clientsPage.row("Zenith Retail Holdings Private Limited")).toBeVisible();

    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    await clientsPage.row("Zenith Retail Holdings Private Limited").getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByText("Client deleted.")).toBeVisible();
    await clientsPage.search("ZENITH02");
    await expect(page.getByRole("heading", { name: "No matching client found" })).toBeVisible();
  });

  test("shows validation feedback before creating a client", async ({ page, app }) => {
    const clientsPage = new ClientsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();

    await clientsPage.goto();
    await clientsPage.openAddClient();

    await page.getByLabel("Legal name").fill("A");
    await page.getByLabel("Client code").fill("Z");
    await page.getByLabel("PAN").fill("123");
    await page.getByLabel("Email").fill("bad-email");
    await page.getByRole("button", { name: "Create client" }).click();

    await expect(page.getByText("Legal name is required.")).toBeVisible();
    await expect(page.getByText("Client code is required.")).toBeVisible();
    await expect(page.getByText("PAN must be 10 characters.")).toBeVisible();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  });

  test("reveals optional GSTIN setup progressively and prefills client details from taxpayer lookup", async ({ page, app }) => {
    const clientsPage = new ClientsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockFoundationApis();

    await clientsPage.goto();
    await clientsPage.openAddClient();

    const createDialog = page.getByRole("dialog", { name: "Create client" });
    await expect(createDialog).toBeVisible();
    await expect(createDialog.getByLabel("GSTIN", { exact: true })).toHaveCount(0);

    await createDialog.getByRole("button", { name: "Add GSTIN details", exact: true }).click();
    await expect(createDialog.getByLabel("GSTIN", { exact: true })).toBeVisible();

    await createDialog.getByPlaceholder("Enter GSTIN").fill("27ABCDE1234F1Z5");
    await createDialog.getByRole("button", { name: "Fetch taxpayer", exact: true }).click();

    await expect(page.getByText("Taxpayer details fetched. Review and create the client.")).toBeVisible();
    await expect(createDialog.getByLabel("Legal name")).toHaveValue("Lookup Client Private Limited");
    await expect(createDialog.getByLabel("Trade name")).toHaveValue("Lookup Client");
    await expect(createDialog.getByLabel("PAN")).toHaveValue("ABCDE1234F");
    await expect(createDialog.getByRole("button", { name: "Create client and GSTIN", exact: true })).toBeVisible();
  });
});
