import { expect, test } from "../fixtures/app-fixture";

test.describe("Transaction review remediation", () => {
  test("saves a review view, captures a snapshot, assigns a bucket, and creates a follow-up", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();
    await app.mockWorkspaceMembersApis();

    await page.goto("/reports");

    await expect(page.getByRole("main").getByRole("heading", { name: "Transaction Review", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Save current view", exact: true }).click();
    const saveViewDialog = page.getByRole("dialog", { name: "Save review view" });
    await saveViewDialog.getByPlaceholder("April filing fixes").fill("Monthly remediation focus");
    await saveViewDialog.getByRole("button", { name: "Save view", exact: true }).click();

    await expect(page.getByText("Review view saved.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Monthly remediation focus", exact: true })).toBeVisible();

    const snapshotsHeading = page.getByText("Remediation snapshots", { exact: true });
    await snapshotsHeading.scrollIntoViewIfNeeded();
    await expect(snapshotsHeading).toBeVisible();

    await page.getByRole("button", { name: "Capture snapshot", exact: true }).click();
    await expect(page.getByText("Shared remediation snapshot captured.")).toBeVisible();
    await expect(page.getByText("Current snapshot:")).toBeVisible();

    await page.getByRole("button", { name: "Assign bucket", exact: true }).first().click();
    const assignmentDialog = page.getByRole("dialog", { name: "Assign remediation work" });
    await assignmentDialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /Filer User/i }).click();
    await assignmentDialog.getByRole("button", { name: "Create assignment", exact: true }).click();

    await expect(page.getByText("Remediation assignment created.")).toBeVisible();

    await page.getByRole("button", { name: "Create follow-up", exact: true }).click();
    const followUpDialog = page.getByRole("dialog", { name: "Create follow-up" });
    await followUpDialog.getByRole("textbox").first().fill("Chase HSN corrections");
    await followUpDialog.locator('input[type="datetime-local"]').fill("2026-06-10T10:30");
    await followUpDialog.getByRole("button", { name: "Create follow-up", exact: true }).click();

    await expect(page.getByText("Follow-up created.")).toBeVisible();
    await expect(page.getByText("Chase HSN corrections")).toBeVisible();
  });

  test("manages remediation ownership, escalation, and follow-up actions from the shared queues", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReportsWorkflowApis();
    await app.mockWorkspaceMembersApis();

    await page.goto("/reports");

    await expect(page.getByRole("main").getByRole("heading", { name: "Transaction Review", exact: true })).toBeVisible();
    const ownershipHeading = page.getByText("Remediation ownership", { exact: true });
    await ownershipHeading.scrollIntoViewIfNeeded();
    await expect(ownershipHeading).toBeVisible();
    await expect(page.getByText("Preparing remediation ownership...")).toHaveCount(0);

    const assignmentRow = page.getByRole("row").filter({ hasText: "Missing HSN remediation" });
    await expect(assignmentRow).toBeVisible();
    await assignmentRow.getByRole("button", { name: "Manage", exact: true }).click();

    const assignmentDialog = page.getByRole("dialog", { name: "Manage remediation owner" });
    await expect(assignmentDialog).toBeVisible();
    await assignmentDialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "In progress", exact: true }).click();
    await assignmentDialog.getByPlaceholder("Add close notes, dependencies, or reviewer guidance").fill(
      "Actively reviewing HSN mapping before close sign-off.",
    );
    await assignmentDialog.getByRole("button", { name: "Update assignment", exact: true }).click();

    await expect(page.getByText("Remediation assignment updated.")).toBeVisible();
    await expect(assignmentRow).toContainText("in progress");
    await expect(assignmentDialog).toHaveCount(0);

    await assignmentRow.getByRole("button", { name: "Escalate", exact: true }).click();
    await expect(page.getByText("Remediation assignment escalated.")).toBeVisible();
    await expect(assignmentRow).toContainText("escalated");

    await assignmentRow.getByRole("button", { name: "Clear escalation", exact: true }).click();
    await expect(page.getByText("Remediation escalation cleared.")).toBeVisible();

    const followUpHeading = page.getByText("Follow-up queue", { exact: true });
    await followUpHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText("Preparing follow-up queue...")).toHaveCount(0);
    await expect(page.getByText("Check missing HSN rows")).toBeVisible();
    await page.getByRole("button", { name: "Manage", exact: true }).last().click();

    const followUpDialog = page.getByRole("dialog", { name: "Manage follow-up" });
    await expect(followUpDialog).toBeVisible();
    await followUpDialog.getByRole("textbox").first().fill("Check missing HSN rows urgently");
    await followUpDialog.getByPlaceholder("Add reminder detail, reviewer context, or manager ask").fill(
      "Manager review requested before filing lock.",
    );
    await followUpDialog.getByRole("button", { name: "Save follow-up", exact: true }).click();

    await expect(page.getByText("Follow-up updated.")).toBeVisible();
    await expect(page.getByText("Check missing HSN rows urgently")).toBeVisible();

    const updatedFollowUpCard = page.locator("div").filter({ hasText: "Check missing HSN rows urgently" }).first();
    await updatedFollowUpCard.getByRole("button", { name: "Send now", exact: true }).click();
    await expect(page.getByText("Follow-up reminder sent.")).toBeVisible();

    await updatedFollowUpCard.getByRole("button", { name: "Mark completed", exact: true }).click();
    await expect(page.getByText("Follow-up completed.")).toBeVisible();
  });
});
