import { expect, test } from "@playwright/test";

import { getLiveCredentials } from "../fixtures/live-env";
import { LoginPage } from "../pages/login-page";

const live = getLiveCredentials();

const screens = [
  { path: "/dashboard", heading: /Welcome to GST Compliance Workspace/i },
  { path: "/imports", heading: "Import Center" },
  { path: "/reconciliation", heading: "2B Reconciliation" },
  { path: "/returns", heading: "Returns" },
  { path: "/operations", heading: "Filing Operations" },
  { path: "/approvals", heading: "Approvals" },
  { path: "/notices", heading: "Notices" },
  { path: "/audit-trail", heading: "Audit Trail" },
  { path: "/reports", heading: "Transaction Review" },
  { path: "/settings", heading: "Settings" },
] as const;

test.describe("Live navigation", () => {
  test.skip(!live, "Set PLAYWRIGHT_BASE_URL, PLAYWRIGHT_LIVE_EMAIL, and PLAYWRIGHT_LIVE_PASSWORD to run live navigation tests.");

  test("loads major operator screens from a real signed-in session", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(live!.email, live!.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    for (const screen of screens) {
      await page.goto(screen.path);
      await expect(page).toHaveURL(new RegExp(`${screen.path.replace(/\//g, "\\/")}(?:\\?.*)?$`));
      await expect(page.getByRole("main").getByRole("heading", { name: screen.heading, exact: typeof screen.heading === "string" })).toBeVisible();
    }
  });
});
