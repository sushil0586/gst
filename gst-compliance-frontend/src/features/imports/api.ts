import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type {
  GSTTransactionLineItem,
  GSTTransactionRecord,
  ImportBatchRecord,
  ImportBatchCorrectionPolicyRecord,
  ImportImpactSummaryRecord,
  ImportRowErrorRecord,
  ImportTemplateRecord,
  TransactionRemediationAssignmentRecord,
  TransactionRemediationDigestRecord,
  TransactionRemediationFollowUpRecord,
  TransactionReviewSnapshotRecord,
  WorkspaceMemberRecord,
} from "@/types/api";

type ImportBatchFilters = {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
};

type UploadImportBatchPayload = {
  workspace: string;
  client: string;
  gstin?: string;
  import_template?: string;
  compliance_period: string;
  import_type: ImportBatchRecord["import_type"];
  source_type: ImportBatchRecord["source_type"];
  file: File;
};

type FetchGSTR2BImportPayload = {
  workspace: string;
  client: string;
  gstin: string;
  compliance_period: string;
  provider?: "whitebooks";
};

type CorrectImportRowPayload = {
  batchId: string;
  rowNumber: number;
  rawRow: Record<string, string>;
  exceptionContext?: {
    allow_period_override: boolean;
    reason: string;
    category: string;
  };
};

type DiscardImportRowPayload = {
  batchId: string;
  rowNumber: number;
};

type DiscardImportBatchPayload = {
  batchId: string;
};

type ReplaceImportBatchPayload = {
  batchId: string;
  file: File;
};

type ReprocessImportBatchPayload = {
  batchId: string;
};

type ImportTemplateFilters = {
  workspace?: string;
  import_type?: string;
  source_type?: string;
};

export function useImportBatchesQuery(filters: ImportBatchFilters) {
  return useQuery({
    queryKey: queryKeys.imports.list(filters),
    enabled: Boolean(filters.workspace || filters.client || filters.compliance_period),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.items?.some((batch) => batch.status === "queued" || batch.status === "processing") ? 3000 : false;
    },
    queryFn: async () => {
      const response = await apiClient.get("/imports/batches/", { params: filters });
      return unwrapPaginatedData<ImportBatchRecord>(response);
    },
  });
}

export function useImportBatchQuery(batchId?: string) {
  return useQuery({
    queryKey: batchId ? queryKeys.imports.detail(batchId) : ["imports", "detail", "missing"],
    enabled: Boolean(batchId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "queued" || data?.status === "processing" ? 3000 : false;
    },
    queryFn: async () => {
      const response = await apiClient.get(`/imports/batches/${batchId}/`);
      return unwrapApiData<ImportBatchRecord>(response);
    },
  });
}

export function useImportBatchErrorsQuery(batchId?: string) {
  return useQuery({
    queryKey: batchId ? queryKeys.imports.errors(batchId) : ["imports", "errors", "missing"],
    enabled: Boolean(batchId),
    queryFn: async () => {
      const response = await apiClient.get(`/imports/batches/${batchId}/errors/`);
      return unwrapPaginatedData<ImportRowErrorRecord>(response);
    },
  });
}

export function useImportBatchCorrectionPolicyQuery(batchId?: string) {
  return useQuery({
    queryKey: batchId ? queryKeys.imports.correctionPolicy(batchId) : ["imports", "correction-policy", "missing"],
    enabled: Boolean(batchId),
    queryFn: async () => {
      const response = await apiClient.get(`/imports/batches/${batchId}/correction-policy/`);
      return unwrapApiData<ImportBatchCorrectionPolicyRecord>(response);
    },
  });
}

export function useImportBatchImpactSummaryQuery(batchId?: string) {
  return useQuery({
    queryKey: batchId ? queryKeys.imports.impactSummary(batchId) : ["imports", "impact-summary", "missing"],
    enabled: Boolean(batchId),
    queryFn: async () => {
      const response = await apiClient.get(`/imports/batches/${batchId}/impact-summary/`);
      return unwrapApiData<ImportImpactSummaryRecord>(response);
    },
  });
}

export function useGstTransactionsQuery(filters: {
  ids?: string;
  client?: string;
  gstin?: string;
  period?: string;
  source_import_batch?: string;
  import_batch?: string;
  transaction_type?: string;
  document_type?: string;
  counterparty_gstin?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.transactions.list(filters),
    enabled: options?.enabled ?? Boolean(filters.client || filters.source_import_batch),
    queryFn: async () => {
      const response = await apiClient.get("/gst-transactions/", { params: filters });
      return unwrapPaginatedData<GSTTransactionRecord>(response);
    },
  });
}

export function useGstTransactionQuery(transactionId?: string) {
  return useQuery({
    queryKey: transactionId ? queryKeys.transactions.detail(transactionId) : ["gst-transactions", "detail", "missing"],
    enabled: Boolean(transactionId),
    queryFn: async () => {
      const response = await apiClient.get(`/gst-transactions/${transactionId}/`);
      return unwrapApiData<GSTTransactionRecord>(response);
    },
  });
}

export function useTransactionReviewSnapshotsQuery(filters: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.transactions.remediationSnapshots(filters),
    enabled: options?.enabled ?? Boolean(filters.workspace && filters.client && filters.compliance_period),
    queryFn: async () => {
      const response = await apiClient.get("/gst-transaction-review-snapshots/", { params: filters });
      return unwrapPaginatedData<TransactionReviewSnapshotRecord>(response);
    },
  });
}

export function useWorkspaceMembersQuery(workspaceId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.workspaceMembers.list(workspaceId),
    enabled: options?.enabled ?? Boolean(workspaceId),
    queryFn: async () => {
      const response = await apiClient.get("/workspace-members/", { params: { workspace: workspaceId } });
      return unwrapPaginatedData<WorkspaceMemberRecord>(response);
    },
  });
}

export function useTransactionRemediationAssignmentsQuery(filters: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.transactions.remediationAssignments(filters),
    enabled: options?.enabled ?? Boolean(filters.workspace && filters.client && filters.compliance_period),
    queryFn: async () => {
      const response = await apiClient.get("/gst-transaction-remediation-assignments/", { params: filters });
      return unwrapPaginatedData<TransactionRemediationAssignmentRecord>(response);
    },
  });
}

export function useTransactionRemediationDigestsQuery(filters: {
  workspace?: string;
  generated_for?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: queryKeys.transactions.remediationDigests(filters),
    enabled: Boolean(filters.workspace),
    queryFn: async () => {
      const response = await apiClient.get("/gst-transaction-remediation-digests/", { params: filters });
      return unwrapPaginatedData<TransactionRemediationDigestRecord>(response);
    },
  });
}

export function useTransactionRemediationFollowUpsQuery(filters: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
  assignment?: string;
}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.transactions.remediationFollowUps(filters),
    enabled: options?.enabled ?? Boolean(filters.workspace && filters.client && filters.compliance_period),
    queryFn: async () => {
      const response = await apiClient.get("/gst-transaction-remediation-follow-ups/", { params: filters });
      return unwrapPaginatedData<TransactionRemediationFollowUpRecord>(response);
    },
  });
}

export function useUpdateGstTransactionMutation(filtersToInvalidate?: {
  client?: string;
  gstin?: string;
  period?: string;
  source_import_batch?: string;
  import_batch?: string;
  transaction_type?: string;
  document_type?: string;
  counterparty_gstin?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      transactionId: string;
      counterparty_name?: string;
      counterparty_gstin?: string;
      place_of_supply?: string;
      document_type?: string;
      reverse_charge?: boolean;
      status?: string;
      metadata?: {
        line_items?: GSTTransactionLineItem[];
      };
    }) => {
      const response = await apiClient.patch(`/gst-transactions/${payload.transactionId}/`, {
        counterparty_name: payload.counterparty_name,
        counterparty_gstin: payload.counterparty_gstin,
        place_of_supply: payload.place_of_supply,
        document_type: payload.document_type,
        reverse_charge: payload.reverse_charge,
        status: payload.status,
        metadata: payload.metadata,
      });
      return unwrapApiData<GSTTransactionRecord>(response);
    },
    onSuccess: (transaction) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.detail(transaction.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.readiness({ period: transaction.compliance_period ?? undefined, client: transaction.client ?? undefined, gstin: transaction.gstin ?? undefined, workspace: transaction.workspace ?? undefined }) });
    },
  });
}

export function useBulkUpdateGstTransactionsMutation(filtersToInvalidate?: {
  ids?: string;
  client?: string;
  gstin?: string;
  period?: string;
  source_import_batch?: string;
  import_batch?: string;
  transaction_type?: string;
  document_type?: string;
  counterparty_gstin?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      ids: string[];
      place_of_supply?: string;
      reverse_charge?: boolean;
      status?: string;
      metadata_updates?: {
        hsn_code?: string;
        description?: string;
        uqc?: string;
        quantity?: string;
        is_service?: boolean;
        supply_category?: string;
        ecommerce_gstin?: string;
      };
    }) => {
      const response = await apiClient.post("/gst-transactions/bulk-correct/", payload);
      return unwrapApiData<GSTTransactionRecord[]>(response);
    },
    onSuccess: (transactions) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.list(filtersToInvalidate) });
      transactions.forEach((transaction) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions.detail(transaction.id) });
        queryClient.invalidateQueries({
          queryKey: queryKeys.returns.readiness({
            period: transaction.compliance_period ?? undefined,
            client: transaction.client ?? undefined,
            gstin: transaction.gstin ?? undefined,
            workspace: transaction.workspace ?? undefined,
          }),
        });
      });
    },
  });
}

export function useCreateTransactionReviewSnapshotMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      workspace: string;
      client: string;
      gstin?: string;
      compliance_period: string;
      name?: string;
      filters: Record<string, unknown>;
      bucket_counts: Record<string, number>;
    }) => {
      const response = await apiClient.post("/gst-transaction-review-snapshots/", payload);
      return unwrapApiData<TransactionReviewSnapshotRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationSnapshots(filtersToInvalidate) });
    },
  });
}

export function useDeleteTransactionReviewSnapshotMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (snapshotId: string) => {
      await apiClient.delete(`/gst-transaction-review-snapshots/${snapshotId}/`);
      return snapshotId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationSnapshots(filtersToInvalidate) });
    },
  });
}

export function useCreateTransactionRemediationAssignmentMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      workspace: string;
      client: string;
      gstin?: string | null;
      compliance_period: string;
      snapshot?: string | null;
      bucket_code: string;
      title: string;
      transaction_ids: string[];
      filters: Record<string, unknown>;
      status: TransactionRemediationAssignmentRecord["status"];
      assigned_to?: number | null;
      notes?: string;
      escalation_notes?: string;
    }) => {
      const response = await apiClient.post("/gst-transaction-remediation-assignments/", payload);
      return unwrapApiData<TransactionRemediationAssignmentRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationAssignments(filtersToInvalidate) });
    },
  });
}

export function useUpdateTransactionRemediationAssignmentMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { assignmentId: string; status?: string; assigned_to?: number | null; notes?: string }) => {
      const response = await apiClient.patch(`/gst-transaction-remediation-assignments/${payload.assignmentId}/`, {
        status: payload.status,
        assigned_to: payload.assigned_to,
        notes: payload.notes,
      });
      return unwrapApiData<TransactionRemediationAssignmentRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationAssignments(filtersToInvalidate) });
    },
  });
}

export function useDeleteTransactionRemediationAssignmentMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignmentId: string) => {
      await apiClient.delete(`/gst-transaction-remediation-assignments/${assignmentId}/`);
      return assignmentId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationAssignments(filtersToInvalidate) });
    },
  });
}

export function useEscalateTransactionRemediationAssignmentMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { assignmentId: string; escalation_notes?: string }) => {
      const response = await apiClient.post(`/gst-transaction-remediation-assignments/${payload.assignmentId}/escalate/`, {
        escalation_notes: payload.escalation_notes,
      });
      return unwrapApiData<TransactionRemediationAssignmentRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationAssignments(filtersToInvalidate) });
    },
  });
}

export function useClearTransactionRemediationAssignmentEscalationMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const response = await apiClient.post(`/gst-transaction-remediation-assignments/${assignmentId}/clear-escalation/`, {});
      return unwrapApiData<TransactionRemediationAssignmentRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationAssignments(filtersToInvalidate) });
    },
  });
}

export function useCreateTransactionRemediationFollowUpMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      workspace: string;
      client: string;
      gstin?: string | null;
      compliance_period: string;
      assignment: string;
      assigned_to?: number | null;
      follow_up_type: TransactionRemediationFollowUpRecord["follow_up_type"];
      status?: TransactionRemediationFollowUpRecord["status"];
      title: string;
      notes?: string;
      remind_at: string;
    }) => {
      const response = await apiClient.post("/gst-transaction-remediation-follow-ups/", payload);
      return unwrapApiData<TransactionRemediationFollowUpRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationFollowUps(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary(filtersToInvalidate) });
    },
  });
}

export function useUpdateTransactionRemediationFollowUpMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      followUpId: string;
      assigned_to?: number | null;
      follow_up_type?: TransactionRemediationFollowUpRecord["follow_up_type"];
      status?: TransactionRemediationFollowUpRecord["status"];
      title?: string;
      notes?: string;
      remind_at?: string;
    }) => {
      const response = await apiClient.patch(`/gst-transaction-remediation-follow-ups/${payload.followUpId}/`, payload);
      return unwrapApiData<TransactionRemediationFollowUpRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationFollowUps(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary(filtersToInvalidate) });
    },
  });
}

export function useDeleteTransactionRemediationFollowUpMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (followUpId: string) => {
      await apiClient.delete(`/gst-transaction-remediation-follow-ups/${followUpId}/`);
      return followUpId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationFollowUps(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary(filtersToInvalidate) });
    },
  });
}

export function useCompleteTransactionRemediationFollowUpMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { followUpId: string; notes?: string }) => {
      const response = await apiClient.post(`/gst-transaction-remediation-follow-ups/${payload.followUpId}/mark-completed/`, {
        notes: payload.notes,
      });
      return unwrapApiData<TransactionRemediationFollowUpRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationFollowUps(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary(filtersToInvalidate) });
    },
  });
}

export function useDismissTransactionRemediationFollowUpMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { followUpId: string; notes?: string }) => {
      const response = await apiClient.post(`/gst-transaction-remediation-follow-ups/${payload.followUpId}/dismiss/`, {
        notes: payload.notes,
      });
      return unwrapApiData<TransactionRemediationFollowUpRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationFollowUps(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary(filtersToInvalidate) });
    },
  });
}

export function useSendTransactionRemediationFollowUpMutation(filtersToInvalidate?: {
  workspace?: string;
  client?: string;
  gstin?: string;
  compliance_period?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (followUpId: string) => {
      const response = await apiClient.post(`/gst-transaction-remediation-follow-ups/${followUpId}/send-now/`, {});
      return unwrapApiData<TransactionRemediationFollowUpRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationFollowUps(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.closeManager({ workspace: filtersToInvalidate?.workspace }) });
    },
  });
}

export function useCreateTransactionRemediationDigestMutation(filtersToInvalidate?: {
  workspace?: string;
  generated_for?: string;
  status?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      workspace: string;
      generated_for?: number | null;
      title: string;
      delivery_channel: TransactionRemediationDigestRecord["delivery_channel"];
    }) => {
      const response = await apiClient.post("/gst-transaction-remediation-digests/", payload);
      return unwrapApiData<TransactionRemediationDigestRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationDigests(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.closeManager({ workspace: filtersToInvalidate?.workspace }) });
    },
  });
}

export function useAcknowledgeTransactionRemediationDigestMutation(filtersToInvalidate?: {
  workspace?: string;
  generated_for?: string;
  status?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (digestId: string) => {
      const response = await apiClient.post(`/gst-transaction-remediation-digests/${digestId}/acknowledge/`, {});
      return unwrapApiData<TransactionRemediationDigestRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationDigests(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.closeManager({ workspace: filtersToInvalidate?.workspace }) });
    },
  });
}

export function useDispatchTransactionRemediationDigestMutation(filtersToInvalidate?: {
  workspace?: string;
  generated_for?: string;
  status?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (digestId: string) => {
      const response = await apiClient.post(`/gst-transaction-remediation-digests/${digestId}/dispatch/`, {});
      return unwrapApiData<TransactionRemediationDigestRecord>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.remediationDigests(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.closeManager({ workspace: filtersToInvalidate?.workspace }) });
    },
  });
}

export function useImportTemplatesQuery(filters: ImportTemplateFilters) {
  return useQuery({
    queryKey: queryKeys.importTemplates.list(filters),
    enabled: Boolean(filters.workspace),
    queryFn: async () => {
      const response = await apiClient.get("/import-templates/", { params: filters });
      return unwrapPaginatedData<ImportTemplateRecord>(response);
    },
  });
}

export function useUploadImportBatchMutation(filtersToInvalidate?: ImportBatchFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UploadImportBatchPayload) => {
      const formData = new FormData();
      formData.append("workspace", payload.workspace);
      formData.append("client", payload.client);
      if (payload.gstin) {
        formData.append("gstin", payload.gstin);
      }
      if (payload.import_template) {
        formData.append("import_template", payload.import_template);
      }
      formData.append("compliance_period", payload.compliance_period);
      formData.append("import_type", payload.import_type);
      formData.append("source_type", payload.source_type);
      formData.append("file", payload.file);

      const response = await apiClient.post("/imports/batches/", formData);
      return unwrapApiData<ImportBatchRecord>(response);
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.detail(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.list({ source_import_batch: batch.id }) });
    },
  });
}

export function useFetchGstr2BImportBatchMutation(filtersToInvalidate?: ImportBatchFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: FetchGSTR2BImportPayload) => {
      const response = await apiClient.post("/imports/batches/fetch-gstr2b/", {
        workspace: payload.workspace,
        client: payload.client,
        gstin: payload.gstin,
        compliance_period: payload.compliance_period,
        provider: payload.provider ?? "whitebooks",
      });
      return unwrapApiData<ImportBatchRecord>(response);
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.detail(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.list({ import_batch: batch.id }) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.list({ source_import_batch: batch.id }) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary({ workspace: batch.workspace ?? undefined, client: batch.client ?? undefined, gstin: batch.gstin ?? undefined, compliance_period: batch.compliance_period ?? undefined }) });
    },
  });
}

export function useCorrectImportRowMutation(filtersToInvalidate?: ImportBatchFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CorrectImportRowPayload) => {
      const response = await apiClient.post(`/imports/batches/${payload.batchId}/row-corrections/`, {
        row_number: payload.rowNumber,
        raw_row: payload.rawRow,
        exception_context: payload.exceptionContext,
      });
      return unwrapApiData<ImportBatchRecord>(response);
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.detail(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.errors(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.correctionPolicy(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.impactSummary(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.list({ source_import_batch: batch.id }) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.summary({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.reconciliation.runs({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.returns.list({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.returns.readiness({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          period: batch.compliance_period ?? undefined,
        }),
      });
    },
  });
}

export function useDiscardImportRowMutation(filtersToInvalidate?: ImportBatchFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: DiscardImportRowPayload) => {
      const response = await apiClient.post(`/imports/batches/${payload.batchId}/row-discards/`, {
        row_number: payload.rowNumber,
      });
      return unwrapApiData<ImportBatchRecord>(response);
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.detail(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.errors(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.correctionPolicy(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.impactSummary(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.list({ source_import_batch: batch.id }) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.summary({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.reconciliation.runs({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.returns.list({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.returns.readiness({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          period: batch.compliance_period ?? undefined,
        }),
      });
    },
  });
}

export function useDiscardImportBatchMutation(filtersToInvalidate?: ImportBatchFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: DiscardImportBatchPayload) => {
      const response = await apiClient.post(`/imports/batches/${payload.batchId}/discard/`, {
        confirm: true,
      });
      return unwrapApiData<ImportBatchRecord>(response);
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.detail(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.errors(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.correctionPolicy(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.impactSummary(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.list({ source_import_batch: batch.id }) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.summary({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.reconciliation.runs({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.returns.list({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.returns.readiness({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          period: batch.compliance_period ?? undefined,
        }),
      });
    },
  });
}

export function useReplaceImportBatchMutation(filtersToInvalidate?: ImportBatchFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ReplaceImportBatchPayload) => {
      const formData = new FormData();
      formData.append("file", payload.file);
      const response = await apiClient.post(`/imports/batches/${payload.batchId}/replace/`, formData);
      return unwrapApiData<ImportBatchRecord>(response);
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.detail(batch.id) });
      if (batch.supersedes_batch) {
        queryClient.invalidateQueries({ queryKey: queryKeys.imports.detail(batch.supersedes_batch) });
        queryClient.invalidateQueries({ queryKey: queryKeys.imports.errors(batch.supersedes_batch) });
        queryClient.invalidateQueries({ queryKey: queryKeys.imports.correctionPolicy(batch.supersedes_batch) });
        queryClient.invalidateQueries({ queryKey: queryKeys.imports.impactSummary(batch.supersedes_batch) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.list({ source_import_batch: batch.id }) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.summary({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.reconciliation.runs({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.returns.list({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.returns.readiness({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          period: batch.compliance_period ?? undefined,
        }),
      });
    },
  });
}

export function useReprocessImportBatchMutation(filtersToInvalidate?: ImportBatchFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ReprocessImportBatchPayload) => {
      const response = await apiClient.post(`/imports/batches/${payload.batchId}/reprocess/`, {
        confirm: true,
      });
      return unwrapApiData<ImportBatchRecord>(response);
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.detail(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.errors(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.correctionPolicy(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.impactSummary(batch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.list({ source_import_batch: batch.id }) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.summary({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.reconciliation.runs({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.returns.list({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          compliance_period: batch.compliance_period ?? undefined,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.returns.readiness({
          workspace: batch.workspace ?? undefined,
          client: batch.client ?? undefined,
          gstin: batch.gstin ?? undefined,
          period: batch.compliance_period ?? undefined,
        }),
      });
    },
  });
}

export function useCreateImportTemplateMutation(filtersToInvalidate?: ImportTemplateFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Omit<ImportTemplateRecord, "id" | "workspace_name" | "created_at" | "updated_at">) => {
      const response = await apiClient.post("/import-templates/", payload);
      return unwrapApiData<ImportTemplateRecord>(response);
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.importTemplates.list(filtersToInvalidate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.importTemplates.detail(template.id) });
    },
  });
}

export function useUpdateImportTemplateMutation(filtersToInvalidate?: ImportTemplateFilters, templateId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<ImportTemplateRecord>) => {
      const response = await apiClient.patch(`/import-templates/${templateId}/`, payload);
      return unwrapApiData<ImportTemplateRecord>(response);
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.importTemplates.list(filtersToInvalidate) });
      if (templateId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.importTemplates.detail(templateId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.importTemplates.detail(template.id) });
    },
  });
}

export function useDeleteImportTemplateMutation(filtersToInvalidate?: ImportTemplateFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      await apiClient.delete(`/import-templates/${templateId}/`);
      return templateId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.importTemplates.list(filtersToInvalidate) });
    },
  });
}
