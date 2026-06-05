import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { ClientBootstrapRequest, ClientBootstrapResult, ClientContactRecord, ClientRecord } from "@/types/api";

export function useClientsQuery(workspaceId?: string) {
  return useQuery({
    queryKey: queryKeys.clients.list(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const response = await apiClient.get("/clients/", {
        params: { workspace: workspaceId },
      });
      return unwrapPaginatedData<ClientRecord>(response);
    },
  });
}

export function useClientQuery(clientId?: string) {
  return useQuery({
    queryKey: clientId ? queryKeys.clients.detail(clientId) : ["clients", "detail", "missing"],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const response = await apiClient.get(`/clients/${clientId}/`);
      return unwrapApiData<ClientRecord>(response);
    },
  });
}

export function useClientContactsQuery(clientId?: string) {
  return useQuery({
    queryKey: queryKeys.clients.contacts(clientId),
    enabled: Boolean(clientId),
    queryFn: async () => {
      const response = await apiClient.get("/client-contacts/", {
        params: { client: clientId },
      });
      return unwrapPaginatedData<ClientContactRecord>(response);
    },
  });
}

export function useCreateClientMutation(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Omit<ClientRecord, "id" | "workspace_name" | "is_active"> & { workspace: string }) => {
      const response = await apiClient.post("/clients/", payload);
      return unwrapApiData<ClientRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.context(workspaceId) });
    },
  });
}

export function useBootstrapClientMutation(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ClientBootstrapRequest) => {
      const response = await apiClient.post("/clients/bootstrap/", payload);
      return unwrapApiData<ClientBootstrapResult>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gstins.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.context(workspaceId) });
    },
  });
}

export function useUpdateClientMutation(workspaceId?: string, clientId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<ClientRecord>) => {
      const response = await apiClient.patch(`/clients/${clientId}/`, payload);
      return unwrapApiData<ClientRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(workspaceId) });
      if (clientId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.context(workspaceId) });
    },
  });
}

export function useDeleteClientMutation(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      await apiClient.delete(`/clients/${clientId}/`);
      return clientId;
    },
    onSuccess: (clientId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gstins.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.compliancePeriods.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.context(workspaceId) });
    },
  });
}

export function useCreateClientContactMutation(clientId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      payload: Omit<ClientContactRecord, "id" | "client_name" | "workspace" | "is_active" | "created_at" | "updated_at">,
    ) => {
      const response = await apiClient.post("/client-contacts/", payload);
      return unwrapApiData<ClientContactRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.contacts(clientId) });
    },
  });
}

export function useUpdateClientContactMutation(clientId?: string, contactId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<ClientContactRecord>) => {
      const response = await apiClient.patch(`/client-contacts/${contactId}/`, payload);
      return unwrapApiData<ClientContactRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.contacts(clientId) });
    },
  });
}

export function useDeleteClientContactMutation(clientId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contactId: string) => {
      await apiClient.delete(`/client-contacts/${contactId}/`);
      return contactId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.contacts(clientId) });
    },
  });
}
