import { expect, test } from "@playwright/test";

import { getLiveCredentials } from "../fixtures/live-env";

const live = getLiveCredentials();

async function selectImsContext(page: Parameters<typeof test>[0]["page"]) {
  const workspaceSelector = page.getByTestId("workspace-selector");
  const clientSelector = page.getByTestId("client-selector");
  const gstinSelector = page.getByTestId("gstin-selector");
  const periodSelector = page.getByTestId("period-selector");
  const workspaceText = (await workspaceSelector.textContent()) ?? "";
  const gstinText = (await gstinSelector.textContent()) ?? "";
  const periodText = (await periodSelector.textContent()) ?? "";

  if (!workspaceText.includes("Demo Workspace")) {
    await workspaceSelector.click({ force: true });
    await page.getByRole("option", { name: "Demo Workspace", exact: true }).click();
  }

  await expect(clientSelector).toContainText("Demo Client Private Limited");
  await expect(gstinSelector).toContainText("29ABCDE1234F1Z5");
  await expect(periodSelector).toContainText("2026-04");
}

async function signInViaApi({
  page,
  request,
  baseUrl,
  email,
  password,
}: {
  page: Parameters<typeof test>[0]["page"];
  request: Parameters<typeof test>[0]["request"];
  baseUrl: string;
  email: string;
  password: string;
}) {
  const response = await request.post(`${baseUrl}/api/auth/login`, {
    data: {
      email,
      password,
    },
  });
  expect(response.ok()).toBeTruthy();
  const setCookieHeader = response.headers()["set-cookie"] ?? "";
  const accessToken = /gst_compliance_access_token=([^;]+)/.exec(setCookieHeader)?.[1];
  const refreshToken = /gst_compliance_refresh_token=([^;]+)/.exec(setCookieHeader)?.[1];
  expect(accessToken).toBeTruthy();
  expect(refreshToken).toBeTruthy();
  const appHost = new URL(baseUrl).hostname;
  await page.context().addCookies([
    {
      name: "gst_compliance_access_token",
      value: accessToken!,
      domain: appHost,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
    {
      name: "gst_compliance_refresh_token",
      value: refreshToken!,
      domain: appHost,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

async function waitForImsOutcome(page: Parameters<typeof test>[0]["page"]) {
  await expect
    .poll(
      async () => {
        if (await page.getByText("Provider outcome", { exact: true }).isVisible()) {
          return "success";
        }
        if (await page.getByText("IMS request failed", { exact: true }).isVisible()) {
          return "error";
        }
        return "pending";
      },
      { timeout: 10000 },
    )
    .toMatch(/success|error/);
}

test.describe("Live IMS", () => {
  test.skip(!live, "Set PLAYWRIGHT_BASE_URL, PLAYWRIGHT_LIVE_EMAIL, and PLAYWRIGHT_LIVE_PASSWORD to run live IMS tests.");

  test("loads the IMS workbench and exercises read-only provider actions on staging", async ({ page, request }) => {
    await signInViaApi({
      page,
      request,
      baseUrl: live!.baseUrl,
      email: live!.email,
      password: live!.password,
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/ims");
    await selectImsContext(page);
    await expect(page.getByRole("main").getByRole("heading", { name: "IMS", exact: true })).toBeVisible();
    await expect(page.getByText("Manage IMS investigation, provider response checks", { exact: false })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Invoices", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Supplier", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Rejected", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Status", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "File", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Draft save/reset", exact: true })).toBeVisible();

    await expect(page.getByText("WhiteBooks auth session", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Invoices", exact: true }).click();
    await page.getByRole("button", { name: "Fetch count", exact: true }).click();
    await waitForImsOutcome(page);

    if (await page.getByText("Provider outcome", { exact: true }).isVisible()) {
      await expect(page.getByText("Debug payload", { exact: true })).toBeVisible();
    } else {
      await expect(page.getByText("IMS request failed", { exact: true })).toBeVisible();
    }

    await page.getByRole("tab", { name: "Supplier", exact: true }).click();
    await page.getByRole("button", { name: "Fetch supplier invoices", exact: true }).click();
    await waitForImsOutcome(page);

    if (await page.getByText("Provider outcome", { exact: true }).isVisible()) {
      await expect(page.getByText("Source", { exact: true }).first()).toBeVisible();
    } else {
      await expect(page.getByText("IMS request failed", { exact: true })).toBeVisible();
    }
  });
});
