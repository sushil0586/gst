import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { ApprovalRequestRecord } from "@/types/api";

type ApprovalFilters = {
  workspace?: string;
  client?: string;
  gstin?: string;
  period?: string;
  status?: string;
  entity_type?: string;
};

export function useApprovalsQuery(filters: ApprovalFilters) {
  return useQuery({
    queryKey: queryKeys.approvals.list(filters),
    enabled: Boolean(filters.workspace || filters.client || filters.period),
    queryFn: async () => {
      const response = await apiClient.get("/approvals/", { params: filters });
      return unwrapPaginatedData<ApprovalRequestRecord>(response);
    },
  });
}

export function useCreateApprovalMutation(filtersToInvalidate?: ApprovalFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<ApprovalRequestRecord, "id" | "workspace_name" | "client_name" | "gstin_value" | "compliance_period_label" | "requested_to_name" | "resolved_by" | "resolved_by_name" | "resolved_at" | "created_at" | "updated_at" | "resolution_comments">) => {
      const response = await apiClient.post("/approvals/", payload);
      return unwrapApiData<ApprovalRequestRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(filtersToInvalidate) });
    },
  });
}

function useApprovalActionMutation(path: "approve" | "reject" | "cancel", filtersToInvalidate?: ApprovalFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ approvalId, comments }: { approvalId: string; comments?: string }) => {
      const response = await apiClient.post(`/approvals/${approvalId}/${path}/`, { comments: comments ?? "" });
      return unwrapApiData<ApprovalRequestRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(filtersToInvalidate) });
    },
  });
}

export function useApproveApprovalMutation(filtersToInvalidate?: ApprovalFilters) {
  return useApprovalActionMutation("approve", filtersToInvalidate);
}

export function useRejectApprovalMutation(filtersToInvalidate?: ApprovalFilters) {
  return useApprovalActionMutation("reject", filtersToInvalidate);
}

export function useCancelApprovalMutation(filtersToInvalidate?: ApprovalFilters) {
  return useApprovalActionMutation("cancel", filtersToInvalidate);
}
