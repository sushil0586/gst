import { expect, type Page } from "@playwright/test";

export class CompliancePeriodsPage {
  constructor(private readonly page: Page) {}

  private dialog() {
    return this.page.getByRole("dialog", { name: /compliance period/i });
  }

  async goto() {
    await this.page.goto("/compliance-periods");
  }

  async expectReady() {
    await expect(
      this.page.getByRole("main").getByRole("heading", { name: "Compliance Periods", exact: true }),
    ).toBeVisible();
  }

  async openAddPeriod() {
    await this.page.getByRole("button", { name: "Add Period" }).click();
  }

  async createPeriod(values: {
    period: string;
    dueDate: string;
    returnType: string;
    status: string;
  }) {
    await this.openAddPeriod();
    await this.dialog().getByLabel("Period", { exact: true }).fill(values.period);
    await this.dialog().getByLabel("Due date", { exact: true }).fill(values.dueDate);
    await this.dialog().getByRole("combobox").nth(1).click();
    await this.page.getByRole("option", { name: values.returnType, exact: true }).click();
    await this.dialog().getByRole("combobox").nth(2).click();
    await this.page.getByRole("option", { name: values.status, exact: true }).click();
    await this.page.getByRole("button", { name: "Create period" }).click();
  }

  row(period: string) {
    const escaped = period.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.page.getByRole("row", { name: new RegExp(`^${escaped}\\b`) });
  }
}
