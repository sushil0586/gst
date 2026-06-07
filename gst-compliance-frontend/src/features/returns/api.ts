import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { ReturnPreparationRecord, ReturnReadinessPayload } from "@/types/api";

type ReturnFilters = {
  workspace?: string;
  client?: string;
  gstin?: string;
  period?: string;
  return_type?: string;
};

type PrepareReturnPayload = {
  workspace: string;
  client: string;
  gstin: string;
  compliance_period: string;
  return_type: "gstr1" | "gstr3b" | "gstr9" | "gstr9c";
};

export function useReturnsQuery(filters: ReturnFilters) {
  return useQuery({
    queryKey: queryKeys.returns.list(filters),
    enabled: Boolean(filters.client || filters.period),
    queryFn: async () => {
      const response = await apiClient.get("/returns/", { params: filters });
      return unwrapPaginatedData<ReturnPreparationRecord>(response);
    },
  });
}

export function useReturnQuery(returnId?: string) {
  return useQuery({
    queryKey: returnId ? queryKeys.returns.detail(returnId) : ["returns", "detail", "missing"],
    enabled: Boolean(returnId),
    queryFn: async () => {
      const response = await apiClient.get(`/returns/${returnId}/`);
      return unwrapApiData<ReturnPreparationRecord>(response);
    },
  });
}

export function useReturnReadinessQuery(filters: ReturnFilters) {
  return useQuery({
    queryKey: queryKeys.returns.readiness(filters),
    enabled: Boolean(filters.workspace && filters.client && filters.gstin && filters.period),
    queryFn: async () => {
      const response = await apiClient.get("/returns/readiness/", {
        params: {
          workspace: filters.workspace,
          client: filters.client,
          gstin: filters.gstin,
          compliance_period: filters.period,
        },
      });
      return unwrapApiData<ReturnReadinessPayload>(response);
    },
  });
}

export function usePrepareReturnMutation(filtersToInvalidate?: ReturnFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PrepareReturnPayload) => {
      const response = await apiClient.post("/returns/prepare/", payload);
      return unwrapApiData<ReturnPreparationRecord>(response);
    },
    onSuccess: (preparedReturn) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.detail(preparedReturn.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.readiness(filtersToInvalidate) });
    },
  });
}

export function useApproveReturnMutation(filtersToInvalidate?: ReturnFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (returnId: string) => {
      const response = await apiClient.post(`/returns/${returnId}/approve/`, {});
      return unwrapApiData<ReturnPreparationRecord>(response);
    },
    onSuccess: (preparedReturn) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.detail(preparedReturn.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.readiness(filtersToInvalidate) });
    },
  });
}

export function useMarkFiledMutation(filtersToInvalidate?: ReturnFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ returnId, arn }: { returnId: string; arn?: string }) => {
      const response = await apiClient.post(`/returns/${returnId}/mark-filed/`, { arn: arn ?? "" });
      return unwrapApiData<ReturnPreparationRecord>(response);
    },
    onSuccess: (preparedReturn) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.detail(preparedReturn.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.readiness(filtersToInvalidate) });
    },
  });
}
