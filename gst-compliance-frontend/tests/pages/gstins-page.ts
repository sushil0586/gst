import { expect, type Page } from "@playwright/test";

export class GstinsPage {
  constructor(private readonly page: Page) {}

  private dialog() {
    return this.page.getByRole("dialog", { name: /GSTIN/i });
  }

  async goto() {
    await this.page.goto("/gstins");
  }

  async expectReady() {
    await expect(this.page.getByRole("main").getByRole("heading", { name: "GSTINs", exact: true })).toBeVisible();
  }

  async openAddGstin() {
    await this.page.getByRole("button", { name: "Add GSTIN" }).click();
  }

  async createGstin(values: {
    gstin: string;
    stateCode: string;
    registrationType: string;
    username: string;
  }) {
    await this.openAddGstin();
    await this.dialog().getByLabel("GSTIN", { exact: true }).fill(values.gstin);
    await this.dialog().getByLabel("State code", { exact: true }).fill(values.stateCode);
    await this.dialog().getByRole("combobox").nth(1).click();
    await this.page.getByRole("option", { name: values.registrationType, exact: true }).click();
    await this.dialog().getByLabel("Customer GST portal username (Recommended)").fill(values.username);
    await this.page.getByRole("button", { name: "Create GSTIN" }).click();
  }

  row(gstin: string) {
    return this.page.getByRole("row").filter({ hasText: gstin });
  }
}
