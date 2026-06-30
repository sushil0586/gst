import { expect, test } from "./fixtures/test";

test.describe("GST monthly workflow base", () => {
  test("loads a live monthly context and prepares GSTR-3B from the returns screen", async ({ page, gstApi }) => {
    await gstApi.mockMonthlyComplianceWorkflow();

    await page.goto("/returns");

    await expect(page.getByRole("main").getByRole("heading", { name: "Returns" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acme Client Private Limited for 2026-05" })).toBeVisible();
    const prepareButton = page.getByRole("button", { name: "Prepare GSTR-3B" });
    await expect(prepareButton).toBeVisible();
    await expect(prepareButton).toBeEnabled();

    await prepareButton.click();

    await expect(page.getByText("GSTR3B draft prepared.")).toBeVisible();
  });
});
