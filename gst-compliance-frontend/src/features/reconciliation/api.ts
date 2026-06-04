import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { ReconciliationItemRecord, ReconciliationRunRecord } from "@/types/api";

type RunFilters = {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
};

type RunItemFilters = {
  run?: string;
  match_status?: string;
  action_status?: string;
  mismatch_reason?: string;
  counterparty_gstin?: string;
  document_number?: string;
  assigned_to?: string;
  search?: string;
};

export function useReconciliationRunsQuery(filters: RunFilters) {
  return useQuery({
    queryKey: queryKeys.reconciliation.runs(filters),
    enabled: Boolean(filters.client || filters.compliance_period),
    queryFn: async () => {
      const response = await apiClient.get("/reconciliation/runs/", { params: filters });
      return unwrapPaginatedData<ReconciliationRunRecord>(response);
    },
  });
}

export function useReconciliationRunQuery(runId?: string) {
  return useQuery({
    queryKey: runId ? queryKeys.reconciliation.run(runId) : ["reconciliation", "run", "missing"],
    enabled: Boolean(runId),
    queryFn: async () => {
      const response = await apiClient.get(`/reconciliation/runs/${runId}/`);
      return unwrapApiData<ReconciliationRunRecord>(response);
    },
  });
}

export function useReconciliationRunItemsQuery(runId?: string, filters?: RunItemFilters) {
  return useQuery({
    queryKey: queryKeys.reconciliation.items(runId, filters),
    enabled: Boolean(runId),
    queryFn: async () => {
      const response = await apiClient.get(`/reconciliation/runs/${runId}/items/`, { params: filters });
      return unwrapPaginatedData<ReconciliationItemRecord>(response);
    },
  });
}

export function useCreateReconciliationRunMutation(filtersToInvalidate?: RunFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      workspace: string;
      client: string;
      gstin?: string;
      compliance_period: string;
      run_type: "gstr_2b_purchase";
      notes?: string;
    }) => {
      const response = await apiClient.post("/reconciliation/runs/", payload);
      return unwrapApiData<ReconciliationRunRecord>(response);
    },
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.runs(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.run(run.id) });
    },
  });
}

export function useUpdateReconciliationItemMutation(runId?: string, filtersToInvalidate?: RunItemFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      itemId: string;
      action_status: ReconciliationItemRecord["action_status"];
      assigned_to?: number | null;
      remarks?: string;
    }) => {
      const response = await apiClient.patch(`/reconciliation/items/${payload.itemId}/`, {
        action_status: payload.action_status,
        assigned_to: payload.assigned_to ?? null,
        remarks: payload.remarks ?? "",
      });
      return unwrapApiData<ReconciliationItemRecord>(response);
    },
    onSuccess: (item) => {
      if (runId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.items(runId, filtersToInvalidate) });
        queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.run(runId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.item(item.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.runs({}) });
    },
  });
}
