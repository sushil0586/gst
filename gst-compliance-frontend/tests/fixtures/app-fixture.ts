import { expect, test as base, type Page } from "@playwright/test";
import type {
  ApprovalRequestRecord,
  AuditLogRecord,
  GSTTransactionRecord,
  ImportBatchRecord,
  NoticeRecordApi,
  OperationalFollowUpRecord,
  PortalChallanRecord,
  ReconciliationItemRecord,
  ReconciliationRunRecord,
  ReturnPreparationRecord,
  ReturnFilingOperationsRecord,
  TransactionRemediationAssignmentRecord,
  TransactionRemediationFollowUpRecord,
  TransactionReviewSnapshotRecord,
} from "@/types/api";

import {
  createApprovalRequest,
  createAuditLog,
  createCloseManagerReport,
  createDashboardSummary,
  createFilingOperation,
  createGstTransaction,
  createImportBatch,
  createNotice,
  createOperationalFollowUp,
  createPreparedReturn,
  createReconciliationItem,
  createReconciliationRun,
  createReturnStatusRow,
  createRemediationAssignment,
  createRemediationFollowUp,
  createRemediationSnapshot,
  createWorkspaceContext,
  createWorkspaceMember,
  sampleClient,
  sampleGstin,
  samplePeriod,
  sessionPayload,
} from "./app-data";

function jsonSuccess(data: unknown) {
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

function paginated(data: unknown[], count = data.length) {
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

class QaAppMock {
  private signedIn = false;

  constructor(private readonly page: Page) {}

  async mockLoggedOutShell() {
    await this.page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not authenticated" }),
      });
    });
  }

  async mockAuthFlows() {
    await this.page.route("**/api/auth/me", async (route) => {
      if (!this.signedIn) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Not authenticated" }),
        });
        return;
      }
      await route.fulfill(jsonSuccess(sessionPayload));
    });

    await this.page.route("**/api/auth/login", async (route) => {
      this.signedIn = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: sessionPayload }),
      });
    });

    await this.page.route("**/api/auth/register", async (route) => {
      this.signedIn = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: sessionPayload }),
      });
    });

    await this.page.route("**/api/auth/forgot-password", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Reset link sent." }),
      });
    });

    await this.page.route("**/api/auth/reset-password", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Password reset successful." }),
      });
    });

    await this.page.route("**/api/auth/change-password", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Password changed successfully." }),
      });
    });

    await this.page.route("**/api/auth/logout", async (route) => {
      this.signedIn = false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });
  }

  async mockAuthenticatedShell(options?: {
    limitedPermissions?: boolean;
    customPermissions?: string[];
    noContext?: boolean;
    lockedPeriod?: boolean;
    skipSessionRoute?: boolean;
  }) {
    const session = options?.customPermissions
      ? {
          ...sessionPayload,
          workspaces: [{
            ...sessionPayload.workspaces[0],
            permissions: options.customPermissions,
          }],
          default_workspace: {
            ...sessionPayload.default_workspace,
            permissions: options.customPermissions,
          },
          permissions_summary: {
            codes: options.customPermissions,
            total: options.customPermissions.length,
            memberships: [{
              ...sessionPayload.permissions_summary.memberships[0],
              permissions: options.customPermissions,
            }],
          },
        }
      : options?.limitedPermissions
      ? {
          ...sessionPayload,
          workspaces: [{
            ...sessionPayload.workspaces[0],
            permissions: ["view_client"],
          }],
          default_workspace: {
            ...sessionPayload.default_workspace,
            permissions: ["view_client"],
          },
          permissions_summary: {
            codes: ["view_client"],
            total: 1,
            memberships: [{
              ...sessionPayload.permissions_summary.memberships[0],
              permissions: ["view_client"],
            }],
          },
        }
      : sessionPayload;

    const context = options?.noContext
      ? createWorkspaceContext({ clients: [], gstins: [], periods: [] })
      : createWorkspaceContext({
          periods: [{
            ...samplePeriod,
            is_locked: options?.lockedPeriod ?? false,
          }],
        });

    if (!options?.skipSessionRoute) {
      await this.page.route("**/api/auth/me", async (route) => {
        await route.fulfill(jsonSuccess(session));
      });
    }

    await this.page.route("**/api/backend/workspaces/context/**", async (route) => {
      await route.fulfill(jsonSuccess(context));
    });

    await this.page.route("**/api/backend/workspaces/", async (route) => {
      await route.fulfill(paginated([{
        id: "workspace-1",
        organization: "org-1",
        name: "Primary Workspace",
        code: "PRIMARY",
        timezone: "Asia/Kolkata",
        is_active: true,
      }]));
    });

    await this.page.route("**/api/backend/organizations/", async (route) => {
      await route.fulfill(paginated([{
        id: "org-1",
        name: "Acme Org",
        code: "ACME-ORG",
      }]));
    });

    await this.page.route("**/api/backend/client-contacts/**", async (route) => {
      await route.fulfill(paginated([]));
    });
  }

  async mockDashboardApis() {
    await this.page.route(/\/api\/backend\/dashboard\/summary\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(jsonSuccess(createDashboardSummary()));
    });
    await this.page.route(/\/api\/backend\/dashboard\/close-manager\/report\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(jsonSuccess(createCloseManagerReport()));
    });
    await this.page.route("**/api/backend/gst-transaction-remediation-digests/**", async (route) => {
      await route.fulfill(paginated([]));
    });
    await this.page.route("**/api/backend/filings/operations/**", async (route) => {
      await route.fulfill(paginated([]));
    });
  }

  async mockFoundationApis(options?: { lockedPeriod?: boolean }) {
    let clients = [sampleClient];
    let gstins = [sampleGstin];
    let periods = [{ ...samplePeriod, is_locked: options?.lockedPeriod ?? false }];

    const currentContext = () =>
      createWorkspaceContext({
        clients,
        gstins,
        periods,
      });

    await this.page.route("**/api/backend/workspaces/context/**", async (route) => {
      await route.fulfill(jsonSuccess(currentContext()));
    });

    await this.page.route(/\/api\/backend\/clients\/?(?:\?.*)?$/, async (route) => {
      const request = route.request();

      if (request.method() === "GET") {
        await route.fulfill(paginated(clients));
        return;
      }

      const payload = request.postDataJSON() as Record<string, string>;
      const nextClient = {
        ...sampleClient,
        id: `client-${clients.length + 1}`,
        workspace: payload.workspace,
        legal_name: payload.legal_name,
        trade_name: payload.trade_name ?? "",
        client_code: payload.client_code,
        pan: payload.pan,
        email: payload.email ?? "",
        can_delete: true,
        transaction_count: 0,
      };
      clients = [...clients, nextClient];
      await route.fulfill(jsonSuccess(nextClient));
    });

    await this.page.route("**/api/backend/clients/bootstrap/", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, string>;
      const nextClient = {
        ...sampleClient,
        id: `client-${clients.length + 1}`,
        workspace: payload.workspace,
        legal_name: payload.legal_name,
        trade_name: payload.trade_name ?? "",
        client_code: payload.client_code,
        pan: payload.pan,
        email: payload.email ?? "",
        can_delete: true,
        transaction_count: 0,
      };
      const nextGstin = {
        ...sampleGstin,
        id: `gstin-${gstins.length + 1}`,
        client: nextClient.id,
        gstin: payload.gstin,
        registration_type: payload.registration_type ?? "regular",
        state_code: payload.state_code ?? String(payload.gstin).slice(0, 2),
        whitebooks_gst_username: payload.whitebooks_gst_username ?? "",
      };
      clients = [...clients, nextClient];
      gstins = [...gstins, nextGstin];
      await route.fulfill(jsonSuccess({ client: nextClient, gstin: nextGstin }));
    });

    await this.page.route(/\/api\/backend\/clients\/[^/]+\/$/, async (route) => {
      const clientId = route.request().url().split("/clients/")[1]?.replace(/\/$/, "");
      const request = route.request();

      if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as Record<string, string>;
        clients = clients.map((client) =>
          client.id === clientId
            ? {
                ...client,
                ...payload,
              }
            : client,
        );
        await route.fulfill(jsonSuccess(clients.find((client) => client.id === clientId) ?? sampleClient));
        return;
      }

      if (request.method() === "DELETE") {
        clients = clients.filter((client) => client.id !== clientId);
        gstins = gstins.filter((gstin) => gstin.client !== clientId);
        const remainingGstinIds = new Set(gstins.map((gstin) => gstin.id));
        periods = periods.filter((period) => remainingGstinIds.has(period.gstin));
        await route.fulfill({
          status: 204,
          contentType: "application/json",
          body: "",
        });
        return;
      }

      await route.fulfill(jsonSuccess(clients.find((client) => client.id === clientId) ?? sampleClient));
    });

    await this.page.route(/\/api\/backend\/gstins\/search-taxpayer\/?(?:\?.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      const gstin = (url.searchParams.get("gstin") ?? sampleGstin.gstin).toUpperCase();
      await route.fulfill(jsonSuccess({
        gstin,
        legal_name: "Lookup Client Private Limited",
        trade_name: "Lookup Client",
        pan: gstin.slice(2, 12),
        state_code: gstin.slice(0, 2),
        registration_type: "regular",
        raw_payload: {
          gstin,
        },
      }));
    });

    await this.page.route(/\/api\/backend\/gstins\/?(?:\?.*)?$/, async (route) => {
      const request = route.request();

      if (request.method() === "GET") {
        const url = new URL(request.url());
        const clientId = url.searchParams.get("client");
        const items = clientId ? gstins.filter((gstin) => gstin.client === clientId) : gstins;
        await route.fulfill(paginated(items));
        return;
      }

      const payload = request.postDataJSON() as Record<string, string>;
      const nextGstin = {
        ...sampleGstin,
        id: `gstin-${gstins.length + 1}`,
        client: payload.client,
        gstin: payload.gstin,
        registration_type: payload.registration_type ?? "regular",
        state_code: payload.state_code,
        whitebooks_gst_username: payload.whitebooks_gst_username ?? "",
      };
      gstins = [...gstins, nextGstin];
      await route.fulfill(jsonSuccess(nextGstin));
    });

    await this.page.route(/\/api\/backend\/gstins\/[^/]+\/$/, async (route) => {
      const gstinId = route.request().url().split("/gstins/")[1]?.replace(/\/$/, "");
      const request = route.request();

      if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as Record<string, string>;
        gstins = gstins.map((gstin) =>
          gstin.id === gstinId
            ? {
                ...gstin,
                ...payload,
              }
            : gstin,
        );
        await route.fulfill(jsonSuccess(gstins.find((gstin) => gstin.id === gstinId) ?? sampleGstin));
        return;
      }

      await route.fulfill(jsonSuccess(gstins.find((gstin) => gstin.id === gstinId) ?? sampleGstin));
    });

    await this.page.route(/\/api\/backend\/compliance-periods\/?(?:\?.*)?$/, async (route) => {
      const request = route.request();

      if (request.method() === "GET") {
        const url = new URL(request.url());
        const gstinId = url.searchParams.get("gstin");
        const items = gstinId ? periods.filter((period) => period.gstin === gstinId) : periods;
        await route.fulfill(paginated(items));
        return;
      }

      const payload = request.postDataJSON() as Record<string, string>;
      const nextPeriod = {
        ...samplePeriod,
        id: `period-${periods.length + 1}`,
        gstin: payload.gstin,
        gstin_value: gstins.find((gstin) => gstin.id === payload.gstin)?.gstin ?? sampleGstin.gstin,
        client_id: gstins.find((gstin) => gstin.id === payload.gstin)?.client ?? sampleClient.id,
        client_name:
          clients.find((client) => client.id === gstins.find((gstin) => gstin.id === payload.gstin)?.client)?.legal_name
          ?? sampleClient.legal_name,
        period: payload.period,
        return_type: payload.return_type,
        status: payload.status,
        due_date: payload.due_date ?? null,
        is_locked: false,
      };
      periods = [...periods, nextPeriod];
      await route.fulfill(jsonSuccess(nextPeriod));
    });

    await this.page.route(/\/api\/backend\/compliance-periods\/[^/]+\/lock\/$/, async (route) => {
      const periodId = route.request().url().split("/compliance-periods/")[1]?.replace(/\/lock\/$/, "");
      periods = periods.map((period) => (period.id === periodId ? { ...period, is_locked: true } : period));
      await route.fulfill(jsonSuccess(periods.find((period) => period.id === periodId) ?? samplePeriod));
    });

    await this.page.route(/\/api\/backend\/compliance-periods\/[^/]+\/unlock\/$/, async (route) => {
      const periodId = route.request().url().split("/compliance-periods/")[1]?.replace(/\/unlock\/$/, "");
      periods = periods.map((period) => (period.id === periodId ? { ...period, is_locked: false } : period));
      await route.fulfill(jsonSuccess(periods.find((period) => period.id === periodId) ?? samplePeriod));
    });

    await this.page.route(/\/api\/backend\/compliance-periods\/[^/]+\/$/, async (route) => {
      const periodId = route.request().url().split("/compliance-periods/")[1]?.replace(/\/$/, "");
      const request = route.request();

      if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as Record<string, string>;
        periods = periods.map((period) =>
          period.id === periodId
            ? {
                ...period,
                ...payload,
              }
            : period,
        );
        await route.fulfill(jsonSuccess(periods.find((period) => period.id === periodId) ?? samplePeriod));
        return;
      }

      await route.fulfill(jsonSuccess(periods.find((period) => period.id === periodId) ?? samplePeriod));
    });
  }

  async mockWorkspaceMembersApis() {
    let members = [
      createWorkspaceMember(),
      createWorkspaceMember({
        id: "membership-2",
        email: "seniorca@example.com",
        first_name: "Senior",
        last_name: "Reviewer",
        full_name: "Senior Reviewer",
        role: "senior_ca",
        permissions: ["prepare_return", "approve_return"],
      }),
    ];

    await this.page.route(/\/api\/backend\/workspace-members\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill(paginated(members));
        return;
      }
      const payload = route.request().postDataJSON() as Record<string, string>;
      const nextMember = createWorkspaceMember({
        id: `membership-${members.length + 1}`,
        email: payload.email,
        first_name: payload.first_name,
        last_name: payload.last_name ?? "",
        full_name: `${payload.first_name} ${payload.last_name ?? ""}`.trim(),
        role: payload.role,
      });
      members = [...members, nextMember];
      await route.fulfill(jsonSuccess(nextMember));
    });

    await this.page.route(/\/api\/backend\/workspace-members\/[^/]+\/$/, async (route) => {
      const memberId = route.request().url().split("/workspace-members/")[1]?.replace(/\/$/, "");
      if (route.request().method() === "PATCH") {
        const payload = route.request().postDataJSON() as Record<string, string>;
        members = members.map((member) =>
          member.id === memberId
            ? {
                ...member,
                role: payload.role ?? member.role,
                first_name: payload.first_name ?? member.first_name,
                last_name: payload.last_name ?? member.last_name,
                full_name: `${payload.first_name ?? member.first_name} ${payload.last_name ?? member.last_name}`.trim(),
              }
            : member,
        );
        await route.fulfill(jsonSuccess(members.find((member) => member.id === memberId)));
        return;
      }
      members = members.filter((member) => member.id !== memberId);
      await route.fulfill({
        status: 204,
        contentType: "application/json",
        body: "",
      });
    });
  }

  async mockNoticesApis(options?: { empty?: boolean; error?: boolean }) {
    const members = [
      createWorkspaceMember(),
      createWorkspaceMember({
        id: "membership-2",
        user_id: 31,
        email: "seniorca@example.com",
        first_name: "Senior",
        last_name: "Reviewer",
        full_name: "Senior Reviewer",
        role: "senior_ca",
        permissions: ["prepare_return", "approve_return"],
      }),
    ];
    let notices: NoticeRecordApi[] = options?.empty
      ? []
      : [
          createNotice() as NoticeRecordApi,
          createNotice({
            id: "notice-2",
            reference_number: "DRC-01/2026/44",
            title: "Tax short payment query",
            description: "Demand notice requiring tax shortfall explanation.",
            status: "responded",
            due_date: "2026-06-22",
            assigned_to: 31,
            assigned_to_name: "Senior Reviewer",
            assigned_to_email: "seniorca@example.com",
            created_at: "2026-06-06T09:00:00Z",
            updated_at: "2026-06-06T10:00:00Z",
          }) as NoticeRecordApi,
        ];

    await this.page.route(/\/api\/backend\/workspace-members\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(paginated(members));
    });

    await this.page.route(/\/api\/backend\/notices\/?(?:\?.*)?$/, async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        if (options?.error) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Notice service unavailable" }),
          });
          return;
        }
        const url = new URL(request.url());
        const workspace = url.searchParams.get("workspace");
        const client = url.searchParams.get("client");
        const gstin = url.searchParams.get("gstin");
        const status = url.searchParams.get("status");
        const assignedTo = url.searchParams.get("assigned_to");
        const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();

        const filtered = notices.filter((notice) => {
          if (workspace && notice.workspace_id !== workspace) return false;
          if (client && notice.client_id !== client) return false;
          if (gstin && notice.gstin !== gstin) return false;
          if (status && notice.status !== status) return false;
          if (assignedTo === "unassigned" && notice.assigned_to !== null) return false;
          if (assignedTo && assignedTo !== "unassigned" && String(notice.assigned_to ?? "") !== assignedTo) return false;
          if (!search) return true;

          const haystack = [
            notice.reference_number,
            notice.title,
            notice.gstin_value ?? "",
            notice.client_name ?? "",
          ].join(" ").toLowerCase();
          return haystack.includes(search);
        });

        await route.fulfill(paginated(filtered));
        return;
      }

      const payload = request.postDataJSON() as Record<string, string | number | null>;
      const owner = members.find((member) => member.user_id === Number(payload.assigned_to));
      const nextNotice = createNotice({
        id: `notice-${notices.length + 1}`,
        gstin: String(payload.gstin),
        reference_number: String(payload.reference_number ?? ""),
        title: String(payload.title ?? ""),
        description: String(payload.description ?? ""),
        status: String(payload.status ?? "open"),
        due_date: payload.due_date ? String(payload.due_date) : null,
        assigned_to: typeof payload.assigned_to === "number" ? payload.assigned_to : null,
        assigned_to_name: owner?.full_name ?? null,
        assigned_to_email: owner?.email ?? null,
        created_at: "2026-06-07T11:00:00Z",
        updated_at: "2026-06-07T11:00:00Z",
      }) as NoticeRecordApi;
      notices = [nextNotice, ...notices];
      await route.fulfill(jsonSuccess(nextNotice));
    });

    await this.page.route(/\/api\/backend\/notices\/[^/]+\/$/, async (route) => {
      const noticeId = route.request().url().split("/notices/")[1]?.replace(/\/$/, "");
      const request = route.request();
      const current = notices.find((notice) => notice.id === noticeId) ?? createNotice();

      if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as Record<string, string | number | null>;
        const owner = members.find((member) => member.user_id === Number(payload.assigned_to));
        notices = notices.map((notice) =>
          notice.id === noticeId
            ? {
                ...notice,
                reference_number: String(payload.reference_number ?? notice.reference_number),
                title: String(payload.title ?? notice.title),
                description: String(payload.description ?? notice.description),
                status: String(payload.status ?? notice.status),
                due_date: payload.due_date === null ? null : String(payload.due_date ?? notice.due_date),
                assigned_to: payload.assigned_to === null ? null : typeof payload.assigned_to === "number" ? payload.assigned_to : notice.assigned_to,
                assigned_to_name: payload.assigned_to === null ? null : owner?.full_name ?? notice.assigned_to_name,
                assigned_to_email: payload.assigned_to === null ? null : owner?.email ?? notice.assigned_to_email,
                updated_at: "2026-06-07T12:00:00Z",
              }
            : notice,
        );
        await route.fulfill(jsonSuccess(notices.find((notice) => notice.id === noticeId) ?? current));
        return;
      }

      await route.fulfill(jsonSuccess(current));
    });
  }

  async mockAuditApis(options?: { empty?: boolean; error?: boolean }) {
    const auditLogs: AuditLogRecord[] = options?.empty
      ? []
      : [
          createAuditLog() as AuditLogRecord,
          createAuditLog({
            id: "audit-2",
            actor: 21,
            actor_name: "Filer User",
            action: "notice.updated",
            entity_type: "notice",
            entity_id: "notice-1",
            metadata: { status: "responded" },
            before_state: { status: "open" },
            after_state: { status: "responded" },
            created_at: "2026-06-06T11:30:00Z",
          }) as AuditLogRecord,
          createAuditLog({
            id: "audit-3",
            actor: null,
            actor_name: "System",
            action: "reconciliation.completed",
            entity_type: "reconciliation_run",
            entity_id: "run-1",
            metadata: { matched_count: 24 },
            before_state: { status: "running" },
            after_state: { status: "completed" },
            created_at: "2026-06-07T09:15:00Z",
          }) as AuditLogRecord,
        ];

    await this.page.route(/\/api\/backend\/audit-logs\/?(?:\?.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith("/api/backend/audit-logs/")) {
        await route.continue();
        return;
      }
      if (options?.error) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Audit service unavailable" }),
        });
        return;
      }

      const workspace = url.searchParams.get("workspace_id_ref");
      const client = url.searchParams.get("client_id_ref");
      const gstin = url.searchParams.get("gstin");
      const period = url.searchParams.get("period");
      const action = (url.searchParams.get("action") ?? "").trim().toLowerCase();
      const entityType = (url.searchParams.get("entity_type") ?? "").trim().toLowerCase();
      const dateFrom = url.searchParams.get("date_from");
      const dateTo = url.searchParams.get("date_to");

      const filtered = auditLogs.filter((log) => {
        if (workspace && log.workspace_id_ref !== workspace) return false;
        if (client && log.client_id_ref !== client) return false;
        if (gstin && log.gstin_id_ref !== gstin) return false;
        if (period && log.compliance_period_id_ref !== period) return false;
        if (action && !log.action.toLowerCase().includes(action)) return false;
        if (entityType && !log.entity_type.toLowerCase().includes(entityType)) return false;
        if (dateFrom && log.created_at.slice(0, 10) < dateFrom) return false;
        if (dateTo && log.created_at.slice(0, 10) > dateTo) return false;
        return true;
      });

      await route.fulfill(paginated(filtered));
    });

    await this.page.route(/\/api\/backend\/audit-logs\/[^/]+\/$/, async (route) => {
      const auditId = route.request().url().split("/audit-logs/")[1]?.replace(/\/$/, "");
      await route.fulfill(jsonSuccess(auditLogs.find((log) => log.id === auditId) ?? createAuditLog()));
    });
  }

  async mockReturnStatusReportApis(options?: { empty?: boolean; error?: boolean }) {
    const members = [
      createWorkspaceMember(),
      createWorkspaceMember({
        id: "membership-2",
        user_id: 31,
        email: "seniorca@example.com",
        first_name: "Senior",
        last_name: "Reviewer",
        full_name: "Senior Reviewer",
        role: "senior_ca",
        permissions: ["prepare_return", "approve_return"],
      }),
    ];
    const rows = options?.empty
      ? []
      : [
          createReturnStatusRow(),
          createReturnStatusRow({
            id: "status-row-2",
            client: "client-1",
            client_name: "Acme Client Private Limited",
            return_type: "GSTR-1",
            status: "filed",
            status_bucket: "filed",
            pending_with: "ca_team",
            owner_name: "Senior Reviewer",
            blocker_reason: "",
            open_follow_up_count: 0,
            overdue_follow_up_count: 0,
            latest_follow_up_title: null,
            filing_status: "filed",
            arn: "AA270625000123A",
            filed_at: "2026-06-18",
            is_overdue: false,
          }),
        ];
    let followUps: OperationalFollowUpRecord[] = [createOperationalFollowUp() as OperationalFollowUpRecord];

    await this.page.route(/\/api\/backend\/workspace-members\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(paginated(members));
    });

    await this.page.route(/\/api\/backend\/return-status-register\/?(?:\?.*)?$/, async (route) => {
      if (options?.error) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Return status register unavailable" }),
        });
        return;
      }
      const url = new URL(route.request().url());
      const statusBucket = url.searchParams.get("status_bucket");
      const pendingWith = url.searchParams.get("pending_with");
      const overdueOnly = url.searchParams.get("overdue_only");
      const filtered = rows.filter((row) => {
        if (statusBucket && row.status_bucket !== statusBucket) return false;
        if (pendingWith && row.pending_with !== pendingWith) return false;
        if (overdueOnly === "true" && !row.is_overdue) return false;
        return true;
      });
      await route.fulfill(paginated(filtered));
    });

    await this.page.route(/\/api\/backend\/operational-follow-ups\/?(?:\?.*)?$/, async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill(paginated(followUps));
        return;
      }

      const payload = request.postDataJSON() as Record<string, string | number | null>;
      const nextFollowUp = createOperationalFollowUp({
        id: `follow-up-${followUps.length + 1}`,
        client: String(payload.client),
        gstin: payload.gstin ? String(payload.gstin) : null,
        compliance_period: payload.compliance_period ? String(payload.compliance_period) : null,
        return_preparation: payload.return_preparation ? String(payload.return_preparation) : null,
        return_filing: payload.return_filing ? String(payload.return_filing) : null,
        follow_up_type: String(payload.follow_up_type ?? "general"),
        reason: String(payload.reason ?? ""),
        pending_with: String(payload.pending_with ?? "customer"),
        status: String(payload.status ?? "open"),
        priority: String(payload.priority ?? "medium"),
        title: String(payload.title ?? ""),
        notes: String(payload.notes ?? ""),
        next_action: String(payload.next_action ?? ""),
        due_at: String(payload.due_at ?? "2026-06-20T11:00:00Z"),
        assigned_to: typeof payload.assigned_to === "number" ? payload.assigned_to : null,
        assigned_to_name: typeof payload.assigned_to === "number" && payload.assigned_to === 31 ? "Senior Reviewer" : "Filer User",
        is_overdue: false,
        created_at: "2026-06-07T11:00:00Z",
        updated_at: "2026-06-07T11:00:00Z",
      }) as OperationalFollowUpRecord;
      followUps = [nextFollowUp, ...followUps];
      await route.fulfill(jsonSuccess(nextFollowUp));
    });

    await this.page.route(/\/api\/backend\/operational-follow-ups\/[^/]+\/$/, async (route) => {
      const followUpId = route.request().url().split("/operational-follow-ups/")[1]?.replace(/\/$/, "") ?? "";
      const request = route.request();
      if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as Record<string, string | number | null>;
        followUps = followUps.map((followUp) =>
          followUp.id === followUpId
            ? {
                ...followUp,
                ...payload,
                assigned_to_name: typeof payload.assigned_to === "number" && payload.assigned_to === 31 ? "Senior Reviewer" : followUp.assigned_to_name,
                updated_at: "2026-06-07T12:15:00Z",
              } as OperationalFollowUpRecord
            : followUp,
        );
      }
      await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createOperationalFollowUp()));
    });

    await this.page.route(/\/api\/backend\/operational-follow-ups\/[^/]+\/mark-completed\/$/, async (route) => {
      const followUpId = route.request().url().split("/operational-follow-ups/")[1]?.split("/")[0] ?? "";
      const payload = route.request().postDataJSON() as Record<string, string>;
        followUps = followUps.map((followUp) =>
          followUp.id === followUpId
            ? {
                ...followUp,
                status: "completed",
                closed_reason: payload.closed_reason ?? followUp.closed_reason,
                completed_at: "2026-06-07T12:30:00Z",
                updated_at: "2026-06-07T12:30:00Z",
                is_overdue: false,
            } as OperationalFollowUpRecord
          : followUp,
      );
      await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createOperationalFollowUp()));
    });

    await this.page.route(/\/api\/backend\/operational-follow-ups\/[^/]+\/mark-escalated\/$/, async (route) => {
      const followUpId = route.request().url().split("/operational-follow-ups/")[1]?.split("/")[0] ?? "";
      followUps = followUps.map((followUp) =>
        followUp.id === followUpId
          ? {
              ...followUp,
              status: "escalated",
              escalated_at: "2026-06-07T12:20:00Z",
              updated_at: "2026-06-07T12:20:00Z",
            } as OperationalFollowUpRecord
          : followUp,
      );
      await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createOperationalFollowUp()));
    });

    await this.page.route(/\/api\/backend\/operational-follow-ups\/[^/]+\/log-contact\/$/, async (route) => {
      const followUpId = route.request().url().split("/operational-follow-ups/")[1]?.split("/")[0] ?? "";
      followUps = followUps.map((followUp) =>
        followUp.id === followUpId
          ? {
              ...followUp,
              last_contacted_at: "2026-06-07T12:10:00Z",
              updated_at: "2026-06-07T12:10:00Z",
            } as OperationalFollowUpRecord
          : followUp,
      );
      await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createOperationalFollowUp()));
    });
  }

  async mockOperationalFollowUpsApis(options?: { empty?: boolean; error?: boolean }) {
    const members = [
      createWorkspaceMember(),
      createWorkspaceMember({
        id: "membership-2",
        user_id: 31,
        email: "seniorca@example.com",
        first_name: "Senior",
        last_name: "Reviewer",
        full_name: "Senior Reviewer",
        role: "senior_ca",
        permissions: ["prepare_return", "approve_return"],
      }),
    ];
    const contacts = [{
      id: "contact-1",
      client: "client-1",
      client_name: "Acme Client Private Limited",
      workspace: "workspace-1",
      name: "Priya Sharma",
      designation: "Finance Manager",
      mobile_number: "9876543210",
      alternate_mobile_number: "",
      email: "priya.sharma@example.com",
      is_primary: true,
      preferred_contact_mode: "call",
      notes: "",
      is_active: true,
      created_at: "2026-06-05T09:00:00Z",
      updated_at: "2026-06-05T09:00:00Z",
    }];
    let followUps: OperationalFollowUpRecord[] = options?.empty
      ? []
      : [
          createOperationalFollowUp({
            contact: "contact-1",
            contact_name: "Priya Sharma",
            contact_mobile: "9876543210",
            contact_email: "priya.sharma@example.com",
          }) as OperationalFollowUpRecord,
        ];

    await this.page.route(/\/api\/backend\/client-contacts\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(paginated(contacts));
    });

    await this.page.route(/\/api\/backend\/workspace-members\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(paginated(members));
    });

    await this.page.route(/\/api\/backend\/operational-follow-ups\/?(?:\?.*)?$/, async (route) => {
      const request = route.request();
      if (options?.error && request.method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Operational follow-ups unavailable" }),
        });
        return;
      }

      if (request.method() === "GET") {
        const url = new URL(request.url());
        const status = url.searchParams.get("status");
        const pendingWith = url.searchParams.get("pending_with");
        const filtered = followUps.filter((followUp) => {
          if (status && followUp.status !== status) return false;
          if (pendingWith && followUp.pending_with !== pendingWith) return false;
          return true;
        });
        await route.fulfill(paginated(filtered));
        return;
      }

      const payload = request.postDataJSON() as Record<string, string | number | null>;
      const selectedContact = contacts.find((contact) => contact.id === payload.contact);
      const nextFollowUp = createOperationalFollowUp({
        id: `follow-up-${followUps.length + 1}`,
        client: String(payload.client),
        gstin: payload.gstin ? String(payload.gstin) : null,
        compliance_period: payload.compliance_period ? String(payload.compliance_period) : null,
        return_preparation: payload.return_preparation ? String(payload.return_preparation) : null,
        return_filing: payload.return_filing ? String(payload.return_filing) : null,
        follow_up_type: String(payload.follow_up_type ?? "general"),
        reason: String(payload.reason ?? ""),
        pending_with: String(payload.pending_with ?? "customer"),
        status: String(payload.status ?? "open"),
        priority: String(payload.priority ?? "medium"),
        title: String(payload.title ?? ""),
        notes: String(payload.notes ?? ""),
        next_action: String(payload.next_action ?? ""),
        due_at: String(payload.due_at ?? "2026-06-20T11:00:00Z"),
        contact: payload.contact ? String(payload.contact) : null,
        contact_name: selectedContact?.name ?? null,
        contact_mobile: selectedContact?.mobile_number ?? null,
        contact_email: selectedContact?.email ?? null,
        assigned_to: typeof payload.assigned_to === "number" ? payload.assigned_to : null,
        assigned_to_name: typeof payload.assigned_to === "number" && payload.assigned_to === 31 ? "Senior Reviewer" : "Filer User",
        is_overdue: false,
        created_at: "2026-06-07T11:00:00Z",
        updated_at: "2026-06-07T11:00:00Z",
      }) as OperationalFollowUpRecord;
      followUps = [nextFollowUp, ...followUps];
      await route.fulfill(jsonSuccess(nextFollowUp));
    });

    await this.page.route(/\/api\/backend\/operational-follow-ups\/[^/]+\/$/, async (route) => {
      const followUpId = route.request().url().split("/operational-follow-ups/")[1]?.replace(/\/$/, "") ?? "";
      const request = route.request();
      if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as Record<string, string | number | null>;
        const selectedContact = contacts.find((contact) => contact.id === payload.contact);
        followUps = followUps.map((followUp) =>
          followUp.id === followUpId
            ? {
                ...followUp,
                ...payload,
                contact_name: selectedContact ? selectedContact.name : followUp.contact_name,
                contact_mobile: selectedContact ? selectedContact.mobile_number : followUp.contact_mobile,
                contact_email: selectedContact ? selectedContact.email : followUp.contact_email,
                assigned_to_name: typeof payload.assigned_to === "number" && payload.assigned_to === 31 ? "Senior Reviewer" : followUp.assigned_to_name,
                updated_at: "2026-06-07T12:15:00Z",
              } as OperationalFollowUpRecord
            : followUp,
        );
      }
      await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createOperationalFollowUp()));
    });

    await this.page.route(/\/api\/backend\/operational-follow-ups\/[^/]+\/mark-completed\/$/, async (route) => {
      const followUpId = route.request().url().split("/operational-follow-ups/")[1]?.split("/")[0] ?? "";
      const payload = route.request().postDataJSON() as Record<string, string>;
      followUps = followUps.map((followUp) =>
        followUp.id === followUpId
          ? {
              ...followUp,
              status: "completed",
              closed_reason: payload.closed_reason ?? followUp.closed_reason,
              completed_at: "2026-06-07T12:30:00Z",
              updated_at: "2026-06-07T12:30:00Z",
              is_overdue: false,
            } as OperationalFollowUpRecord
          : followUp,
      );
      await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createOperationalFollowUp()));
    });

    await this.page.route(/\/api\/backend\/operational-follow-ups\/[^/]+\/mark-escalated\/$/, async (route) => {
      const followUpId = route.request().url().split("/operational-follow-ups/")[1]?.split("/")[0] ?? "";
      followUps = followUps.map((followUp) =>
        followUp.id === followUpId
          ? {
              ...followUp,
              status: "escalated",
              escalated_at: "2026-06-07T12:20:00Z",
              updated_at: "2026-06-07T12:20:00Z",
            } as OperationalFollowUpRecord
          : followUp,
      );
      await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createOperationalFollowUp()));
    });

    await this.page.route(/\/api\/backend\/operational-follow-ups\/[^/]+\/log-contact\/$/, async (route) => {
      const followUpId = route.request().url().split("/operational-follow-ups/")[1]?.split("/")[0] ?? "";
      followUps = followUps.map((followUp) =>
        followUp.id === followUpId
          ? {
              ...followUp,
              last_contacted_at: "2026-06-07T12:10:00Z",
              updated_at: "2026-06-07T12:10:00Z",
            } as OperationalFollowUpRecord
          : followUp,
      );
      await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createOperationalFollowUp()));
    });
  }

  async mockImportsApis() {
    let batches = [
      createImportBatch(),
      createImportBatch({
        id: "batch-2",
        import_type: "sales",
        file_name: "sales_standard.csv",
        transaction_count: 18,
      }),
    ];

    await this.page.route("**/api/backend/import-templates/**", async (route) => {
      await route.fulfill(paginated([]));
    });

    await this.page.route(/\/api\/backend\/imports\/batches\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill(paginated(batches));
        return;
      }
      const nextBatch = createImportBatch({
        id: `batch-${batches.length + 1}`,
        file_name: "purchase_standard.csv",
      });
      batches = [nextBatch, ...batches];
      await route.fulfill(jsonSuccess(nextBatch));
    });

    await this.page.route(/\/api\/backend\/imports\/batches\/[^/]+\/$/, async (route) => {
      const batchId = route.request().url().split("/imports/batches/")[1]?.replace(/\/$/, "");
      await route.fulfill(jsonSuccess(batches.find((batch) => batch.id === batchId) ?? createImportBatch()));
    });

    await this.page.route("**/api/backend/imports/batches/*/errors/", async (route) => {
      await route.fulfill(paginated([]));
    });
    await this.page.route("**/api/backend/imports/batches/*/correction-policy/", async (route) => {
      await route.fulfill(jsonSuccess({
        lifecycle_state: "processed",
        can_edit_rows: true,
        can_discard_rows: true,
        can_discard_batch: true,
        can_replace_file: true,
        can_reprocess: true,
        has_downstream_dependencies: false,
        requires_reconciliation_rerun: false,
        requires_return_refresh: false,
        is_locked_by_filing: false,
        requires_elevated_role: false,
        warning_message: "",
        next_required_action: "",
        affected_reconciliation_runs: 0,
        affected_return_preparations: 0,
        affected_filings: 0,
        invalidation_reason: "",
      }));
    });
    await this.page.route("**/api/backend/imports/batches/*/impact-summary/", async (route) => {
      await route.fulfill(jsonSuccess({
        summary_title: "No downstream impact",
        summary_message: "This batch is ready for downstream workflow.",
        severity: "success",
        next_required_action: "",
        invalidation_reason: "",
        lifecycle_state: "processed",
        actions: [],
        affected_reconciliation_runs: 0,
        affected_return_preparations: 0,
        affected_filings: 0,
      }));
    });
    await this.page.route("**/api/backend/imports/batches/*/reprocess/", async (route) => {
      await route.fulfill(jsonSuccess(batches[0]));
    });
    await this.page.route("**/api/backend/gst-transactions/**", async (route) => {
      await route.fulfill(paginated([], 42));
    });
  }

  async mockReconciliationApis(options?: { missingData?: boolean; staleRun?: boolean }) {
    let runs = options?.missingData
      ? []
      : [createReconciliationRun(options?.staleRun ? { is_stale: true, invalidation_reason: "source_import_changed" } : {})];

    await this.page.route(/\/api\/backend\/reconciliation\/runs\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill(paginated(runs));
        return;
      }
      const nextRun = createReconciliationRun();
      runs = [nextRun];
      await route.fulfill(jsonSuccess(nextRun));
    });

    await this.page.route(/\/api\/backend\/reconciliation\/runs\/[^/]+\/$/, async (route) => {
      await route.fulfill(jsonSuccess(runs[0] ?? createReconciliationRun()));
    });

    await this.page.route("**/api/backend/reconciliation/runs/*/items/**", async (route) => {
      await route.fulfill(paginated(options?.missingData ? [] : [createReconciliationItem()]));
    });

    await this.page.route("**/api/backend/reconciliation/items/*/corrections/", async (route) => {
      await route.fulfill(paginated([]));
    });

    await this.page.route(/\/api\/backend\/reconciliation\/items\/.+/, async (route) => {
      if (route.request().method() === "PATCH" || route.request().method() === "POST") {
        await route.fulfill(jsonSuccess(createReconciliationItem()));
        return;
      }
      await route.continue();
    });

    await this.page.route("**/api/backend/imports/batches/fetch-gstr2b/", async (route) => {
      await route.fulfill(jsonSuccess(createImportBatch({
        id: "batch-3",
        import_type: "gstr_2b",
        file_name: "gstr_2b_fetched.json",
        source_type: "provider",
      })));
    });

    await this.page.route("**/api/backend/gst-transactions/**", async (route) => {
      const url = new URL(route.request().url());
      const transactionType = url.searchParams.get("transaction_type");
      const count = options?.missingData ? 0 : transactionType === "gstr_2b" ? 18 : 24;
      await route.fulfill(paginated([], count));
    });
  }

  async mockReturnsApis(options?: {
    staleRun?: boolean;
    portalReadiness?: "blocked" | "ready";
    challanValidationFails?: boolean;
  }) {
    let preparedReturns: Array<Record<string, unknown>> = [];
    let portalChallanRequests: PortalChallanRecord[] = options?.portalReadiness === "ready"
      ? [{
          id: "challan-1",
          workspace: "workspace-1",
          client: "client-1",
          gstin: "gstin-1",
          gstin_value: "27ABCDE1234F1Z5",
          compliance_period: "period-1",
          compliance_period_label: "May 2026",
          provider: "whitebooks",
          return_type: "gstr3b",
          status: "submitted",
          cpin: "CPIN0001234567",
          challan_reason: "MONTHLYPAY",
          challan_period: "052026",
          payment_mode: "OTC",
          bank_code: "ICIC",
          sub_payment_mode: "CQ",
          taxpayer_name: "Acme Client Private Limited",
          address: "Mumbai, Maharashtra",
          mobile_number: "9876543210",
          request_payload: { source: "playwright" },
          response_payload: { status: "submitted" },
          total_amount: "81000.00",
          error_message: "",
          created_at: "2026-06-05T12:00:00Z",
          updated_at: "2026-06-05T12:01:00Z",
        } as PortalChallanRecord]
      : [];

    await this.page.route("**/api/backend/returns/readiness/**", async (route) => {
      const prepared = preparedReturns[0] ?? null;
      const readyState = {
        status: options?.staleRun ? "blocked" : "ready",
        can_prepare: !options?.staleRun,
        can_export: true,
        warning_count: 0,
        error_count: options?.staleRun ? 1 : 0,
        issues: options?.staleRun ? [{
          code: "stale_reconciliation",
          severity: "error",
          title: "Reconciliation is stale",
          detail: "Source data changed after the last reconciliation run.",
        }] : [],
        prepared_return: null,
        metrics: {},
      };
      await route.fulfill(jsonSuccess({
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
        gstr1: { return_type: "gstr1", ...readyState },
        gstr3b: {
          return_type: "gstr3b",
          ...readyState,
          prepared_return: prepared ? { id: String(prepared.id), status: "draft", updated_at: String(prepared.updated_at) } : null,
        },
        gstr7: { return_type: "gstr7", ...readyState },
        gstr9: { return_type: "gstr9", ...readyState },
        gstr9c: { return_type: "gstr9c", ...readyState },
        overall_status: options?.staleRun ? "blocked" : "ready",
      }));
    });

    await this.page.route("**/api/backend/returns/prepare/", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, string>;
      const prepared = createPreparedReturn({ return_type: payload.return_type });
      preparedReturns = [prepared];
      await route.fulfill(jsonSuccess(prepared));
    });

    await this.page.route("**/api/backend/returns/portal-filing-readiness/**", async (route) => {
      const portalReadinessMode = options?.portalReadiness ?? "blocked";
      await route.fulfill(jsonSuccess({
        provider: "whitebooks",
        return_type: "gstr3b",
        context: {
          workspace: "workspace-1",
          client: "client-1",
          gstin: "gstin-1",
          gstin_value: "27ABCDE1234F1Z5",
          compliance_period: "period-1",
          period_label: "May 2026",
          whitebooks_ret_period: "052026",
          whitebooks_return_type: "GSTR3B",
        },
        computed_summary: {
          prepared_return_id: preparedReturns[0] ? String(preparedReturns[0].id) : null,
          prepared_return_status: preparedReturns[0] ? "draft" : "not_prepared",
          outward_tax_liability: "153000.00",
          net_tax_payable: "81000.00",
          eligible_itc: "72000.00",
        },
        auth_session: {
          available: portalReadinessMode === "ready",
          session_id: portalReadinessMode === "ready" ? "session-1" : null,
          status: portalReadinessMode === "ready" ? "verified" : "missing",
          freshness_summary: {
            verified_at: portalReadinessMode === "ready" ? "2026-06-05T09:15:00Z" : null,
            expires_at: portalReadinessMode === "ready" ? "2026-06-05T11:15:00Z" : null,
            is_stale: false,
            stale_reason: "",
          },
        },
        portal_sync: {
          can_fetch: portalReadinessMode === "ready",
          enabled: true,
          payment_reads_enabled: portalReadinessMode === "ready",
          blockers: portalReadinessMode === "ready" ? [] : ["Verified portal session is not available for this GSTIN."],
          warnings: portalReadinessMode === "ready" ? ["Portal balances were captured 15 minutes ago."] : [],
          transport_error: "",
        },
        provider_evidence: {
          source: portalReadinessMode === "ready" ? "live_fetch" : "none",
          fetched_at: portalReadinessMode === "ready" ? "2026-06-05T09:30:00Z" : null,
          snapshot_id: portalReadinessMode === "ready" ? "snapshot-portal-1" : null,
          balance_response: portalReadinessMode === "ready" ? { status: "success", balance: "125000.50" } : null,
          taxpayable_response: portalReadinessMode === "ready" ? { netTaxPayable: "81000.00" } : null,
          cash_ledger_summary: portalReadinessMode === "ready"
            ? {
                opening_total: "98000.00",
                closing_total: "125000.50",
                transaction_count: 4,
                from_date: "2026-05-01",
                to_date: "2026-05-31",
                closing_breakdown: { cgst: "32000.25", sgst: "32000.25", igst: "60000.00", cess: "1000.00" },
              }
            : {
                opening_total: "0.00",
                closing_total: "0.00",
                transaction_count: 0,
                from_date: "",
                to_date: "",
                closing_breakdown: { cgst: "0.00", sgst: "0.00", igst: "0.00", cess: "0.00" },
              },
          itc_ledger_summary: portalReadinessMode === "ready"
            ? { opening_total: "68000.00", closing_total: "72000.00", transaction_count: 3, from_date: "2026-05-01", to_date: "2026-05-31" }
            : { opening_total: "0.00", closing_total: "0.00", transaction_count: 0, from_date: "", to_date: "" },
          liability_ledger_summary: portalReadinessMode === "ready"
            ? { opening_total: "141000.00", closing_total: "153000.00", transaction_count: 2, from_date: "2026-05-01", to_date: "2026-05-31" }
            : { opening_total: "0.00", closing_total: "0.00", transaction_count: 0, from_date: "", to_date: "" },
          cash_ledger_response: portalReadinessMode === "ready" ? { cashEntries: [{ date: "2026-05-22", amount: "27000.00" }] } : null,
          itc_ledger_response: portalReadinessMode === "ready" ? { itcEntries: [{ section: "4A", amount: "72000.00" }] } : null,
          liability_ledger_response: portalReadinessMode === "ready" ? { liabilityEntries: [{ section: "3.1(a)", amount: "153000.00" }] } : null,
          challan_history_response: portalReadinessMode === "ready" ? { challans: portalChallanRequests } : null,
          challan_summary_response: portalReadinessMode === "ready" ? { cpin: "CPIN0001234567", total_amount: "81000.00" } : null,
          challan_reference: portalReadinessMode === "ready" ? "CPIN0001234567" : "",
        },
      }));
    });

    await this.page.route("**/api/backend/returns/portal-challan-requests/**", async (route) => {
      await route.fulfill(jsonSuccess(portalChallanRequests));
    });

    await this.page.route("**/api/backend/returns/validate-portal-challan/", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, string>;
      await route.fulfill(jsonSuccess({
        valid: !options?.challanValidationFails,
        error_message: options?.challanValidationFails ? "Portal validation rejected the challan payload." : "",
        provider_response: {
          challan_reason: payload.challan_reason,
          payment_mode: payload.payment_mode,
        },
        computed_total_amount: (
          Number(payload.cgst_tax_amount ?? 0)
          + Number(payload.igst_tax_amount ?? 0)
          + Number(payload.sgst_tax_amount ?? 0)
          + Number(payload.cess_tax_amount ?? 0)
        ).toFixed(2),
      }));
    });

    await this.page.route("**/api/backend/returns/generate-portal-challan/", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, string>;
      const nextChallan = {
        id: `challan-${portalChallanRequests.length + 1}`,
        workspace: "workspace-1",
        client: "client-1",
        gstin: "gstin-1",
        gstin_value: "27ABCDE1234F1Z5",
        compliance_period: "period-1",
        compliance_period_label: "May 2026",
        provider: "whitebooks",
        return_type: "gstr3b",
        status: "created",
        cpin: "CPIN0007654321",
        challan_reason: payload.challan_reason,
        challan_period: "052026",
        payment_mode: payload.payment_mode,
        bank_code: payload.bank_code ?? "",
        sub_payment_mode: payload.sub_payment_mode ?? "",
        taxpayer_name: "Acme Client Private Limited",
        address: payload.address ?? "",
        mobile_number: payload.mobile_number ?? "",
        request_payload: payload,
        response_payload: { created: true, cpin: "CPIN0007654321" },
        total_amount: (
          Number(payload.cgst_tax_amount ?? 0)
          + Number(payload.igst_tax_amount ?? 0)
          + Number(payload.sgst_tax_amount ?? 0)
          + Number(payload.cess_tax_amount ?? 0)
        ).toFixed(2),
        error_message: "",
        created_at: "2026-06-05T12:30:00Z",
        updated_at: "2026-06-05T12:30:00Z",
      } as PortalChallanRecord;
      portalChallanRequests = [nextChallan, ...portalChallanRequests];
      await route.fulfill(jsonSuccess(nextChallan));
    });

    await this.page.route(/\/api\/backend\/returns\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(paginated(preparedReturns));
    });

    await this.page.route(/\/api\/backend\/returns\/return-[^/]*\/$/, async (route) => {
      await route.fulfill(jsonSuccess(preparedReturns[0] ?? createPreparedReturn()));
    });

    await this.page.route("**/api/backend/reconciliation/runs/**", async (route) => {
      await route.fulfill(paginated([
        createReconciliationRun(options?.staleRun ? { is_stale: true, invalidation_reason: "source_import_changed" } : {}),
      ]));
    });

    await this.page.route("**/api/backend/gst-transactions/**", async (route) => {
      const url = new URL(route.request().url());
      const transactionType = url.searchParams.get("transaction_type");
      const count = transactionType === "sales" ? 18 : 24;
      await route.fulfill(paginated([], count));
    });

    await this.page.route("**/api/backend/approvals/**", async (route) => {
      await route.fulfill(paginated([]));
    });

    await this.page.route("**/api/backend/filings/**", async (route) => {
      await route.fulfill(paginated([]));
    });

    await this.page.route("**/api/backend/provider-auth-sessions/**", async (route) => {
      await route.fulfill(paginated([]));
    });
  }

  async mockApprovalsApis() {
    await this.page.route("**/api/backend/approvals/**", async (route) => {
      await route.fulfill(paginated([]));
    });
  }

  async mockApprovalsWorkflowApis() {
    let approvals: ApprovalRequestRecord[] = [createApprovalRequest() as unknown as ApprovalRequestRecord];
    const returns = [
      createPreparedReturn({
        id: "return-1",
        status: "ready_for_review",
        return_type: "gstr3b",
      }),
      createPreparedReturn({
        id: "return-2",
        status: "ready_for_review",
        return_type: "gstr1",
        summary_snapshot: {
          outward_supplies: {
            total_taxable_value: "560000.00",
            total_tax_amount: "100800.00",
          },
          period_exceptions: {
            count: 1,
          },
        },
      }),
    ];

    await this.page.route(/\/api\/backend\/approvals\/?(?:\?.*)?$/, async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill(paginated(approvals));
        return;
      }
      const payload = request.postDataJSON() as Record<string, string | number | null>;
      const nextApproval = createApprovalRequest({
        id: `approval-${approvals.length + 1}`,
        entity_id: String(payload.entity_id),
        entity_type: payload.entity_type as ApprovalRequestRecord["entity_type"],
        comments: String(payload.comments ?? ""),
        requested_to: payload.requested_to,
        requested_to_name: "Owner Accounts",
        status: "pending",
      }) as unknown as ApprovalRequestRecord;
      approvals = [...approvals, nextApproval];
      await route.fulfill(jsonSuccess(nextApproval));
    });

    await this.page.route(/\/api\/backend\/approvals\/[^/]+\/(approve|reject|cancel)\/$/, async (route) => {
      const approvalId = route.request().url().split("/approvals/")[1]?.split("/")[0] ?? "";
      const action = route.request().url().includes("/approve/")
        ? "approved"
        : route.request().url().includes("/reject/")
          ? "rejected"
          : "cancelled";
      const payload = route.request().postDataJSON() as Record<string, string>;
      approvals = approvals.map((approval) =>
        approval.id === approvalId
          ? {
              ...approval,
              status: action,
              resolution_comments: payload.comments ?? "",
              resolved_by: 1,
              resolved_by_name: "Owner Accounts",
              resolved_at: "2026-06-05T12:30:00Z",
            }
          : approval,
      );
      await route.fulfill(jsonSuccess(approvals.find((approval) => approval.id === approvalId) ?? createApprovalRequest()));
    });

    await this.page.route(/\/api\/backend\/returns\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(paginated(returns));
    });

    await this.page.route(/\/api\/backend\/returns\/return-[^/]*\/$/, async (route) => {
      const returnId = route.request().url().split("/returns/")[1]?.replace(/\/$/, "");
      await route.fulfill(jsonSuccess(returns.find((preparedReturn) => preparedReturn.id === returnId) ?? returns[0]));
    });
  }

  async mockOperationsWorkflowApis() {
    let filings: ReturnFilingOperationsRecord[] = [
      createFilingOperation() as unknown as ReturnFilingOperationsRecord,
      createFilingOperation({
        id: "filing-2",
        prepared_return: "return-2",
        return_type: "gstr1",
        status: "submitted",
        support_actions_summary: {
          recommended_action: "resync_status",
          summary_reason: "Provider is processing the filing. Refresh status before further action.",
          actions: [
            { action: "retry", label: "Retry filing", allowed: false, reason: "Retry is blocked while submission is in progress." },
            { action: "resync", label: "Refresh status", allowed: true, reason: "Status refresh is available." },
            { action: "requeue_after_review", label: "Requeue after review", allowed: false, reason: "Requeue is not allowed while provider submission is live." },
          ],
        },
        support_status_summary: {
          filing_status: "submitted",
          provider_stage: "submitted",
          recommended_action: "resync_status",
          summary_reason: "Provider is processing the filing. Refresh status before further action.",
          latest_message: "Awaiting ARN confirmation.",
          has_provider_failure: false,
          intervention_count: 0,
          evidence_flags: {
            save_response: true,
            offset_response: false,
            proceed_response: false,
            file_response: true,
            status_response: true,
            track_response: false,
          },
        },
      }) as unknown as ReturnFilingOperationsRecord,
    ];

    const returns = [
      createPreparedReturn({ id: "return-1", return_type: "gstr3b", status: "approved" }),
      createPreparedReturn({ id: "return-2", return_type: "gstr1", status: "ready_for_review" }),
    ];

    await this.page.route("**/api/backend/filings/operations/**", async (route) => {
      await route.fulfill(paginated(filings));
    });

    await this.page.route(/\/api\/backend\/filings\/[^/]+\/retry\/$/, async (route) => {
      const filingId = route.request().url().split("/filings/")[1]?.split("/")[0] ?? "";
      filings = filings.map((filing) =>
        filing.id === filingId
          ? {
              ...filing,
              status: "submitted",
              support_status_summary: {
                ...filing.support_status_summary,
                filing_status: "submitted",
                recommended_action: "resync_status",
                summary_reason: "Retry submitted. Refresh status for confirmation.",
                latest_message: "Retry requested successfully.",
                intervention_count: Number(filing.support_status_summary.intervention_count ?? 0) + 1,
              },
              support_actions_summary: {
                ...filing.support_actions_summary,
                recommended_action: "resync_status",
              },
            }
          : filing,
      );
      await route.fulfill(jsonSuccess(filings.find((filing) => filing.id === filingId) ?? createFilingOperation()));
    });

    await this.page.route(/\/api\/backend\/filings\/[^/]+\/resync\/$/, async (route) => {
      const filingId = route.request().url().split("/filings/")[1]?.split("/")[0] ?? "";
      filings = filings.map((filing) =>
        filing.id === filingId
          ? {
              ...filing,
              last_status_sync_at: "2026-06-05T12:45:00Z",
              support_status_summary: {
                ...filing.support_status_summary,
                latest_message: "Status refreshed from provider.",
              },
            }
          : filing,
      );
      await route.fulfill(jsonSuccess(filings.find((filing) => filing.id === filingId) ?? createFilingOperation()));
    });

    await this.page.route(/\/api\/backend\/filings\/[^/]+\/requeue-after-review\/$/, async (route) => {
      const filingId = route.request().url().split("/filings/")[1]?.split("/")[0] ?? "";
      filings = filings.map((filing) =>
        filing.id === filingId
          ? {
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
            }
          : filing,
      );
      await route.fulfill(jsonSuccess(filings.find((filing) => filing.id === filingId) ?? createFilingOperation()));
    });

    await this.page.route(/\/api\/backend\/filings\/[^/]+\/escalate-alerts\/$/, async (route) => {
      await route.fulfill(jsonSuccess({ ok: true }));
    });

    await this.page.route(/\/api\/backend\/returns\/return-[^/]*\/$/, async (route) => {
      const returnId = route.request().url().split("/returns/")[1]?.replace(/\/$/, "");
      await route.fulfill(jsonSuccess(returns.find((preparedReturn) => preparedReturn.id === returnId) ?? returns[0]));
    });
  }

  async mockReportsWorkflowApis() {
    let transactions: GSTTransactionRecord[] = [
      createGstTransaction() as unknown as GSTTransactionRecord,
      createGstTransaction({
        id: "txn-2",
        document_number: "PUR-002",
        counterparty_name: "Vendor Two",
        metadata: {
          hsn_code: "8471",
          description: "Printer",
          uqc: "",
          quantity: "",
          supply_category: "taxable",
          ecommerce_gstin: "",
          is_service: false,
          line_items: [
            {
              hsn_code: "8471",
              description: "Printer",
              uqc: "",
              quantity: "",
              is_service: false,
              supply_category: "taxable",
              ecommerce_gstin: "",
              taxable_value: "2000.00",
              cgst_amount: "180.00",
              sgst_amount: "180.00",
              igst_amount: "0.00",
              cess_amount: "0.00",
              total_amount: "2360.00",
            },
          ],
        },
      }) as unknown as GSTTransactionRecord,
    ];
    let snapshots: TransactionReviewSnapshotRecord[] = [];
    let assignments: TransactionRemediationAssignmentRecord[] = [createRemediationAssignment() as unknown as TransactionRemediationAssignmentRecord];
    let followUps: TransactionRemediationFollowUpRecord[] = [createRemediationFollowUp() as unknown as TransactionRemediationFollowUpRecord];

    await this.page.route(/\/api\/backend\/imports\/batches\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(paginated([createImportBatch()]));
    });

    await this.page.route(/\/api\/backend\/gst-transactions\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill(paginated(transactions));
        return;
      }
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
      transactions = transactions.map((transaction) =>
        ids.includes(String(transaction.id))
          ? {
              ...transaction,
              status: String(payload.status ?? transaction.status),
              metadata: {
                ...(transaction.metadata as Record<string, unknown>),
                ...((payload.metadata_updates as Record<string, unknown> | undefined) ?? {}),
              },
            }
          : transaction,
      );
      await route.fulfill(jsonSuccess(transactions.filter((transaction) => ids.includes(String(transaction.id)))));
    });

    await this.page.route(/\/api\/backend\/gst-transactions\/[^/]+\/$/, async (route) => {
      const transactionId = route.request().url().split("/gst-transactions/")[1]?.replace(/\/$/, "") ?? "";
      if (route.request().method() === "PATCH") {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        transactions = transactions.map((transaction) =>
          transaction.id === transactionId
            ? {
                ...transaction,
                counterparty_name: String(payload.counterparty_name ?? transaction.counterparty_name),
                counterparty_gstin: String(payload.counterparty_gstin ?? transaction.counterparty_gstin),
                place_of_supply: String(payload.place_of_supply ?? transaction.place_of_supply),
                document_type: String(payload.document_type ?? transaction.document_type),
                status: String(payload.status ?? transaction.status),
                metadata: {
                  ...(transaction.metadata as Record<string, unknown>),
                  ...((payload.metadata as Record<string, unknown> | undefined) ?? {}),
                },
              }
            : transaction,
        );
      }
      await route.fulfill(jsonSuccess(transactions.find((transaction) => transaction.id === transactionId) ?? createGstTransaction()));
    });

    await this.page.route(/\/api\/backend\/gst-transaction-review-snapshots\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill(paginated(snapshots));
        return;
      }
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const nextSnapshot = createRemediationSnapshot({
        id: `snapshot-${snapshots.length + 1}`,
        name: String(payload.name ?? "Monthly remediation checkpoint"),
        filters: (payload.filters as Record<string, unknown>) ?? {},
        bucket_counts: (payload.bucket_counts as Record<string, number>) ?? {},
      }) as unknown as TransactionReviewSnapshotRecord;
      snapshots = [nextSnapshot];
      await route.fulfill(jsonSuccess(nextSnapshot));
    });

    await this.page.route(/\/api\/backend\/gst-transaction-review-snapshots\/[^/]+\/$/, async (route) => {
      const snapshotId = route.request().url().split("/gst-transaction-review-snapshots/")[1]?.replace(/\/$/, "") ?? "";
      snapshots = snapshots.filter((snapshot) => snapshot.id !== snapshotId);
      await route.fulfill({ status: 204, contentType: "application/json", body: "" });
    });

    await this.page.route(/\/api\/backend\/gst-transaction-remediation-assignments\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill(paginated(assignments));
        return;
      }
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const nextAssignment = createRemediationAssignment({
        id: `assignment-${assignments.length + 1}`,
        title: String(payload.title ?? "Assigned remediation work"),
        bucket_code: String(payload.bucket_code ?? "selected_rows"),
        transaction_ids: (payload.transaction_ids as string[]) ?? [],
        transaction_count: Array.isArray(payload.transaction_ids) ? payload.transaction_ids.length : 0,
        assigned_to: payload.assigned_to ?? null,
        assigned_to_name: payload.assigned_to ? "Filer User" : null,
        status: payload.status ?? "open",
        notes: String(payload.notes ?? ""),
        escalation_notes: String(payload.escalation_notes ?? ""),
      }) as unknown as TransactionRemediationAssignmentRecord;
      assignments = [...assignments, nextAssignment];
      await route.fulfill(jsonSuccess(nextAssignment));
    });

    await this.page.route(/\/api\/backend\/gst-transaction-remediation-assignments\/[^/]+\/$/, async (route) => {
      const assignmentId = route.request().url().split("/gst-transaction-remediation-assignments/")[1]?.replace(/\/$/, "") ?? "";
      if (route.request().method() === "PATCH") {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        assignments = assignments.map((assignment) =>
          assignment.id === assignmentId
            ? {
                ...assignment,
                assigned_to: typeof payload.assigned_to === "number" ? payload.assigned_to : assignment.assigned_to,
                assigned_to_name: payload.assigned_to ? "Filer User" : null,
                status: typeof payload.status === "string"
                  ? payload.status as TransactionRemediationAssignmentRecord["status"]
                  : assignment.status,
                notes: String(payload.notes ?? assignment.notes),
              }
            : assignment,
        );
        await route.fulfill(jsonSuccess(assignments.find((assignment) => assignment.id === assignmentId) ?? createRemediationAssignment()));
        return;
      }
      assignments = assignments.filter((assignment) => assignment.id !== assignmentId);
      await route.fulfill({ status: 204, contentType: "application/json", body: "" });
    });

    await this.page.route(/\/api\/backend\/gst-transaction-remediation-assignments\/[^/]+\/escalate\/$/, async (route) => {
      const assignmentId = route.request().url().split("/gst-transaction-remediation-assignments/")[1]?.split("/")[0] ?? "";
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      assignments = assignments.map((assignment) =>
        assignment.id === assignmentId
          ? {
              ...assignment,
              is_escalated: true,
              escalation_notes: String(payload.escalation_notes ?? assignment.escalation_notes),
            }
          : assignment,
      );
      await route.fulfill(jsonSuccess(assignments.find((assignment) => assignment.id === assignmentId) ?? createRemediationAssignment()));
    });

    await this.page.route(/\/api\/backend\/gst-transaction-remediation-assignments\/[^/]+\/clear-escalation\/$/, async (route) => {
      const assignmentId = route.request().url().split("/gst-transaction-remediation-assignments/")[1]?.split("/")[0] ?? "";
      assignments = assignments.map((assignment) =>
        assignment.id === assignmentId
          ? {
              ...assignment,
              is_escalated: false,
              escalation_notes: "",
            }
          : assignment,
      );
      await route.fulfill(jsonSuccess(assignments.find((assignment) => assignment.id === assignmentId) ?? createRemediationAssignment()));
    });

    await this.page.route(/\/api\/backend\/gst-transaction-remediation-follow-ups\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill(paginated(followUps));
        return;
      }
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const nextFollowUp = createRemediationFollowUp({
        id: `followup-${followUps.length + 1}`,
        assignment: String(payload.assignment),
        assignment_title: assignments.find((assignment) => assignment.id === payload.assignment)?.title ?? "Assigned remediation work",
        title: String(payload.title ?? "Follow-up"),
        notes: String(payload.notes ?? ""),
        status: typeof payload.status === "string" ? payload.status as TransactionRemediationFollowUpRecord["status"] : "open",
        follow_up_type: typeof payload.follow_up_type === "string"
          ? payload.follow_up_type as TransactionRemediationFollowUpRecord["follow_up_type"]
          : "reminder",
        assigned_to: typeof payload.assigned_to === "number" ? payload.assigned_to : null,
        assigned_to_name: payload.assigned_to ? "Filer User" : null,
        remind_at: String(payload.remind_at ?? "2026-06-06T10:00:00Z"),
      }) as unknown as TransactionRemediationFollowUpRecord;
      followUps = [...followUps, nextFollowUp];
      await route.fulfill(jsonSuccess(nextFollowUp));
    });

    await this.page.route(/\/api\/backend\/gst-transaction-remediation-follow-ups\/[^/]+\/$/, async (route) => {
      const followUpId = route.request().url().split("/gst-transaction-remediation-follow-ups/")[1]?.replace(/\/$/, "") ?? "";
      if (route.request().method() === "PATCH") {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        followUps = followUps.map((followUp) =>
          followUp.id === followUpId
            ? {
                ...followUp,
                title: String(payload.title ?? followUp.title),
                notes: String(payload.notes ?? followUp.notes),
                status: typeof payload.status === "string"
                  ? payload.status as TransactionRemediationFollowUpRecord["status"]
                  : followUp.status,
              }
            : followUp,
        );
        await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createRemediationFollowUp()));
        return;
      }
      followUps = followUps.filter((followUp) => followUp.id !== followUpId);
      await route.fulfill({ status: 204, contentType: "application/json", body: "" });
    });

    await this.page.route(/\/api\/backend\/gst-transaction-remediation-follow-ups\/[^/]+\/mark-completed\/$/, async (route) => {
      const followUpId = route.request().url().split("/gst-transaction-remediation-follow-ups/")[1]?.split("/")[0] ?? "";
      followUps = followUps.map((followUp) =>
        followUp.id === followUpId
          ? { ...followUp, status: "completed", completed_at: "2026-06-05T15:00:00Z" }
          : followUp,
      );
      await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createRemediationFollowUp()));
    });

    await this.page.route(/\/api\/backend\/gst-transaction-remediation-follow-ups\/[^/]+\/dismiss\/$/, async (route) => {
      const followUpId = route.request().url().split("/gst-transaction-remediation-follow-ups/")[1]?.split("/")[0] ?? "";
      followUps = followUps.map((followUp) =>
        followUp.id === followUpId
          ? { ...followUp, status: "dismissed" }
          : followUp,
      );
      await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createRemediationFollowUp()));
    });

    await this.page.route(/\/api\/backend\/gst-transaction-remediation-follow-ups\/[^/]+\/send-now\/$/, async (route) => {
      const followUpId = route.request().url().split("/gst-transaction-remediation-follow-ups/")[1]?.split("/")[0] ?? "";
      followUps = followUps.map((followUp) =>
        followUp.id === followUpId
          ? { ...followUp, status: "sent", reminder_count: Number(followUp.reminder_count ?? 0) + 1, last_notified_at: "2026-06-05T15:05:00Z" }
          : followUp,
      );
      await route.fulfill(jsonSuccess(followUps.find((followUp) => followUp.id === followUpId) ?? createRemediationFollowUp()));
    });
  }

  async mockReturnReviewApis(options?: { missingDrafts?: Array<ReturnPreparationRecord["return_type"]>; error?: boolean }) {
    const missingDrafts = new Set(options?.missingDrafts ?? []);

    const reviewReturns: ReturnPreparationRecord[] = [
      createPreparedReturn({
        id: "return-gstr1",
        return_type: "gstr1",
        status: "ready_for_review",
        summary_snapshot: {
          outward_supplies: {
            total_taxable_value: "1560000.00",
            total_tax_amount: "280800.00",
          },
          period_exceptions: { count: 1 },
          export_rows: [{ special_supply_type: "export", rate: "18", document_count: 1, taxable_value: "250000.00", tax_amount: "45000.00" }],
          advance_received_rows: [{ place_of_supply: "27", supply_type: "taxable", rate: "18", document_count: 1, taxable_value: "50000.00", tax_amount: "9000.00" }],
          advance_adjusted_rows: [{ place_of_supply: "27", supply_type: "taxable", rate: "18", document_count: 1, taxable_value: "50000.00", tax_amount: "9000.00" }],
          ecommerce_rows: [{ ecommerce_gstin: "29ECOMM1234F1Z5", section_code: "table_14", place_of_supply: "29", rate: "18", document_count: 1, taxable_value: "125000.00", tax_amount: "22500.00" }],
          hsn_rows: [{ hsn_code: "8471", description: "Laptop", uqc: "NOS", quantity: "2", taxable_value: "250000.00", tax_amount: "45000.00" }],
          document_rows: [{ document_type: "invoice", from_number: "INV-001", to_number: "INV-009", count: 9 }],
          nil_rows: [{ supply_category: "exempt", document_count: 1, taxable_value: "15000.00" }],
        },
      }) as ReturnPreparationRecord,
      createPreparedReturn({
        id: "return-gstr3b",
        return_type: "gstr3b",
        status: "ready_for_review",
        summary_snapshot: {
          outward_supplies: {
            outward_taxable_value: "850000.00",
            outward_tax_liability: "153000.00",
          },
          itc_summary: {
            books_itc: "78000.00",
            reflected_itc: "76000.00",
            claim_ready_itc: "72000.00",
            itc_at_risk: "6000.00",
            pending_2b_itc: "1500.00",
            pending_review_itc: "1200.00",
            blocked_itc: "1800.00",
            timing_difference_itc: "900.00",
            vendor_followup_required_itc: "600.00",
            net_tax_payable: "81000.00",
            unresolved_mismatch_count: 2,
          },
          reconciliation: {
            matched_count: 24,
            partial_match_count: 1,
            missing_in_books_count: 1,
            missing_in_portal_count: 0,
            duplicate_count: 0,
            manual_review_decision_count: 1,
            manual_claim_now_count: 1,
            manual_defer_count: 0,
            manual_blocked_count: 0,
            manual_vendor_followup_count: 0,
            prior_period_deferred_count: 1,
            prior_period_deferred_period: "2026-04",
            prior_period_deferred_itc: "2500.00",
          },
          period_exceptions: { count: 1 },
        },
      }) as ReturnPreparationRecord,
      createPreparedReturn({
        id: "return-gstr7",
        return_type: "gstr7",
        status: "ready_for_review",
        summary_snapshot: {
          tds_summary: {
            deductee_count: 2,
            document_count: 3,
            payment_amount: "450000.00",
            tds_amount: "9000.00",
            taxable_value: "450000.00",
          },
          deductees: {
            rows: [
              { deductee_gstin: "27AAACV1234F1Z5", deductee_name: "Vendor One", document_count: 2, payment_amount: "300000.00", taxable_value: "300000.00", tds_amount: "6000.00" },
              { deductee_gstin: "27AAACV5678F1Z5", deductee_name: "Vendor Two", document_count: 1, payment_amount: "150000.00", taxable_value: "150000.00", tds_amount: "3000.00" },
            ],
          },
        },
      }) as ReturnPreparationRecord,
      createPreparedReturn({
        id: "return-gstr9",
        return_type: "gstr9",
        status: "ready_for_review",
        summary_snapshot: {
          financial_year: "2025-26",
          anchor_period: "2026-03",
          outward_summary: {
            annual_taxable_value: "9200000.00",
            annual_tax_liability: "1656000.00",
            gstr1_taxable_value: "9300000.00",
            gstr1_tax_amount: "1674000.00",
            gstr3b_outward_taxable_value: "9200000.00",
            gstr3b_outward_tax_liability: "1656000.00",
          },
          itc_summary: {
            books_itc: "960000.00",
            reflected_itc: "945000.00",
            claim_ready_itc: "930000.00",
            pending_2b_itc: "8000.00",
            pending_review_itc: "6000.00",
            blocked_itc: "9000.00",
            itc_at_risk: "15000.00",
          },
          liability_summary: {
            annual_claim_ready_itc: "930000.00",
            net_tax_payable: "726000.00",
          },
          annual_sections: {
            notes_and_amendments: { amendment_document_count: 4 },
            source_exceptions: {
              period_exception_count: 1,
              unresolved_mismatch_count: 3,
              manual_review_decision_count: 2,
            },
          },
          source_months: {
            expected_periods: ["2025-04", "2025-05", "2025-06", "2026-03"],
            available_periods: ["2025-04", "2025-05", "2026-03"],
            missing_periods: ["2025-06"],
            blocked_source_periods: ["2025-07"],
            failed_source_periods: ["2025-08"],
            filed_source_periods: ["2025-04", "2025-05"],
          },
          warnings_summary: { warning_count: 2 },
          source_trace: {
            gstr1_return_ids: ["return-gstr1-source-apr", "return-gstr1-source-may"],
            gstr3b_return_ids: ["return-gstr3b-source-apr"],
          },
        },
      }) as ReturnPreparationRecord,
      createPreparedReturn({
        id: "return-gstr9c",
        return_type: "gstr9c",
        status: "ready_for_review",
        summary_snapshot: {
          financial_year: "2025-26",
          books_summary: {
            outward_taxable_value: "9350000.00",
            outward_tax_amount: "1683000.00",
            books_itc: "955000.00",
          },
          gstr9_summary: {
            annual_taxable_value: "9200000.00",
            annual_tax_liability: "1656000.00",
            books_itc: "945000.00",
            claim_ready_itc: "930000.00",
          },
          comparison_summary: {
            outward_taxable_variance: "150000.00",
            outward_tax_variance: "27000.00",
            books_itc_variance: "10000.00",
            claim_ready_itc_variance: "25000.00",
          },
          source_trace: {
            gstr9_return_id: "return-gstr9",
            gstr1_return_ids: ["return-gstr1-source-apr", "return-gstr1-source-may"],
            gstr3b_return_ids: ["return-gstr3b-source-apr"],
          },
          warnings_summary: { warning_count: 2 },
          source_months: {
            annual_month_count: 11,
            missing_periods: ["2025-06"],
            blocked_source_periods: ["2025-07"],
          },
        },
      }) as ReturnPreparationRecord,
      createPreparedReturn({ id: "return-gstr1-source-apr", return_type: "gstr1", compliance_period: "period-apr", compliance_period_label: "2025-04", status: "approved" }) as ReturnPreparationRecord,
      createPreparedReturn({ id: "return-gstr1-source-may", return_type: "gstr1", compliance_period: "period-may", compliance_period_label: "2025-05", status: "approved" }) as ReturnPreparationRecord,
      createPreparedReturn({ id: "return-gstr3b-source-apr", return_type: "gstr3b", compliance_period: "period-apr", compliance_period_label: "2025-04", status: "approved" }) as ReturnPreparationRecord,
    ].filter((preparedReturn) => !missingDrafts.has(preparedReturn.return_type));

    const readinessIssues = {
      gstr1: [{
        code: "export_shipping_missing",
        severity: "warning",
        title: "Export evidence still needs review",
        detail: "One export row is missing a shipping-bill reference in the current source payload.",
      }],
      gstr3b: [{
        code: "manual_itc_review",
        severity: "warning",
        title: "Manual ITC decision remains in scope",
        detail: "One reconciliation row still depends on an explicit reviewer claim decision.",
      }],
      gstr7: [{
        code: "deductee_validation",
        severity: "warning",
        title: "Deductee completeness should be rechecked",
        detail: "One deductee row still needs operator confirmation before filing confidence is high.",
      }],
      gstr9: [{
        code: "annual_source_month_missing",
        severity: "warning",
        title: "One monthly source period is missing",
        detail: "Annual review is missing at least one expected monthly source return.",
      }],
      gstr9c: [{
        code: "books_variance_review",
        severity: "warning",
        title: "Books and GSTR-9 still show a variance",
        detail: "Annual books totals and the current GSTR-9 anchor do not fully align yet.",
      }],
    } as const;

    const salesTransactions: GSTTransactionRecord[] = [
      createGstTransaction({
        id: "sale-b2b-1",
        transaction_type: "sales",
        document_number: "INV-101",
        counterparty_gstin: "27AAACV1234F1Z5",
        counterparty_name: "Retail Buyer One",
        taxable_value: "100000.00",
        tax_amount: "18000.00",
        total_amount: "118000.00",
        metadata: { hsn_code: "8471", description: "Laptop", uqc: "NOS", quantity: "2", supply_category: "taxable", ecommerce_gstin: "", is_service: false, line_items: [{ hsn_code: "8471", description: "Laptop", uqc: "NOS", quantity: "2", taxable_value: "100000.00", cgst_amount: "9000.00", sgst_amount: "9000.00", igst_amount: "0.00", cess_amount: "0.00", total_amount: "118000.00", is_service: false, supply_category: "taxable", ecommerce_gstin: "", rate: "18" }] },
      }) as GSTTransactionRecord,
      createGstTransaction({
        id: "sale-export-1",
        transaction_type: "sales",
        document_number: "EXP-201",
        place_of_supply: "29",
        counterparty_gstin: "",
        counterparty_name: "Export Buyer",
        taxable_value: "250000.00",
        igst_amount: "45000.00",
        cgst_amount: "0.00",
        sgst_amount: "0.00",
        tax_amount: "45000.00",
        total_amount: "295000.00",
        metadata: { special_supply_type: "export", hsn_code: "8471", description: "Hardware", uqc: "NOS", quantity: "4", ecommerce_gstin: "", is_service: false, line_items: [{ hsn_code: "8471", description: "Hardware", uqc: "NOS", quantity: "4", taxable_value: "250000.00", cgst_amount: "0.00", sgst_amount: "0.00", igst_amount: "45000.00", cess_amount: "0.00", total_amount: "295000.00", is_service: false, supply_category: "taxable", ecommerce_gstin: "", rate: "18" }] },
      }) as GSTTransactionRecord,
      createGstTransaction({
        id: "sale-ecom-1",
        transaction_type: "sales",
        document_number: "ECO-301",
        counterparty_gstin: "",
        counterparty_name: "Marketplace Buyer",
        place_of_supply: "29",
        taxable_value: "125000.00",
        igst_amount: "22500.00",
        cgst_amount: "0.00",
        sgst_amount: "0.00",
        tax_amount: "22500.00",
        total_amount: "147500.00",
        metadata: { ecommerce_gstin: "29ECOMM1234F1Z5", special_supply_type: "", line_items: [{ hsn_code: "8517", description: "Accessories", uqc: "NOS", quantity: "10", taxable_value: "125000.00", cgst_amount: "0.00", sgst_amount: "0.00", igst_amount: "22500.00", cess_amount: "0.00", total_amount: "147500.00", is_service: false, supply_category: "taxable", ecommerce_gstin: "29ECOMM1234F1Z5", rate: "18" }] },
      }) as GSTTransactionRecord,
      createGstTransaction({
        id: "sale-amend-1",
        transaction_type: "sales",
        document_type: "credit_note",
        document_number: "CRN-401",
        counterparty_gstin: "27AAACV1234F1Z5",
        counterparty_name: "Retail Buyer One",
        taxable_value: "10000.00",
        tax_amount: "1800.00",
        total_amount: "11800.00",
        metadata: { original_document_number: "INV-090", original_period: "2025-04", hsn_code: "8471", description: "Price correction", uqc: "NOS", quantity: "1", ecommerce_gstin: "", is_service: false, line_items: [{ hsn_code: "8471", description: "Price correction", uqc: "NOS", quantity: "1", taxable_value: "10000.00", cgst_amount: "900.00", sgst_amount: "900.00", igst_amount: "0.00", cess_amount: "0.00", total_amount: "11800.00", is_service: false, supply_category: "taxable", ecommerce_gstin: "", rate: "18" }] },
      }) as GSTTransactionRecord,
    ];

    const purchaseTransactions: GSTTransactionRecord[] = [
      createGstTransaction({ id: "purchase-1", transaction_type: "purchase", document_number: "PUR-101", counterparty_name: "Vendor One", taxable_value: "400000.00", tax_amount: "72000.00", total_amount: "472000.00" }) as GSTTransactionRecord,
    ];
    const gstr2bTransactions: GSTTransactionRecord[] = [
      createGstTransaction({ id: "gstr2b-1", transaction_type: "gstr_2b", document_number: "2B-101", counterparty_name: "Vendor One", taxable_value: "390000.00", tax_amount: "70200.00", total_amount: "460200.00" }) as GSTTransactionRecord,
    ];
    const tdsTransactions: GSTTransactionRecord[] = [
      createGstTransaction({ id: "tds-1", transaction_type: "tds_deducted", document_number: "TDS-101", counterparty_gstin: "27AAACV1234F1Z5", counterparty_name: "Vendor One", taxable_value: "300000.00", tax_amount: "6000.00", total_amount: "306000.00" }) as GSTTransactionRecord,
    ];

    const reconciliationRuns: ReconciliationRunRecord[] = [
      createReconciliationRun({
        matched_count: 24,
        partial_match_count: 1,
        missing_in_books_count: 1,
        total_itc_at_risk: "6000.00",
        itc_ready_count: 24,
        itc_pending_2b_count: 1,
        itc_pending_review_count: 1,
        itc_blocked_count: 0,
        itc_timing_difference_count: 0,
        itc_vendor_followup_required_count: 0,
      }) as ReconciliationRunRecord,
    ];
    const reconciliationItems: ReconciliationItemRecord[] = [
      createReconciliationItem({
        id: "recon-item-1",
        reconciliation_run: "run-1",
        match_status: "partial_match",
        issue_bucket: "value_review",
        itc_status: "itc_pending_review",
        review_decision: "claim_now",
        action_status: "open",
        recommended_next_action: "Review variance",
        period_relationship: "same_period",
        remarks: "Claim after reviewer check.",
        corrections_count: 0,
        metadata: {},
        created_at: "2026-06-05T11:00:00Z",
        updated_at: "2026-06-05T11:00:00Z",
      }) as ReconciliationItemRecord,
    ];

    const importBatches: ImportBatchRecord[] = [
      createImportBatch({ id: "batch-tds-1", import_type: "tds_deducted", file_name: "tds_deducted_may.csv", transaction_count: 3 }) as ImportBatchRecord,
    ];

    await this.page.route(/\/api\/backend\/returns\/readiness\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(jsonSuccess({
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
        gstr1: { return_type: "gstr1", status: "ready", can_prepare: true, can_export: true, warning_count: readinessIssues.gstr1.length, error_count: 0, issues: readinessIssues.gstr1, prepared_return: { id: "return-gstr1", status: "ready_for_review", updated_at: "2026-06-05T11:15:00Z" }, metrics: {} },
        gstr3b: { return_type: "gstr3b", status: "ready", can_prepare: true, can_export: true, warning_count: readinessIssues.gstr3b.length, error_count: 0, issues: readinessIssues.gstr3b, prepared_return: { id: "return-gstr3b", status: "ready_for_review", updated_at: "2026-06-05T11:15:00Z" }, metrics: {} },
        gstr7: { return_type: "gstr7", status: "ready", can_prepare: true, can_export: true, warning_count: readinessIssues.gstr7.length, error_count: 0, issues: readinessIssues.gstr7, prepared_return: { id: "return-gstr7", status: "ready_for_review", updated_at: "2026-06-05T11:15:00Z" }, metrics: {} },
        gstr9: { return_type: "gstr9", status: "ready", can_prepare: true, can_export: true, warning_count: readinessIssues.gstr9.length, error_count: 0, issues: readinessIssues.gstr9, prepared_return: { id: "return-gstr9", status: "ready_for_review", updated_at: "2026-06-05T11:15:00Z" }, metrics: {} },
        gstr9c: { return_type: "gstr9c", status: "ready", can_prepare: true, can_export: true, warning_count: readinessIssues.gstr9c.length, error_count: 0, issues: readinessIssues.gstr9c, prepared_return: { id: "return-gstr9c", status: "ready_for_review", updated_at: "2026-06-05T11:15:00Z" }, metrics: {} },
        overall_status: "ready",
      }));
    });

    await this.page.route(/\/api\/backend\/returns\/?(?:\?.*)?$/, async (route) => {
      if (options?.error) {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Review returns unavailable" }) });
        return;
      }
      const url = new URL(route.request().url());
      const returnType = url.searchParams.get("return_type");
      const period = url.searchParams.get("period");
      const filtered = reviewReturns.filter((preparedReturn) => {
        if (returnType && preparedReturn.return_type !== returnType) return false;
        if (period && preparedReturn.compliance_period !== period) return false;
        return true;
      });
      await route.fulfill(paginated(filtered));
    });

    await this.page.route(/\/api\/backend\/returns\/return-[^/]*\/$/, async (route) => {
      const returnId = route.request().url().split("/returns/")[1]?.replace(/\/$/, "") ?? "";
      await route.fulfill(jsonSuccess(reviewReturns.find((preparedReturn) => preparedReturn.id === returnId) ?? createPreparedReturn()));
    });

    await this.page.route(/\/api\/backend\/gst-transactions\/?(?:\?.*)?$/, async (route) => {
      const transactionType = new URL(route.request().url()).searchParams.get("transaction_type");
      const transactions =
        transactionType === "sales" ? salesTransactions
        : transactionType === "purchase" ? purchaseTransactions
        : transactionType === "gstr_2b" ? gstr2bTransactions
        : transactionType === "tds_deducted" ? tdsTransactions
        : [];
      await route.fulfill(paginated(transactions));
    });

    await this.page.route(/\/api\/backend\/imports\/batches\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(paginated(importBatches));
    });

    await this.page.route(/\/api\/backend\/reconciliation\/runs\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(paginated(reconciliationRuns));
    });

    await this.page.route(/\/api\/backend\/reconciliation\/runs\/[^/]+\/items\/?(?:\?.*)?$/, async (route) => {
      await route.fulfill(paginated(reconciliationItems));
    });
  }
}

export const test = base.extend<{
  app: QaAppMock;
}>({
  app: async ({ page }, attachApp) => {
    await attachApp(new QaAppMock(page));
  },
});

export { expect };
