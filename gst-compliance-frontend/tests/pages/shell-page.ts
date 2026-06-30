import { expect, type Page } from "@playwright/test";

export class ShellPage {
  constructor(private readonly page: Page) {}

  async expectHeading(name: string) {
    await expect(this.page.getByRole("main").getByRole("heading", { name, exact: true })).toBeVisible();
  }

  async openSidebarLink(name: string) {
    await this.page
      .getByRole("navigation")
      .getByRole("link", { name, exact: true })
      .click();
  }

  async signOut() {
    await this.page.getByRole("button", { name: /Owner Accounts owner/i }).click();
    await this.page.getByRole("menuitem", { name: "Sign out" }).click();
  }
}
