import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { AuditLogRecord } from "@/types/api";

type AuditFilters = {
  workspace_id_ref?: string;
  client_id_ref?: string;
  gstin?: string;
  period?: string;
  action?: string;
  entity_type?: string;
  actor?: string;
  date_from?: string;
  date_to?: string;
};

export function useAuditLogsQuery(filters: AuditFilters) {
  return useQuery({
    queryKey: queryKeys.auditLogs.list(filters),
    enabled: Boolean(filters.workspace_id_ref),
    queryFn: async () => {
      const response = await apiClient.get("/audit-logs/", { params: filters });
      return unwrapPaginatedData<AuditLogRecord>(response);
    },
  });
}

export function useAuditLogQuery(auditId?: string) {
  return useQuery({
    queryKey: auditId ? queryKeys.auditLogs.detail(auditId) : ["audit-logs", "detail", "missing"],
    enabled: Boolean(auditId),
    queryFn: async () => {
      const response = await apiClient.get(`/audit-logs/${auditId}/`);
      return unwrapApiData<AuditLogRecord>(response);
    },
  });
}
