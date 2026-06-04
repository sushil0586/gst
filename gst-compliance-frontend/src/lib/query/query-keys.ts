export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  organizations: {
    all: ["organizations"] as const,
  },
  workspace: {
    all: ["workspace"] as const,
    current: (workspaceId: string) => ["workspace", workspaceId] as const,
    context: (workspaceId?: string) => ["workspace", "context", workspaceId ?? "default"] as const,
  },
  dashboard: {
    summary: (filters?: Record<string, string | undefined>) => ["dashboard", "summary", filters ?? {}] as const,
    closeManager: (filters?: Record<string, string | undefined>) => ["dashboard", "close-manager", filters ?? {}] as const,
    closeManagerReport: (filters?: Record<string, string | undefined>) => ["dashboard", "close-manager-report", filters ?? {}] as const,
  },
  clients: {
    all: ["clients"] as const,
    list: (workspaceId?: string) => ["clients", "list", workspaceId ?? "all"] as const,
    detail: (clientId: string) => ["clients", clientId] as const,
  },
  gstins: {
    all: ["gstins"] as const,
    list: (clientId?: string) => ["gstins", "list", clientId ?? "all"] as const,
    detail: (gstinId: string) => ["gstins", gstinId] as const,
    taxpayerSearch: (workspaceId?: string, gstin?: string) =>
      ["gstins", "taxpayer-search", workspaceId ?? "none", gstin ?? "none"] as const,
  },
  compliancePeriods: {
    all: ["compliance-periods"] as const,
    list: (gstinId?: string) => ["compliance-periods", "list", gstinId ?? "all"] as const,
    detail: (periodId: string) => ["compliance-periods", periodId] as const,
    workspaceSummary: (periodId: string) => ["compliance-periods", periodId, "workspace-summary"] as const,
  },
  approvals: {
    list: (filters?: Record<string, string | undefined>) => ["approvals", "list", filters ?? {}] as const,
    detail: (approvalId: string) => ["approvals", approvalId] as const,
  },
  auditLogs: {
    list: (filters?: Record<string, string | undefined>) => ["audit-logs", "list", filters ?? {}] as const,
    detail: (auditId: string) => ["audit-logs", auditId] as const,
  },
  imports: {
    all: ["imports"] as const,
    list: (filters?: Record<string, string | undefined>) => ["imports", "list", filters ?? {}] as const,
    detail: (batchId: string) => ["imports", batchId] as const,
    errors: (batchId: string) => ["imports", batchId, "errors"] as const,
    correctionPolicy: (batchId: string) => ["imports", batchId, "correction-policy"] as const,
    impactSummary: (batchId: string) => ["imports", batchId, "impact-summary"] as const,
  },
  importTemplates: {
    all: ["import-templates"] as const,
    list: (filters?: Record<string, string | undefined>) => ["import-templates", "list", filters ?? {}] as const,
    detail: (templateId: string) => ["import-templates", templateId] as const,
  },
  transactions: {
    list: (filters?: Record<string, string | undefined>) => ["gst-transactions", "list", filters ?? {}] as const,
    detail: (transactionId: string) => ["gst-transactions", transactionId] as const,
    remediationSnapshots: (filters?: Record<string, string | undefined>) =>
      ["gst-transactions", "remediation-snapshots", filters ?? {}] as const,
    remediationAssignments: (filters?: Record<string, string | undefined>) =>
      ["gst-transactions", "remediation-assignments", filters ?? {}] as const,
    remediationDigests: (filters?: Record<string, string | undefined>) =>
      ["gst-transactions", "remediation-digests", filters ?? {}] as const,
    remediationFollowUps: (filters?: Record<string, string | undefined>) =>
      ["gst-transactions", "remediation-follow-ups", filters ?? {}] as const,
  },
  workspaceMembers: {
    list: (workspaceId?: string) => ["workspace-members", "list", workspaceId ?? "all"] as const,
  },
  reconciliation: {
    runs: (filters?: Record<string, string | undefined>) => ["reconciliation", "runs", filters ?? {}] as const,
    run: (runId: string) => ["reconciliation", "run", runId] as const,
    items: (runId?: string, filters?: Record<string, string | undefined>) =>
      ["reconciliation", "items", runId ?? "all", filters ?? {}] as const,
    item: (itemId: string) => ["reconciliation", "item", itemId] as const,
  },
  returns: {
    list: (filters?: Record<string, string | undefined>) => ["returns", "list", filters ?? {}] as const,
    detail: (returnId: string) => ["returns", returnId] as const,
    readiness: (filters?: Record<string, string | undefined>) => ["returns", "readiness", filters ?? {}] as const,
  },
  filings: {
    list: (filters?: Record<string, string | undefined>) => ["filings", "list", filters ?? {}] as const,
    operations: (filters?: Record<string, string | undefined>) => ["filings", "operations", filters ?? {}] as const,
    detail: (filingId: string) => ["filings", filingId] as const,
    attempts: (filingId: string) => ["filings", filingId, "attempts"] as const,
    events: (filingId: string) => ["filings", filingId, "events"] as const,
  },
  providerAuthSessions: {
    list: (filters?: Record<string, string | undefined>) => ["provider-auth-sessions", "list", filters ?? {}] as const,
    detail: (sessionId: string) => ["provider-auth-sessions", sessionId] as const,
  },
  whitebooksAuthSessions: {
    list: (filters?: Record<string, string | undefined>) => queryKeys.providerAuthSessions.list(filters),
    detail: (sessionId: string) => queryKeys.providerAuthSessions.detail(sessionId),
  },
};
