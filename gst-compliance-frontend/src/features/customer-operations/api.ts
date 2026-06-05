import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { OperationalFollowUpRecord, ReturnStatusRegisterRecord } from "@/types/api";

export type OperationalFollowUpCreatePayload = {
  workspace: string;
  client: string;
  gstin?: string | null;
  compliance_period?: string | null;
  return_preparation?: string | null;
  return_filing?: string | null;
  notice?: string | null;
  contact?: string | null;
  follow_up_type: OperationalFollowUpRecord["follow_up_type"];
  reason: string;
  pending_with: OperationalFollowUpRecord["pending_with"];
  status: OperationalFollowUpRecord["status"];
  priority: OperationalFollowUpRecord["priority"];
  title: string;
  notes?: string;
  next_action?: string;
  due_at: string;
  assigned_to?: number | null;
};

export type OperationalFollowUpUpdatePayload = Partial<
  Pick<
    OperationalFollowUpRecord,
    | "contact"
    | "follow_up_type"
    | "reason"
    | "pending_with"
    | "status"
    | "priority"
    | "title"
    | "notes"
    | "next_action"
    | "due_at"
    | "assigned_to"
  >
>;

export function useOperationalFollowUpsQuery(filters?: Record<string, string | undefined>) {
  return useQuery({
    queryKey: queryKeys.operationalFollowUps.list(filters),
    enabled: Boolean(filters?.workspace),
    queryFn: async () => {
      const response = await apiClient.get("/operational-follow-ups/", { params: filters });
      return unwrapPaginatedData<OperationalFollowUpRecord>(response);
    },
  });
}

export function useReturnStatusRegisterQuery(filters?: Record<string, string | undefined>) {
  return useQuery({
    queryKey: queryKeys.returnStatusRegister.list(filters),
    enabled: Boolean(filters?.workspace),
    queryFn: async () => {
      const response = await apiClient.get("/return-status-register/", { params: filters });
      return unwrapPaginatedData<ReturnStatusRegisterRecord>(response);
    },
  });
}

export function useCreateOperationalFollowUpMutation(filtersToInvalidate?: Record<string, string | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: OperationalFollowUpCreatePayload) => {
      const response = await apiClient.post("/operational-follow-ups/", payload);
      return unwrapApiData<OperationalFollowUpRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.operationalFollowUps.list(filtersToInvalidate) });
    },
  });
}

export function useUpdateOperationalFollowUpMutation(
  filtersToInvalidate?: Record<string, string | undefined>,
  followUpId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: OperationalFollowUpUpdatePayload) => {
      const response = await apiClient.patch(`/operational-follow-ups/${followUpId}/`, payload);
      return unwrapApiData<OperationalFollowUpRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.operationalFollowUps.list(filtersToInvalidate) });
      if (followUpId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.operationalFollowUps.detail(followUpId) });
      }
    },
  });
}

export function useCompleteOperationalFollowUpMutation(filtersToInvalidate?: Record<string, string | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { followUpId: string; closed_reason?: string }) => {
      const response = await apiClient.post(`/operational-follow-ups/${payload.followUpId}/mark-completed/`, {
        closed_reason: payload.closed_reason,
      });
      return unwrapApiData<OperationalFollowUpRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.operationalFollowUps.list(filtersToInvalidate) });
    },
  });
}

export function useEscalateOperationalFollowUpMutation(filtersToInvalidate?: Record<string, string | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { followUpId: string; notes?: string }) => {
      const response = await apiClient.post(`/operational-follow-ups/${payload.followUpId}/mark-escalated/`, {
        notes: payload.notes,
      });
      return unwrapApiData<OperationalFollowUpRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.operationalFollowUps.list(filtersToInvalidate) });
    },
  });
}

export function useLogOperationalFollowUpContactMutation(filtersToInvalidate?: Record<string, string | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { followUpId: string; notes?: string }) => {
      const response = await apiClient.post(`/operational-follow-ups/${payload.followUpId}/log-contact/`, {
        notes: payload.notes,
      });
      return unwrapApiData<OperationalFollowUpRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.operationalFollowUps.list(filtersToInvalidate) });
    },
  });
}
