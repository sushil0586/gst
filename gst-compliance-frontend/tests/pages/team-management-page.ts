import { expect, type Page } from "@playwright/test";

export class TeamManagementPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/settings/team");
  }

  async openAddMember() {
    await this.page.getByRole("button", { name: "Add Member" }).click();
  }

  async addMember(member: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    password: string;
  }) {
    await this.openAddMember();
    await this.page.getByLabel("Email").fill(member.email);
    await this.page.getByLabel("First name").fill(member.firstName);
    await this.page.getByLabel("Last name").fill(member.lastName);
    await this.page.getByRole("combobox").nth(0).click();
    await this.page.getByRole("option", { name: member.role }).click();
    await this.page.getByLabel("Initial password").fill(member.password);
    await this.page.getByRole("button", { name: "Add member" }).click();
  }

  async editMember(email: string, updates: { firstName?: string; lastName?: string; role?: string }) {
    const row = this.page.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: "Edit" }).click();
    if (updates.firstName) {
      await this.page.getByLabel("First name").fill(updates.firstName);
    }
    if (updates.lastName) {
      await this.page.getByLabel("Last name").fill(updates.lastName);
    }
    if (updates.role) {
      await this.page.getByRole("combobox").nth(0).click();
      await this.page.getByRole("option", { name: updates.role }).click();
    }
    await this.page.getByRole("button", { name: "Save role" }).click();
  }

  async deactivateMember(email: string) {
    const row = this.page.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: "Deactivate" }).click();
    await this.page.getByRole("button", { name: "Confirm deactivation" }).click();
  }

  async expectMemberVisible(email: string) {
    await expect(this.page.getByText(email)).toBeVisible();
  }
}
