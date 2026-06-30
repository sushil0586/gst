import { expect, type Page, type Route } from "@playwright/test";

import {
  createImportBatchRecord,
  createPreparedReturnRecord,
  createReconciliationRunRecord,
  createWorkspaceContextPayload,
  defaultSessionPayload,
} from "./gst-data";

function successResponse(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "success",
      message: "Success",
      data,
    }),
  };
}

function paginatedResponse(data: unknown[], count = data.length) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "success",
      message: "Success",
      data,
      pagination: {
        count,
        next: null,
        previous: null,
        page: 1,
        page_size: 50,
      },
    }),
  };
}

function buildTransactionRecords(transactionType: string, count: number, sourceBatchId: string) {
  return Array.from({ length: count }, (_, index) => ({
    id: `txn-${transactionType}-${index + 1}`,
    workspace: "workspace-1",
    client: "client-1",
    client_name: "Acme Client Private Limited",
    gstin: "gstin-1",
    gstin_value: "27ABCDE1234F1Z5",
    compliance_period: "period-1",
    compliance_period_label: "2026-05",
    transaction_type: transactionType,
    document_type: "invoice",
    document_number: `INV-${index + 1}`,
    document_date: "2026-05-05",
    counterparty_gstin: "29ABCDE1234F1Z5",
    counterparty_name: "Vendor One",
    taxable_value: "1000.00",
    cgst_amount: "90.00",
    sgst_amount: "90.00",
    igst_amount: "0.00",
    cess_amount: "0.00",
    total_amount: "1180.00",
    tax_amount: "180.00",
    place_of_supply: "27",
    reverse_charge: false,
    source_import_batch: sourceBatchId,
    status: "processed",
    line_items: [],
    created_at: "2026-06-05T10:25:00Z",
    updated_at: "2026-06-05T10:25:00Z",
  }));
}

export class GstApiMock {
  constructor(private readonly page: Page) {}

  async mockAuthenticatedWorkspace() {
    await this.page.route("**/api/auth/me", async (route) => {
      await route.fulfill(successResponse(defaultSessionPayload));
    });

    await this.page.route("**/api/backend/workspaces/context/**", async (route) => {
      await route.fulfill(successResponse(createWorkspaceContextPayload()));
    });
  }

  async mockMonthlyComplianceWorkflow() {
    const importBatches: Array<Record<string, unknown>> = [
      createImportBatchRecord(),
      createImportBatchRecord({
        id: "batch-2",
        import_type: "sales",
        file_name: "sales_standard.csv",
        transaction_count: 18,
      }),
      createImportBatchRecord({
        id: "batch-3",
        import_type: "gstr_2b",
        source_type: "provider",
        file_name: "gstr_2b_fetched.json",
        transaction_count: 18,
      }),
    ];
    let reconciliationRuns: Array<Record<string, unknown>> = [createReconciliationRunRecord()];
    let preparedReturns: Array<Record<string, unknown>> = [];
    let preparedReturnSeen = false;

    await this.page.route("**/api/backend/import-templates/**", async (route) => {
      await route.fulfill(paginatedResponse([]));
    });

    await this.page.route("**/api/backend/imports/batches/**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill(paginatedResponse(importBatches));
        return;
      }

      await route.fulfill(successResponse(importBatches[0]));
    });

    await this.page.route("**/api/backend/gst-transactions/**", async (route) => {
      const url = new URL(route.request().url());
      const transactionType = url.searchParams.get("transaction_type") ?? "purchase";
      const count = transactionType === "purchase" ? 24 : 18;
      const sourceBatchId =
        (importBatches.find((entry) => entry.import_type === transactionType)?.id as string | undefined)
        ?? "batch-1";
      await route.fulfill(paginatedResponse(buildTransactionRecords(transactionType, count, sourceBatchId), count));
    });

    await this.page.route("**/api/backend/reconciliation/runs/", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill(paginatedResponse(reconciliationRuns));
        return;
      }

      const payload = route.request().postDataJSON() as Record<string, string>;
      expect(payload.compliance_period).toBe("period-1");
      const run = createReconciliationRunRecord();
      reconciliationRuns = [run];
      await route.fulfill(successResponse(run));
    });

    await this.page.route("**/api/backend/reconciliation/runs/*/items/**", async (route) => {
      await route.fulfill(paginatedResponse([]));
    });

    await this.page.route("**/api/backend/reconciliation/runs/*", async (route) => {
      await route.fulfill(successResponse(reconciliationRuns[0] ?? createReconciliationRunRecord()));
    });

    await this.page.route("**/api/backend/returns/readiness/**", async (route) => {
      const preparedReturn =
        preparedReturns.find((entry) => entry.return_type === "gstr3b") ?? null;
      const readyState = {
        status: "ready",
        can_prepare: true,
        can_export: true,
        warning_count: 0,
        error_count: 0,
        issues: [],
        prepared_return: null,
        metrics: {},
      };
      await route.fulfill(successResponse({
        context: {
          workspace: "workspace-1",
          workspace_name: "Primary Workspace",
          client: "client-1",
          client_name: "Acme Client Private Limited",
          gstin: "gstin-1",
          gstin_value: "27ABCDE1234F1Z5",
          compliance_period: "period-1",
          period_label: "2026-05",
          is_locked: false,
        },
        gstr1: {
          return_type: "gstr1",
          ...readyState,
        },
        gstr3b: {
          return_type: "gstr3b",
          ...readyState,
          prepared_return: preparedReturn
            ? {
                id: String(preparedReturn.id),
                status: "draft",
                updated_at: String(preparedReturn.updated_at),
              }
            : null,
        },
        gstr7: {
          return_type: "gstr7",
          ...readyState,
        },
        gstr9: {
          return_type: "gstr9",
          ...readyState,
        },
        gstr9c: {
          return_type: "gstr9c",
          ...readyState,
        },
        overall_status: "ready",
      }));
    });

    await this.page.route("**/api/backend/returns/prepare/", async (route) => {
      preparedReturnSeen = true;
      const payload = route.request().postDataJSON() as Record<string, string>;
      expect(payload.return_type).toBe("gstr3b");
      expect(payload.compliance_period).toBe("period-1");
      const preparedReturn = createPreparedReturnRecord();
      preparedReturns = [preparedReturn];
      await route.fulfill(successResponse(preparedReturn));
    });

    await this.page.route("**/api/backend/returns/", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fulfill(successResponse(preparedReturns[0] ?? createPreparedReturnRecord()));
        return;
      }
      await route.fulfill(paginatedResponse(preparedReturns));
    });

    await this.page.route(/\/api\/backend\/returns\/[^/]+\/$/, async (route) => {
      await route.fulfill(successResponse(preparedReturns[0] ?? createPreparedReturnRecord()));
    });

    await this.page.route("**/api/backend/approvals/**", async (route) => {
      await route.fulfill(paginatedResponse([]));
    });

    await this.page.route("**/api/backend/filings/**", async (route) => {
      await route.fulfill(paginatedResponse([]));
    });

    await this.page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
      await route.fulfill(paginatedResponse([]));
    });

    await this.page.route("**/api/backend/returns/portal-filing-readiness/**", async (route) => {
      await route.fulfill(successResponse({
        computed_summary: {
          net_tax_payable: "81000.00",
          eligible_itc: "72000.00",
        },
        auth_session: {
          available: false,
          freshness_summary: {
            is_stale: false,
            stale_reason: "",
          },
        },
        portal_sync: {
          can_fetch: false,
          enabled: true,
          payment_reads_enabled: false,
          blockers: [],
          warnings: [],
          transport_error: "",
        },
        provider_evidence: {
          source: "unavailable",
          fetched_at: null,
          snapshot_id: null,
          cash_ledger_summary: {
            opening_total: "0.00",
            closing_total: "0.00",
            transaction_count: 0,
            from_date: "",
            to_date: "",
            closing_breakdown: {
              cgst: "0.00",
              sgst: "0.00",
              igst: "0.00",
              cess: "0.00",
            },
          },
          itc_ledger_summary: {
            opening_total: "0.00",
            closing_total: "0.00",
            transaction_count: 0,
          },
          liability_ledger_summary: {
            opening_total: "0.00",
            closing_total: "0.00",
            transaction_count: 0,
          },
          cash_ledger_response: null,
          itc_ledger_response: null,
          liability_ledger_response: null,
          challan_history_response: null,
          challan_summary_response: null,
          challan_reference: "",
        },
      }));
    });

    await this.page.route("**/api/backend/returns/portal-challan-requests/**", async (route) => {
      await route.fulfill(successResponse([]));
    });

    return {
      wasPreparedReturnRequested() {
        return preparedReturnSeen;
      },
    };
  }
}

export async function fulfillJson(route: Route, data: unknown) {
  await route.fulfill(successResponse(data));
}
