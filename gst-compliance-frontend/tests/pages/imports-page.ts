import { expect, type Page } from "@playwright/test";

export class ImportsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/imports");
  }

  async uploadFile(filePath: string) {
    await this.page.locator('input[type="file"]').setInputFiles(filePath);
    await this.page.getByRole("button", { name: "Upload file" }).click();
  }

  async expectReady() {
    await expect(this.page.getByRole("heading", { name: "Import Center" })).toBeVisible();
    await expect(this.page.getByText("Upload source file", { exact: true })).toBeVisible();
  }
}
