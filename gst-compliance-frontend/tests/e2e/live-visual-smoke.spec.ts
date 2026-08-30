import { expect, test } from "@playwright/test";

import { getLiveCredentials } from "../fixtures/live-env";
import { LoginPage } from "../pages/login-page";

const live = getLiveCredentials();

async function stabilizeImportsVisual(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("main").getByText("Import operations snapshot")).toBeVisible();
  await expect(page.getByRole("main").getByText("Import history")).toBeVisible();

  const content = page.getByRole("main").locator("> div > div").first();
  await content.evaluate((node) => {
    Array.from(node.children).slice(3).forEach((child) => {
      child.setAttribute("data-live-visual-hidden", "true");
    });
  });

  await page.addStyleTag({
    content: `
      [data-live-visual-hidden="true"] {
        display: none !important;
      }
    `,
  });

  const reviewDescription = page
    .getByText("4. Review processed output")
    .locator("xpath=following-sibling::p[1]");
  await reviewDescription.evaluate((node) => {
    node.textContent = "Latest batch output is visible in the workspace.";
  });

  const latestStatus = page
    .getByText("Latest batch status")
    .locator("xpath=following-sibling::div//span[1]");
  await latestStatus.evaluate((node) => {
    node.textContent = "live";
  });
}

const screens = [
  {
    path: "/dashboard",
    heading: /Welcome to GST Compliance Workspace/i,
    snapshot: "live-dashboard.png",
    locator: '[class*="panel-card-hero"]',
  },
  {
    path: "/imports",
    heading: "Import Center",
    snapshot: "live-imports.png",
    stabilize: stabilizeImportsVisual,
  },
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
      if ("stabilize" in screen) {
        await screen.stabilize(page);
      }
      const visualTarget = screen.locator
        ? page.getByRole("main").locator(screen.locator).first()
        : page.getByRole("main");
      await expect(visualTarget).toHaveScreenshot(screen.snapshot, {
        animations: "disabled",
        caret: "hide",
      });
    }
  });
});
