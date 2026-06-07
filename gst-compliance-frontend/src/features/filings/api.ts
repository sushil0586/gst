import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type {
  ProviderAuthSessionRecord,
  ReturnFilingAttemptRecord,
  ReturnFilingEventRecord,
  ReturnFilingOperationsRecord,
  ReturnFilingRecord,
} from "@/types/api";

type FilingFilters = {
  workspace?: string;
  client?: string;
  gstin?: string;
  period?: string;
  compliance_period?: string;
  prepared_return?: string;
  return_type?: string;
  provider?: string;
  status?: string;
  include_resolved?: string;
  page_size?: string;
};

type ProviderAuthSessionFilters = {
  workspace?: string;
  client?: string;
  gstin?: string;
  provider?: string;
  status?: string;
  response_contract_confirmed?: string;
};

type StartFilingPayload = {
  workspace: string;
  client: string;
  gstin: string;
  compliance_period: string;
  prepared_return: string;
  return_type: "gstr1" | "gstr3b";
  provider: "whitebooks";
  approval_request?: string;
  confirmation_note?: string;
};

type RequestProviderOTPPayload = {
  workspace: string;
  client: string;
  gstin?: string;
  provider: "whitebooks" | "demo_gsp";
  email?: string;
};

type VerifyProviderOTPPayload = {
  sessionId: string;
  otp: string;
  txn?: string;
};

type RefreshProviderAuthSessionPayload = {
  sessionId: string;
  txn?: string;
};

export function useFilingsQuery(filters: FilingFilters) {
  return useQuery({
    queryKey: queryKeys.filings.list(filters),
    enabled: Boolean(filters.workspace && (filters.compliance_period || filters.period)),
    queryFn: async () => {
      const response = await apiClient.get("/filings/", {
        params: {
          ...filters,
          compliance_period: filters.compliance_period ?? filters.period,
        },
      });
      return unwrapPaginatedData<ReturnFilingRecord>(response);
    },
  });
}

export function useFilingOperationsQuery(filters: FilingFilters) {
  return useQuery({
    queryKey: queryKeys.filings.operations(filters),
    enabled: Boolean(filters.workspace),
    queryFn: async () => {
      const response = await apiClient.get("/filings/operations/", { params: filters });
      return unwrapPaginatedData<ReturnFilingOperationsRecord>(response);
    },
  });
}

export function useProviderAuthSessionsQuery(filters: ProviderAuthSessionFilters) {
  return useQuery({
    queryKey: queryKeys.providerAuthSessions.list(filters),
    enabled: Boolean(filters.workspace && filters.client),
    queryFn: async () => {
      const response = await apiClient.get("/provider-auth-sessions/", { params: filters });
      return unwrapPaginatedData<ProviderAuthSessionRecord>(response);
    },
  });
}

export function useFilingAttemptsQuery(filingId?: string) {
  return useQuery({
    queryKey: filingId ? queryKeys.filings.attempts(filingId) : ["filings", "attempts", "missing"],
    enabled: Boolean(filingId),
    queryFn: async () => {
      const response = await apiClient.get(`/filings/${filingId}/attempts/`);
      return unwrapPaginatedData<ReturnFilingAttemptRecord>(response);
    },
  });
}

export function useFilingEventsQuery(filingId?: string) {
  return useQuery({
    queryKey: filingId ? queryKeys.filings.events(filingId) : ["filings", "events", "missing"],
    enabled: Boolean(filingId),
    queryFn: async () => {
      const response = await apiClient.get(`/filings/${filingId}/events/`);
      return unwrapPaginatedData<ReturnFilingEventRecord>(response);
    },
  });
}

export function useRequestProviderOTPMutation(filtersToInvalidate?: ProviderAuthSessionFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RequestProviderOTPPayload) => {
      const response = await apiClient.post("/provider-auth-sessions/request-otp/", payload);
      return unwrapApiData<ProviderAuthSessionRecord>(response);
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.providerAuthSessions.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.providerAuthSessions.detail(session.id) });
    },
  });
}

export function useVerifyProviderOTPMutation(filtersToInvalidate?: ProviderAuthSessionFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, otp, txn }: VerifyProviderOTPPayload) => {
      const response = await apiClient.post(`/provider-auth-sessions/${sessionId}/verify-otp/`, {
        otp,
        txn: txn ?? "",
      });
      return unwrapApiData<ProviderAuthSessionRecord>(response);
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.providerAuthSessions.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.providerAuthSessions.detail(session.id) });
    },
  });
}

export function useRefreshProviderAuthSessionMutation(filtersToInvalidate?: ProviderAuthSessionFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, txn }: RefreshProviderAuthSessionPayload) => {
      const response = await apiClient.post(`/provider-auth-sessions/${sessionId}/refresh-token/`, {
        txn: txn ?? "",
      });
      return unwrapApiData<ProviderAuthSessionRecord>(response);
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.providerAuthSessions.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.providerAuthSessions.detail(session.id) });
    },
  });
}

export const useWhiteBooksAuthSessionsQuery = useProviderAuthSessionsQuery;
export const useRequestWhiteBooksOTPMutation = useRequestProviderOTPMutation;
export const useRefreshWhiteBooksAuthSessionMutation = useRefreshProviderAuthSessionMutation;
export const useVerifyWhiteBooksOTPMutation = useVerifyProviderOTPMutation;

export function useStartFilingMutation(filtersToInvalidate?: FilingFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: StartFilingPayload) => {
      const response = await apiClient.post("/filings/start/", payload);
      return unwrapApiData<ReturnFilingRecord>(response);
    },
    onSuccess: (filing) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.operations(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.detail(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.attempts(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.events(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.detail(filing.prepared_return) });
    },
  });
}

export function useRetryFilingMutation(filtersToInvalidate?: FilingFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ filingId, comments }: { filingId: string; comments?: string }) => {
      const response = await apiClient.post(`/filings/${filingId}/retry/`, { comments: comments ?? "" });
      return unwrapApiData<ReturnFilingRecord>(response);
    },
    onSuccess: (filing) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.operations(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.detail(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.attempts(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.events(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.detail(filing.prepared_return) });
    },
  });
}

export function useResyncFilingMutation(filtersToInvalidate?: FilingFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (filingId: string) => {
      const response = await apiClient.post(`/filings/${filingId}/resync/`, {});
      return unwrapApiData<ReturnFilingRecord>(response);
    },
    onSuccess: (filing) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.operations(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.detail(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.attempts(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.events(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.detail(filing.prepared_return) });
    },
  });
}

export function useRequeueAfterReviewMutation(filtersToInvalidate?: FilingFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ filingId, comments }: { filingId: string; comments: string }) => {
      const response = await apiClient.post(`/filings/${filingId}/requeue-after-review/`, { comments });
      return unwrapApiData<ReturnFilingRecord>(response);
    },
    onSuccess: (filing) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.operations(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.detail(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.attempts(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.events(filing.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.detail(filing.prepared_return) });
    },
  });
}

export function useEscalateFilingAlertsMutation(filtersToInvalidate?: FilingFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ filingId, comments }: { filingId: string; comments?: string }) => {
      const response = await apiClient.post(`/filings/${filingId}/escalate-alerts/`, { comments: comments ?? "" });
      return unwrapApiData(response);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.operations(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.detail(variables.filingId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.filings.events(variables.filingId) });
    },
  });
}
