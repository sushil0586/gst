import { expect, type Page } from "@playwright/test";

export class ReconciliationPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/reconciliation");
  }

  async runReconciliation() {
    await this.page.getByRole("button", { name: "Run Reconciliation" }).click();
  }

  async expectReady() {
    await expect(this.page.getByRole("heading", { name: "2B Reconciliation" })).toBeVisible();
  }
}
