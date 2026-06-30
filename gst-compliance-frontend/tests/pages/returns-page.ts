import { expect, type Page } from "@playwright/test";

export class ReturnsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/returns");
  }

  async prepareGstr3b() {
    const prepareButton = this.page.getByRole("button", { name: "Prepare GSTR-3B" });
    await expect(prepareButton).toBeVisible();
    await expect(prepareButton).toBeEnabled();
    await prepareButton.click();
  }

  async expectReady() {
    await expect(
      this.page.getByRole("main").getByRole("heading", { name: "Returns", exact: true }),
    ).toBeVisible();
  }

  async openPortalLedgers() {
    await this.page.getByRole("button", { name: "View portal ledgers" }).click();
  }

  async openGeneratePortalChallan() {
    const button = this.page.getByRole("button", { name: "Generate portal challan" });
    await expect(button).toBeEnabled();
    await button.click();
  }

  async fillPortalChallanForm(values: {
    reason: string;
    mobileNumber: string;
    address: string;
    cgst: string;
    igst: string;
    sgst: string;
    cess: string;
  }) {
    await this.page.getByLabel("Challan reason").fill(values.reason);
    await this.page.getByLabel("Mobile number").fill(values.mobileNumber);
    await this.page.getByLabel("Address").fill(values.address);
    await this.page.getByLabel("CGST tax amount").fill(values.cgst);
    await this.page.getByLabel("IGST tax amount").fill(values.igst);
    await this.page.getByLabel("SGST tax amount").fill(values.sgst);
    await this.page.getByLabel("Cess tax amount").fill(values.cess);
  }
}
