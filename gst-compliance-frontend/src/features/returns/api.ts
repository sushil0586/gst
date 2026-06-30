import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { PortalChallanRecord, PortalFilingReadinessPayload, ReturnPreparationRecord, ReturnReadinessPayload } from "@/types/api";

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
  return_type: "gstr1" | "gstr3b" | "gstr7" | "gstr9" | "gstr9c";
};

type GeneratePortalChallanPayload = {
  workspace: string;
  client: string;
  gstin: string;
  compliance_period: string;
  return_type: "gstr3b";
  challan_reason: string;
  payment_mode: string;
  bank_code?: string;
  sub_payment_mode?: string;
  mobile_number: string;
  address: string;
  cgst_tax_amount: string;
  igst_tax_amount: string;
  sgst_tax_amount: string;
  cess_tax_amount: string;
};

type ValidatePortalChallanResult = {
  valid: boolean;
  error_message: string;
  provider_response: Record<string, unknown>;
  computed_total_amount: string;
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

export function usePortalFilingReadinessQuery(filters: ReturnFilters & { return_type?: string }) {
  return useQuery({
    queryKey: queryKeys.returns.portalFilingReadiness(filters),
    enabled: Boolean(filters.workspace && filters.client && filters.gstin && filters.period && filters.return_type),
    queryFn: async () => {
      const response = await apiClient.get("/returns/portal-filing-readiness/", {
        params: {
          workspace: filters.workspace,
          client: filters.client,
          gstin: filters.gstin,
          compliance_period: filters.period,
          return_type: filters.return_type,
        },
      });
      return unwrapApiData<PortalFilingReadinessPayload>(response);
    },
  });
}

export function usePortalChallanRequestsQuery(filters: ReturnFilters & { return_type?: string }) {
  return useQuery({
    queryKey: queryKeys.returns.portalChallanRequests(filters),
    enabled: Boolean(filters.workspace && filters.client && filters.gstin && filters.period && filters.return_type),
    queryFn: async () => {
      const response = await apiClient.get("/returns/portal-challan-requests/", {
        params: {
          workspace: filters.workspace,
          client: filters.client,
          gstin: filters.gstin,
          compliance_period: filters.period,
          return_type: filters.return_type,
        },
      });
      return unwrapApiData<PortalChallanRecord[]>(response);
    },
  });
}

export function useGeneratePortalChallanMutation(filtersToInvalidate?: ReturnFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: GeneratePortalChallanPayload) => {
      const response = await apiClient.post("/returns/generate-portal-challan/", payload);
      return unwrapApiData<PortalChallanRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.portalFilingReadiness(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.portalChallanRequests(filtersToInvalidate) });
    },
  });
}

export function useValidatePortalChallanMutation() {
  return useMutation({
    mutationFn: async (payload: GeneratePortalChallanPayload) => {
      const response = await apiClient.post("/returns/validate-portal-challan/", payload);
      return unwrapApiData<ValidatePortalChallanResult>(response);
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
