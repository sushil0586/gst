import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { OrganizationRecord, WorkspaceRecord } from "@/types/api";

type WorkspaceMutationPayload =
  Pick<WorkspaceRecord, "organization" | "name" | "code" | "timezone">
  & Partial<
    Pick<
      WorkspaceRecord,
      "office_label" | "address_line_1" | "address_line_2" | "city" | "state" | "postal_code" | "contact_email" | "contact_phone"
    >
  >;

export function useCreateOrganizationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Pick<OrganizationRecord, "name" | "code">) => {
      const response = await apiClient.post("/organizations/", payload);
      return unwrapApiData<OrganizationRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
    },
  });
}

export function useCreateWorkspaceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: WorkspaceMutationPayload) => {
      const response = await apiClient.post("/workspaces/", payload);
      return unwrapApiData<WorkspaceRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.all });
    },
  });
}

export function useUpdateWorkspaceMutation(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: WorkspaceMutationPayload) => {
      const response = await apiClient.patch(`/workspaces/${workspaceId}/`, payload);
      return unwrapApiData<WorkspaceRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.context() });
    },
  });
}

export function useDeactivateWorkspaceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workspaceId: string) => {
      await apiClient.delete(`/workspaces/${workspaceId}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.context() });
    },
  });
}
