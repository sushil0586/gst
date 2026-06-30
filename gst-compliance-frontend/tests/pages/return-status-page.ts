import { expect, type Page } from "@playwright/test";

export class ReturnStatusPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/reports/return-status");
  }

  async expectReady() {
    await expect(
      this.page.getByRole("main").getByRole("heading", { name: "Return Status Register", exact: true }),
    ).toBeVisible();
  }

  followUpDialog() {
    return this.page.getByRole("dialog");
  }
}
