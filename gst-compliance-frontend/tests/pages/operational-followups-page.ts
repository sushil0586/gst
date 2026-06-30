import { expect, type Page } from "@playwright/test";

export class OperationalFollowUpsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/operations/follow-ups");
  }

  async expectReady() {
    await expect(
      this.page.getByRole("main").getByRole("heading", { name: "Operational Follow-ups", exact: true }),
    ).toBeVisible();
  }
}
