import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { CompliancePeriodRecord, WorkspaceSummaryRecord } from "@/types/api";

type CompliancePeriodWritePayload = {
  gstin: string;
  period: string;
  return_type: string;
  status: string;
  due_date?: string | null;
};

export function useCompliancePeriodsQuery(gstinId?: string) {
  return useQuery({
    queryKey: queryKeys.compliancePeriods.list(gstinId),
    enabled: Boolean(gstinId),
    queryFn: async () => {
      const response = await apiClient.get("/compliance-periods/", {
        params: { gstin: gstinId },
      });
      return unwrapPaginatedData<CompliancePeriodRecord>(response);
    },
  });
}

export function useCompliancePeriodQuery(periodId?: string) {
  return useQuery({
    queryKey: periodId ? queryKeys.compliancePeriods.detail(periodId) : ["compliance-periods", "detail", "missing"],
    enabled: Boolean(periodId),
    queryFn: async () => {
      const response = await apiClient.get(`/compliance-periods/${periodId}/`);
      return unwrapApiData<CompliancePeriodRecord>(response);
    },
  });
}

export function useCompliancePeriodWorkspaceSummaryQuery(periodId?: string) {
  return useQuery({
    queryKey: periodId ? queryKeys.compliancePeriods.workspaceSummary(periodId) : ["compliance-periods", "workspace-summary", "missing"],
    enabled: Boolean(periodId),
    queryFn: async () => {
      const response = await apiClient.get(`/compliance-periods/${periodId}/workspace-summary/`);
      return unwrapApiData<WorkspaceSummaryRecord>(response);
    },
  });
}

export function useCreateCompliancePeriodMutation(gstinId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CompliancePeriodWritePayload) => {
      const response = await apiClient.post("/compliance-periods/", payload);
      return unwrapApiData<CompliancePeriodRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.compliancePeriods.list(gstinId) });
      queryClient.invalidateQueries({ queryKey: ["workspace", "context"] });
    },
  });
}

export function useUpdateCompliancePeriodMutation(gstinId?: string, periodId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<CompliancePeriodWritePayload>) => {
      const response = await apiClient.patch(`/compliance-periods/${periodId}/`, payload);
      return unwrapApiData<CompliancePeriodRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.compliancePeriods.list(gstinId) });
      if (periodId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.compliancePeriods.detail(periodId) });
      }
      queryClient.invalidateQueries({ queryKey: ["workspace", "context"] });
    },
  });
}

export function useLockCompliancePeriodMutation(gstinId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (periodId: string) => {
      const response = await apiClient.post(`/compliance-periods/${periodId}/lock/`, {});
      return unwrapApiData<CompliancePeriodRecord>(response);
    },
    onSuccess: (period) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.compliancePeriods.list(gstinId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.compliancePeriods.detail(period.id) });
      queryClient.invalidateQueries({ queryKey: ["workspace", "context"] });
    },
  });
}

export function useUnlockCompliancePeriodMutation(gstinId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (periodId: string) => {
      const response = await apiClient.post(`/compliance-periods/${periodId}/unlock/`, {});
      return unwrapApiData<CompliancePeriodRecord>(response);
    },
    onSuccess: (period) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.compliancePeriods.list(gstinId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.compliancePeriods.detail(period.id) });
      queryClient.invalidateQueries({ queryKey: ["workspace", "context"] });
    },
  });
}
