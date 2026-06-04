import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { OrganizationRecord, WorkspaceRecord } from "@/types/api";

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
    mutationFn: async (payload: Pick<WorkspaceRecord, "organization" | "name" | "code" | "timezone">) => {
      const response = await apiClient.post("/workspaces/", payload);
      return unwrapApiData<WorkspaceRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.all });
    },
  });
}
