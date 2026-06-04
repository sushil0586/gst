import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { CloseManagerReportRecord, DashboardSummaryRecord } from "@/types/api";

type DashboardSummaryFilters = {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
};

export function useDashboardSummaryQuery(filters: DashboardSummaryFilters) {
  return useQuery({
    queryKey: queryKeys.dashboard.summary(filters),
    enabled: Boolean(filters.workspace),
    queryFn: async () => {
      const response = await apiClient.get("/dashboard/summary/", { params: filters });
      return unwrapApiData<DashboardSummaryRecord>(response);
    },
  });
}

export function useCloseManagerReportQuery(filters: { workspace?: string; days?: string }) {
  return useQuery({
    queryKey: queryKeys.dashboard.closeManagerReport(filters),
    enabled: Boolean(filters.workspace),
    queryFn: async () => {
      const response = await apiClient.get("/dashboard/close-manager/report/", { params: filters });
      return unwrapApiData<CloseManagerReportRecord>(response);
    },
  });
}
