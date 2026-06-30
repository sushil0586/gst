import { expect, type Page } from "@playwright/test";

export class NoticesPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/notices");
  }

  async expectReady() {
    await expect(
      this.page.getByRole("main").getByRole("heading", { name: "Notices", exact: true }),
    ).toBeVisible();
  }

  async openCreateNotice() {
    await this.page.getByRole("button", { name: "Add Notice" }).click();
  }

  noticeDialog() {
    return this.page.getByRole("dialog");
  }
}
