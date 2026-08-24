import { expect, test } from "../fixtures/app-fixture";
import { createFilingOperation, createPreparedReturn } from "../fixtures/app-data";
import { ReturnsPage } from "../pages/returns-page";

test.describe("Returns workflow", () => {
  test("opens a prepared review workspace and requests approval from the returns desk", async ({ page, app }) => {
    const returnsPage = new ReturnsPage(page);

    let approvals: Array<Record<string, unknown>> = [];

    await app.mockAuthenticatedShell();
    await app.mockReturnReviewApis();

    await page.route(/\/api\/backend\/approvals\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "success",
            message: "Success",
            data: approvals,
            pagination: { count: approvals.length, next: null, previous: null, page: 1, page_size: 50 },
          }),
        });
        return;
      }

      const nextApproval = {
        id: "approval-from-returns-1",
        workspace: "workspace-1",
        client: "client-1",
        client_name: "Acme Client Private Limited",
        gstin: "gstin-1",
        gstin_value: "27ABCDE1234F1Z5",
        compliance_period: "period-1",
        compliance_period_label: "2026-05",
        entity_type: "return_preparation",
        entity_id: "return-gstr1",
        requested_to: 1,
        requested_to_name: "Owner Accounts",
        status: "pending",
        comments: "Please review this prepared return before filing.",
        resolution_comments: "",
        resolved_by: null,
        resolved_by_name: null,
        resolved_at: null,
        created_at: "2026-06-05T11:20:00Z",
        updated_at: "2026-06-05T11:20:00Z",
      };
      approvals = [nextApproval];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "Success", data: nextApproval }),
      });
    });

    await page.route("**/api/backend/filings/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [],
          pagination: { count: 0, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [],
          pagination: { count: 0, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await returnsPage.goto();
    await returnsPage.expectReady();

    await page.getByRole("link", { name: "Open GSTR-1 Review", exact: true }).click();
    await expect(page).toHaveURL(/\/returns\/gstr1-review\?/);
    await expect(page.getByRole("main").getByRole("heading", { name: "GSTR-1 Review", exact: true })).toBeVisible();

    await page.goto("/returns");
    await returnsPage.expectReady();

    const gstr1Row = page.getByTestId("return-row-return-gstr1");
    await expect(gstr1Row).toBeVisible();
    await gstr1Row.getByTestId("return-open-return-gstr1").click();

    const reviewDialog = page.getByRole("dialog", { name: "GSTR1 review summary" });
    await expect(reviewDialog).toBeVisible();
    await expect(reviewDialog.getByText("Filing flow", { exact: true })).toBeVisible();

    await reviewDialog.getByRole("button", { name: "Request approval", exact: true }).click();
    await expect(page.getByText("Approval request created.")).toBeVisible();
    await expect(page.getByText("Approval status")).toBeVisible();
    await expect(page.getByText("pending • Reviewer: Owner Accounts")).toBeVisible();
  });

  test("prepares a GSTR-3B draft from the returns workspace", async ({ page, app }) => {
    const returnsPage = new ReturnsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnsApis();

    await returnsPage.goto();
    await returnsPage.expectReady();

    await returnsPage.prepareGstr3b();

    await expect(page.getByText("GSTR3B draft prepared.")).toBeVisible();
  });

  test("warns the user when return preparation is blocked by stale reconciliation", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnsApis({ staleRun: true });

    await page.goto("/returns");

    await expect(page.getByText("Reconciliation is no longer current")).toBeVisible();
    await expect(
      page.getByText(
        "Source imports were changed after the last reconciliation run. Re-run reconciliation before approving, filing, or sharing this return output.",
      ),
    ).toBeVisible();
    await expect(page.getByText(/Preparation is currently blocked for at least one return type\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare GSTR-3B" })).toBeDisabled();
  });

  test("shows live portal ledger evidence for a filing-ready GSTR-3B context", async ({ page, app }) => {
    const returnsPage = new ReturnsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnsApis({ portalReadiness: "ready" });

    await returnsPage.goto();
    await returnsPage.expectReady();

    await expect(page.getByText("WhiteBooks balance payload fetched successfully.")).toBeVisible();
    await expect(page.getByText("Latest CPIN detected: CPIN0001234567")).toBeVisible();
    await expect(page.getByText("Cash ledger closing").locator("..")).toContainText("1,25,000.50");

    await returnsPage.openPortalLedgers();

    await expect(page.getByRole("heading", { name: "Portal ledger evidence" })).toBeVisible();
    await expect(page.getByText("Latest CPIN: CPIN0001234567")).toBeVisible();
    await expect(page.getByText("cashEntries")).toBeVisible();
    await expect(page.getByText("liabilityEntries")).toBeVisible();
  });

  test("validates and generates a portal challan from the returns workspace", async ({ page, app }) => {
    const returnsPage = new ReturnsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnsApis({ portalReadiness: "ready" });

    await returnsPage.goto();
    await returnsPage.expectReady();

    await returnsPage.openGeneratePortalChallan();
    await expect(page.getByRole("heading", { name: "Generate portal challan" })).toBeVisible();

    await returnsPage.fillPortalChallanForm({
      reason: "MONTHLYPAY",
      mobileNumber: "9876543210",
      address: "Mumbai, Maharashtra",
      cgst: "20000",
      igst: "15000",
      sgst: "20000",
      cess: "500",
    });

    await expect(page.getByText("Rs. 55,500.00")).toBeVisible();

    await page.getByRole("button", { name: "Validate challan" }).click();
    await expect(page.getByText("Validation passed")).toBeVisible();
    await expect(page.getByText("Portal challan validation succeeded.")).toBeVisible();

    await page.getByRole("button", { name: "Generate challan" }).click();
    await expect(page.getByText("Portal challan generated. CPIN: CPIN0007654321")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Generate portal challan" })).not.toBeVisible();

    const generatedChallanRow = page.getByRole("row", { name: /CPIN0007654321/ });
    await expect(generatedChallanRow).toBeVisible();
    await expect(generatedChallanRow).toContainText("MONTHLYPAY");
    await expect(generatedChallanRow).toContainText("55,500.00");
  });

  test("keeps portal challan actions disabled when the WhiteBooks session is unavailable", async ({ page, app }) => {
    await app.mockAuthenticatedShell();
    await app.mockReturnsApis({ portalReadiness: "blocked" });

    await page.goto("/returns");

    await expect(page.getByText("Portal fetch blockers")).toBeVisible();
    await expect(page.getByText("Verified portal session is not available for this GSTIN.")).toBeVisible();

    const generateChallanButton = page.getByRole("button", { name: "Generate portal challan" });
    await expect(generateChallanButton).toBeDisabled();
    await expect(page.getByText("Challan reads are feature-gated off.")).toBeVisible();
  });

  test("shows validation failure feedback before challan generation", async ({ page, app }) => {
    const returnsPage = new ReturnsPage(page);

    await app.mockAuthenticatedShell();
    await app.mockReturnsApis({ portalReadiness: "ready", challanValidationFails: true });

    await returnsPage.goto();
    await returnsPage.expectReady();

    await returnsPage.openGeneratePortalChallan();
    await expect(page.getByRole("heading", { name: "Generate portal challan" })).toBeVisible();

    await returnsPage.fillPortalChallanForm({
      reason: "MONTHLYPAY",
      mobileNumber: "9876543210",
      address: "Mumbai, Maharashtra",
      cgst: "20000",
      igst: "15000",
      sgst: "20000",
      cess: "500",
    });

    await page.getByRole("button", { name: "Validate challan" }).click();

    await expect(page.getByText("Validation failed")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Portal validation rejected the challan payload.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Generate portal challan" })).toBeVisible();
    await expect(page.getByRole("row", { name: /CPIN0007654321/ })).toHaveCount(0);
  });

  test("@launch runs the launch-critical OTP and filing flow from the returns workspace", async ({ page, app }) => {
    const returnsPage = new ReturnsPage(page);

    const approvedReturn = createPreparedReturn({
      id: "return-approved-gstr3b",
      return_type: "gstr3b",
      status: "approved",
      approved_by: 1,
      approved_by_name: "Owner Accounts",
      updated_at: "2026-06-05T11:45:00Z",
    });

    let authSession: Record<string, unknown> | null = null;
    let filing: Record<string, unknown> | null = null;
    let filingAttempts: Array<Record<string, unknown>> = [];
    let filingEvents: Array<Record<string, unknown>> = [];

    await app.mockAuthenticatedShell();
    await app.mockReturnsApis();

    await page.route(/\/api\/backend\/returns\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [approvedReturn],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/returns\/return-approved-gstr3b\/$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "Success", data: approvedReturn }),
      });
    });

    await page.route(/\/api\/backend\/approvals\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [],
          pagination: { count: 0, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/provider-auth-sessions\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: authSession ? [authSession] : [],
          pagination: { count: authSession ? 1 : 0, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route("**/api/backend/provider-auth-sessions/request-otp/", async (route) => {
      authSession = {
        id: "session-returns-1",
        workspace: "workspace-1",
        client: "client-1",
        gstin: "gstin-1",
        provider: "whitebooks",
        status: "otp_requested",
        txn: "txn-live-returns-001",
        response_contract_confirmed: false,
        last_requested_at: "2026-06-05T12:00:00Z",
        last_verified_at: null,
        verified_at: null,
        freshness_summary: {
          verified_at: null,
          expires_at: null,
          is_stale: false,
          stale_reason: "",
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "Success", data: authSession }),
      });
    });

    await page.route(/\/api\/backend\/provider-auth-sessions\/session-returns-1\/verify-otp\/$/, async (route) => {
      authSession = {
        ...authSession,
        status: "session_active",
        response_contract_confirmed: true,
        last_verified_at: "2026-06-05T12:02:00Z",
        verified_at: "2026-06-05T12:02:00Z",
        freshness_summary: {
          verified_at: "2026-06-05T12:02:00Z",
          expires_at: "2026-06-05T18:02:00Z",
          is_stale: false,
          stale_reason: "",
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "Success", data: authSession }),
      });
    });

    await page.route(/\/api\/backend\/filings\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: filing ? [filing] : [],
          pagination: { count: filing ? 1 : 0, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route("**/api/backend/filings/start/", async (route) => {
      filing = createFilingOperation({
        id: "filing-returns-1",
        prepared_return: "return-approved-gstr3b",
        return_type: "gstr3b",
        status: "queued_for_filing",
        provider_reference_id: null,
        arn: "",
        last_status_sync_at: "2026-06-05T12:03:00Z",
        support_actions_summary: {
          recommended_action: "none",
          summary_reason: "Filing is queued after a verified OTP session.",
          actions: [
            { action: "retry", label: "Retry filing", allowed: false, reason: "Retry is not needed while the filing is queued." },
            { action: "resync", label: "Refresh status", allowed: true, reason: "Refresh is available." },
            { action: "requeue_after_review", label: "Requeue after review", allowed: false, reason: "Requeue is not needed while the filing is queued." },
          ],
        },
        support_status_summary: {
          filing_status: "queued_for_filing",
          provider_stage: "draft_saved",
          recommended_action: "none",
          summary_reason: "Draft save proof is available and the filing is queued.",
          latest_message: "Draft saved to WhiteBooks and queued for further processing.",
          has_provider_failure: false,
          intervention_count: 0,
          evidence_flags: {
            save_response: true,
            offset_response: false,
            proceed_response: false,
            file_response: false,
            status_response: false,
            track_response: false,
          },
        },
        provider_evidence_summary: {
          provider_stage: "draft_saved",
          latest_message: "Draft saved to WhiteBooks and filing queued for the next step.",
          next_action: "Await offset and final filing.",
          auth_session_id: "session-returns-1",
          operations_requested: ["save"],
          operations_completed: ["save"],
          operations_failed: [],
          evidence_available: {
            save_response: true,
            offset_response: false,
            proceed_response: false,
            file_response: false,
            status_response: false,
            track_response: false,
          },
          latest_failure: null,
        },
        rollout_policy_summary: {
          enforced: true,
          policy_present: true,
          policy_scope: ["workspace", "return_type"],
          provider: "whitebooks",
          return_type: "gstr3b",
          enable_live_submission: true,
          enable_live_status_sync: true,
          live_submission_allowed: true,
          live_status_sync_allowed: true,
          submission_reason: "Rollout allows live submission.",
          status_sync_reason: "Rollout allows live status sync.",
          notes: "",
          effective_from: "2026-06-01T00:00:00Z",
          effective_to: null,
        },
        operational_alerts: [],
        alert_routing_summary: {
          email_delivery_enabled: true,
          routing_mode: "default",
          default_roles: ["owner"],
          matched_rules: [],
          recipients: [{ user_id: 1, name: "Owner Accounts", email: "owner@example.com", role: "owner" }],
        },
        incident_notes: [],
        intervention_history: [],
        latest_attempt: {
          id: "attempt-returns-1",
          status: "queued",
          created_at: "2026-06-05T12:03:00Z",
          updated_at: "2026-06-05T12:03:00Z",
          request_summary: {
            provider_stage: "draft_saved",
          },
          response_summary: {
            provider_stage: "draft_saved",
            auth_session_id: "session-returns-1",
            next_action: "await_gstr3b_final_filing_automation",
            message: "Draft saved to WhiteBooks and filing queued for the next step.",
          },
        },
        updated_at: "2026-06-05T12:03:00Z",
      });
      filingAttempts = [
        {
          id: "attempt-returns-1",
          status: "queued",
          created_at: "2026-06-05T12:03:00Z",
          updated_at: "2026-06-05T12:03:00Z",
          request_summary: {
            provider_stage: "draft_saved",
          },
          response_summary: {
            provider_stage: "draft_saved",
            auth_session_id: "session-returns-1",
            message: "Draft saved to WhiteBooks and filing queued for the next step.",
          },
        },
      ];
      filingEvents = [
        {
          id: "event-returns-1",
          event_type: "filing.draft_saved",
          created_at: "2026-06-05T12:03:00Z",
          metadata: {
            provider_stage: "draft_saved",
          },
        },
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "Success", data: filing }),
      });
    });

    await page.route(/\/api\/backend\/filings\/filing-returns-1\/attempts\/$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: filingAttempts,
          pagination: { count: filingAttempts.length, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/filings\/filing-returns-1\/events\/$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: filingEvents,
          pagination: { count: filingEvents.length, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await returnsPage.goto();
    await returnsPage.expectReady();

    await page.getByTestId("return-open-return-approved-gstr3b").click();

    const reviewDialog = page.getByRole("dialog", { name: "GSTR3B review summary" });
    await expect(reviewDialog).toBeVisible();
    await expect(reviewDialog.getByText("Follow this simple sequence: approve the draft, complete OTP verification, then start live filing.")).toBeVisible();
    await expect(reviewDialog.getByText("Request OTP, then verify it in the section below.")).toBeVisible();

    await reviewDialog.getByRole("button", { name: "Request OTP", exact: true }).click();
    await expect(page.getByText("Provider OTP requested.")).toBeVisible();
    await expect(reviewDialog.getByText("otp requested")).toBeVisible();
    await expect(reviewDialog.getByText("txn-live-returns-001")).toBeVisible();

    await reviewDialog.getByLabel("OTP").fill("482913");
    await reviewDialog.getByRole("button", { name: "Verify OTP", exact: true }).click();

    await expect(page.getByText("Provider session activated.")).toBeVisible();
    await expect(reviewDialog.getByText("OTP verified. This filing session is now active for this GSTIN and can be used for up to 6 hours.")).toBeVisible();
    await expect(reviewDialog.getByText("Active for this GSTIN", { exact: true })).toBeVisible();

    await reviewDialog.getByRole("button", { name: "Start filing", exact: true }).click();

    await expect(page.getByText("Provider filing started.")).toBeVisible();
    await expect(reviewDialog.getByText("Filing request accepted. Use the status cards below to track gateway progress.")).toBeVisible();
    await expect(reviewDialog.getByText("draft saved, awaiting offset", { exact: true }).first()).toBeVisible();
    await expect(reviewDialog.getByText("queued for filing", { exact: true }).first()).toBeVisible();
    await expect(reviewDialog.getByText("Draft saved to WhiteBooks and filing queued for the next step.").first()).toBeVisible();
    await expect(reviewDialog.getByText("draft saved to filing channel", { exact: true }).first()).toBeVisible();
  });

  test("@launch lets the operator retry, refresh, and requeue a failed filing from the returns workspace", async ({ page, app }) => {
    const approvedReturn = createPreparedReturn({
      id: "return-recovery-gstr3b",
      return_type: "gstr3b",
      status: "approved",
      approved_by: 1,
      approved_by_name: "Owner Accounts",
      updated_at: "2026-06-05T11:45:00Z",
    });

    let filing = createFilingOperation({
      id: "filing-recovery-1",
      prepared_return: "return-recovery-gstr3b",
      return_type: "gstr3b",
      status: "needs_retry",
      support_status_summary: {
        filing_status: "needs_retry",
        provider_stage: "submitted",
        recommended_action: "retry_filing",
        summary_reason: "The provider reported a retryable transmission failure.",
        latest_message: "Gateway timeout while submitting to provider.",
        has_provider_failure: true,
        intervention_count: 1,
        evidence_flags: {
          save_response: true,
          offset_response: true,
          proceed_response: false,
          file_response: true,
          status_response: false,
          track_response: false,
        },
      },
      support_actions_summary: {
        recommended_action: "retry_filing",
        summary_reason: "The provider reported a retryable transmission failure.",
        actions: [
          { action: "retry", label: "Retry filing", allowed: true, reason: "Safe retry is available." },
          { action: "resync", label: "Refresh status", allowed: true, reason: "Status sync is available." },
          { action: "requeue_after_review", label: "Requeue after review", allowed: true, reason: "Manual review can requeue the filing." },
        ],
      },
      latest_attempt: {
        id: "attempt-recovery-1",
        status: "failed",
        created_at: "2026-06-05T12:10:00Z",
        updated_at: "2026-06-05T12:10:00Z",
        request_summary: {
          provider_stage: "submitted",
        },
        response_summary: {
          provider_stage: "submitted",
          auth_session_id: "session-recovery-1",
          next_action: "retry_filing",
          retryable: true,
          message: "Gateway timeout while submitting to provider.",
          failure_summary: {
            retryable: true,
          },
        },
      },
      intervention_history: [
        {
          id: "intervention-recovery-1",
          action: "retry_requested",
          label: "Retry requested",
          new_status: "needs_retry",
          actor_name: "Owner Accounts",
          created_at: "2026-06-05T12:10:00Z",
          note: "Operational review requested a retry.",
        },
      ],
    });

    let filingAttempts: Array<Record<string, unknown>> = [
      {
        id: "attempt-recovery-1",
        status: "failed",
        created_at: "2026-06-05T12:10:00Z",
        updated_at: "2026-06-05T12:10:00Z",
        request_summary: {
          provider_stage: "submitted",
        },
        response_summary: {
          provider_stage: "submitted",
          auth_session_id: "session-recovery-1",
          next_action: "retry_filing",
          retryable: true,
          message: "Gateway timeout while submitting to provider.",
        },
      },
    ];

    let filingEvents: Array<Record<string, unknown>> = [
      {
        id: "event-recovery-1",
        event_type: "filing.file_failed",
        created_at: "2026-06-05T12:10:00Z",
        metadata: {
          provider_stage: "submitted",
        },
      },
    ];

    await app.mockAuthenticatedShell();
    await app.mockReturnsApis();

    await page.route(/\/api\/backend\/returns\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [approvedReturn],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/returns\/return-recovery-gstr3b\/$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "Success", data: approvedReturn }),
      });
    });

    await page.route(/\/api\/backend\/approvals\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [],
          pagination: { count: 0, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/provider-auth-sessions\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [{
            id: "session-recovery-1",
            workspace: "workspace-1",
            client: "client-1",
            gstin: "gstin-1",
            provider: "whitebooks",
            status: "session_active",
            txn: "txn-recovery-001",
            response_contract_confirmed: true,
            last_requested_at: "2026-06-05T12:00:00Z",
            last_verified_at: "2026-06-05T12:02:00Z",
            freshness_summary: {
              verified_at: "2026-06-05T12:02:00Z",
              expires_at: "2026-06-05T18:02:00Z",
              is_stale: false,
              stale_reason: "",
            },
          }],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/filings\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: [filing],
          pagination: { count: 1, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/filings\/filing-recovery-1\/retry\/$/, async (route) => {
      filing = {
        ...filing,
        status: "submitted",
        support_status_summary: {
          ...filing.support_status_summary,
          filing_status: "submitted",
          recommended_action: "resync_status",
          summary_reason: "Retry submitted. Refresh status for confirmation.",
          latest_message: "Retry requested successfully.",
          intervention_count: 2,
        },
        support_actions_summary: {
          ...filing.support_actions_summary,
          recommended_action: "resync_status",
        },
      };
      filingAttempts = [
        {
          id: "attempt-recovery-2",
          status: "submitted",
          created_at: "2026-06-05T12:20:00Z",
          updated_at: "2026-06-05T12:20:00Z",
          request_summary: {
            provider_stage: "submitted",
          },
          response_summary: {
            provider_stage: "submitted",
            auth_session_id: "session-recovery-1",
            message: "Retry requested successfully.",
          },
        },
        ...filingAttempts,
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "Success", data: filing }),
      });
    });

    await page.route(/\/api\/backend\/filings\/filing-recovery-1\/resync\/$/, async (route) => {
      filing = {
        ...filing,
        last_status_sync_at: "2026-06-05T12:25:00Z",
        support_status_summary: {
          ...filing.support_status_summary,
          latest_message: "Status refreshed from provider.",
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "Success", data: filing }),
      });
    });

    await page.route(/\/api\/backend\/filings\/filing-recovery-1\/requeue-after-review\/$/, async (route) => {
      filing = {
        ...filing,
        status: "queued_for_filing",
        support_status_summary: {
          ...filing.support_status_summary,
          filing_status: "queued_for_filing",
          recommended_action: "none",
          summary_reason: "Queued after review.",
          latest_message: "Returned to filing queue.",
        },
        support_actions_summary: {
          ...filing.support_actions_summary,
          recommended_action: "none",
        },
      };
      filingEvents = [
        {
          id: "event-recovery-2",
          event_type: "filing.recovery_requeued",
          created_at: "2026-06-05T12:30:00Z",
          metadata: {
            provider_stage: "submitted",
          },
        },
        ...filingEvents,
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "Success", data: filing }),
      });
    });

    await page.route(/\/api\/backend\/filings\/filing-recovery-1\/attempts\/$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: filingAttempts,
          pagination: { count: filingAttempts.length, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.route(/\/api\/backend\/filings\/filing-recovery-1\/events\/$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "Success",
          data: filingEvents,
          pagination: { count: filingEvents.length, next: null, previous: null, page: 1, page_size: 50 },
        }),
      });
    });

    await page.goto("/returns");
    await expect(page.getByRole("main").getByRole("heading", { name: "Returns", exact: true })).toBeVisible();

    await page.getByTestId("return-open-return-recovery-gstr3b").click();

    const reviewDialog = page.getByRole("dialog", { name: "GSTR3B review summary" });
    await expect(reviewDialog).toBeVisible();
    await expect(reviewDialog.getByText("Gateway timeout while submitting to provider.").first()).toBeVisible();

    await reviewDialog.getByRole("button", { name: "Retry filing", exact: true }).click();
    await expect(page.getByText("Filing retry started.")).toBeVisible();
    await expect(reviewDialog.getByText("Retry request accepted. Refresh status after the provider processes the next attempt.")).toBeVisible();

    await reviewDialog.getByRole("button", { name: "Refresh status", exact: true }).click();
    await expect(page.getByText("Filing status refreshed.")).toBeVisible();
    await expect(reviewDialog.getByText("Status refresh requested. Check the filing progress section for the next provider update.")).toBeVisible();
    await expect(reviewDialog.getByText("Status refreshed from provider.").first()).toBeVisible();

    await reviewDialog.getByRole("button", { name: "Requeue after review", exact: true }).click();
    await expect(page.getByText("Filing requeued after review.")).toBeVisible();
    await expect(reviewDialog.getByText("Requeue request accepted. Resume tracking in the filing progress section below.")).toBeVisible();
    await expect(reviewDialog.getByText("queued for filing", { exact: true }).first()).toBeVisible();
    await expect(reviewDialog.getByText("requeued after review", { exact: true }).first()).toBeVisible();
  });
});
