import { expect, type Page } from "@playwright/test";

export class ReportsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/reports");
  }

  async expectReady() {
    await expect(
      this.page.getByRole("main").getByRole("heading", { name: "Transaction Review", exact: true }),
    ).toBeVisible();
  }
}
