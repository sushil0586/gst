import { expect, type Page } from "@playwright/test";

export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/dashboard");
  }

  async expectReady() {
    await expect(
      this.page.getByRole("main").getByRole("heading", {
        name: /Welcome to GST Compliance Workspace/i,
      }),
    ).toBeVisible();
  }

  async openQuickAction(name: string) {
    await this.page.getByRole("link", { name }).click();
  }
}
