import { expect, type Page } from "@playwright/test";

export class ReturnReviewPage {
  constructor(private readonly page: Page) {}

  async expectHeading(name: string) {
    await expect(this.page.getByRole("main").getByRole("heading", { name, exact: true })).toBeVisible();
  }
}
