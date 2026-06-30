import { expect, type Page } from "@playwright/test";

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/login");
  }

  async signIn(email: string, password: string) {
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign in" }).click();
  }

  async openForgotPassword() {
    await this.page.getByRole("button", { name: "Forgot your password?" }).click();
  }

  async openRegister() {
    await this.page.getByRole("button", { name: "Create a new workspace" }).click();
  }

  async expectVisible() {
    await expect(this.page.getByText("Welcome back", { exact: true })).toBeVisible();
  }
}
