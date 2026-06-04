import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { OrganizationRecord, WorkspaceContextDataRecord, WorkspaceMemberRecord, WorkspaceRecord } from "@/types/api";

export function useOrganizationsQuery() {
  return useQuery({
    queryKey: queryKeys.organizations.all,
    queryFn: async () => {
      const response = await apiClient.get("/organizations/");
      return unwrapPaginatedData<OrganizationRecord>(response);
    },
  });
}

export function useWorkspacesQuery() {
  return useQuery({
    queryKey: queryKeys.workspace.all,
    queryFn: async () => {
      const response = await apiClient.get("/workspaces/");
      return unwrapPaginatedData<WorkspaceRecord>(response);
    },
  });
}

export function useWorkspaceContextDataQuery(workspaceId?: string) {
  return useQuery({
    queryKey: queryKeys.workspace.context(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const response = await apiClient.get("/workspaces/context/", {
        params: { workspace: workspaceId },
      });
      return unwrapApiData<WorkspaceContextDataRecord>(response);
    },
  });
}

export function useWorkspaceMembersQuery(workspaceId?: string) {
  return useQuery({
    queryKey: queryKeys.workspaceMembers.list(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const response = await apiClient.get("/workspace-members/", { params: { workspace: workspaceId } });
      return unwrapPaginatedData<WorkspaceMemberRecord>(response);
    },
  });
}

export function useCreateWorkspaceMemberMutation(workspaceId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { workspace: string; email: string; first_name: string; last_name?: string; role: string; password: string }) => {
      const response = await apiClient.post("/workspace-members/", payload);
      return unwrapApiData<WorkspaceMemberRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers.list(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.context(workspaceId) });
    },
  });
}

export function useUpdateWorkspaceMemberMutation(workspaceId?: string, memberId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { role: string }) => {
      const response = await apiClient.patch(`/workspace-members/${memberId}/`, payload);
      return unwrapApiData<WorkspaceMemberRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers.list(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.context(workspaceId) });
    },
  });
}

export function useDeactivateWorkspaceMemberMutation(workspaceId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      await apiClient.delete(`/workspace-members/${memberId}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers.list(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.context(workspaceId) });
    },
  });
}
