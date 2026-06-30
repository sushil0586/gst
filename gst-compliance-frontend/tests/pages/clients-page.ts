import { expect, type Page } from "@playwright/test";

export class ClientsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/clients");
  }

  async expectReady() {
    await expect(this.page.getByRole("main").getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
  }

  async openAddClient() {
    await this.page.getByRole("button", { name: "Add Client" }).click();
  }

  async createClient(values: {
    legalName: string;
    tradeName: string;
    clientCode: string;
    pan: string;
    email: string;
  }) {
    await this.openAddClient();
    await this.page.getByLabel("Legal name").fill(values.legalName);
    await this.page.getByLabel("Trade name").fill(values.tradeName);
    await this.page.getByLabel("Client code").fill(values.clientCode);
    await this.page.getByLabel("PAN").fill(values.pan);
    await this.page.getByLabel("Email").fill(values.email);
    await this.page.getByRole("button", { name: "Create client" }).click();
  }

  async search(query: string) {
    await this.page.getByPlaceholder("Search by client name, code, PAN, trade name, or email").fill(query);
  }

  row(name: string) {
    return this.page.getByRole("row").filter({ hasText: name });
  }
}
