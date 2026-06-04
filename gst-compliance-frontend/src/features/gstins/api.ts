import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { GSTINRecordApi, GSTINTaxpayerSearchResult } from "@/types/api";

export function useGstinsQuery(clientId?: string) {
  return useQuery({
    queryKey: queryKeys.gstins.list(clientId),
    enabled: Boolean(clientId),
    queryFn: async () => {
      const response = await apiClient.get("/gstins/", {
        params: { client: clientId },
      });
      return unwrapPaginatedData<GSTINRecordApi>(response);
    },
  });
}

export function useGstinQuery(gstinId?: string) {
  return useQuery({
    queryKey: gstinId ? queryKeys.gstins.detail(gstinId) : ["gstins", "detail", "missing"],
    enabled: Boolean(gstinId),
    queryFn: async () => {
      const response = await apiClient.get(`/gstins/${gstinId}/`);
      return unwrapApiData<GSTINRecordApi>(response);
    },
  });
}

export function useCreateGstinMutation(clientId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Omit<GSTINRecordApi, "id" | "client_name" | "workspace_id" | "is_active">) => {
      const response = await apiClient.post("/gstins/", payload);
      return unwrapApiData<GSTINRecordApi>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gstins.list(clientId) });
      queryClient.invalidateQueries({ queryKey: ["workspace", "context"] });
    },
  });
}

export function useUpdateGstinMutation(clientId?: string, gstinId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<GSTINRecordApi>) => {
      const response = await apiClient.patch(`/gstins/${gstinId}/`, payload);
      return unwrapApiData<GSTINRecordApi>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gstins.list(clientId) });
      if (gstinId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.gstins.detail(gstinId) });
      }
      queryClient.invalidateQueries({ queryKey: ["workspace", "context"] });
    },
  });
}

export function useSearchTaxpayerMutation(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { gstin: string; email?: string }) => {
      const response = await apiClient.get("/gstins/search-taxpayer/", {
        params: {
          workspace: workspaceId,
          gstin: payload.gstin,
          ...(payload.email ? { email: payload.email } : {}),
        },
      });
      return unwrapApiData<GSTINTaxpayerSearchResult>(response);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        queryKeys.gstins.taxpayerSearch(workspaceId, result.gstin),
        result,
      );
    },
  });
}
