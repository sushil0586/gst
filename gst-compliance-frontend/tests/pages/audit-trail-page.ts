import { expect, type Page } from "@playwright/test";

export class AuditTrailPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/audit-trail");
  }

  async expectReady() {
    await expect(
      this.page.getByRole("main").getByRole("heading", { name: "Audit Trail", exact: true }),
    ).toBeVisible();
  }

  detailDialog() {
    return this.page.getByRole("dialog");
  }
}
