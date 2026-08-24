import { expect, test } from "@playwright/test";

import { getLiveCredentials } from "../fixtures/live-env";
import { LoginPage } from "../pages/login-page";

const live = getLiveCredentials();

const screens = [
  { path: "/dashboard", heading: /Welcome to GST Compliance Workspace/i, snapshot: "live-dashboard.png" },
  { path: "/imports", heading: "Import Center", snapshot: "live-imports.png" },
  { path: "/returns", heading: "Returns", snapshot: "live-returns.png" },
  { path: "/reports", heading: "Transaction Review", snapshot: "live-reports.png" },
  { path: "/ims", heading: "IMS", snapshot: "live-ims.png" },
  { path: "/settings/team", heading: "Team Management", snapshot: "live-settings-team.png" },
] as const;

test.describe("Live visual smoke", () => {
  test.skip(!live, "Set PLAYWRIGHT_BASE_URL, PLAYWRIGHT_LIVE_EMAIL, and PLAYWRIGHT_LIVE_PASSWORD to run live visual smoke tests.");

  test.use({ viewport: { width: 1440, height: 1200 } });

  test("captures seeded staging screens after real sign-in", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.expectVisible();
    await loginPage.signIn(live!.email, live!.password);

    await expect(page).toHaveURL(/\/dashboard$/);

    for (const screen of screens) {
      await page.goto(screen.path);
      await expect(page).toHaveURL(new RegExp(`${screen.path.replace(/\//g, "\\/")}(?:\\?.*)?$`));
      await expect(page.getByRole("main").getByRole("heading", { name: screen.heading, exact: typeof screen.heading === "string" })).toBeVisible();
      await expect(page.getByRole("main")).toHaveScreenshot(screen.snapshot, {
        animations: "disabled",
        caret: "hide",
      });
    }
  });
});
