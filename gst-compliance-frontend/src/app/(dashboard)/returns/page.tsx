"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileCheck, Loader2, RefreshCcw, Send, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ActionLabel } from "@/components/common/action-label";
import { AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from "@/components/common/app-modal";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApprovalsQuery, useCreateApprovalMutation } from "@/features/approvals";
import {
  useFilingAttemptsQuery,
  useEscalateFilingAlertsMutation,
  useFilingEventsQuery,
  useFilingsQuery,
  useProviderAuthSessionsQuery,
  useRequestProviderOTPMutation,
  useRequeueAfterReviewMutation,
  useResyncFilingMutation,
  useRetryFilingMutation,
  useStartFilingMutation,
  useVerifyProviderOTPMutation,
} from "@/features/filings";
import { useGstTransactionsQuery } from "@/features/imports";
import {
  useApproveReturnMutation,
  useMarkFiledMutation,
  usePrepareReturnMutation,
  useReturnReadinessQuery,
  useReturnQuery,
  useReturnsQuery,
} from "@/features/returns";
import { downloadFile } from "@/lib/api/download";
import { useReconciliationRunsQuery } from "@/features/reconciliation";
import { useSession } from "@/lib/query/session-provider";
import { getErrorMessage } from "@/lib/api/error-handler";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { ReturnFilingAttemptRecord, ReturnFilingRecord, ReturnPreparationRecord, WhiteBooksAuthSessionRecord, WhiteBooksProviderStage } from "@/types/api";

function formatMoney(value?: string | number | null) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "Pending";
  return format(new Date(value), "dd MMM yyyy, h:mm a");
}

function getStatusVariant(status: ReturnPreparationRecord["status"]) {
  if (status === "filed" || status === "approved") return "success" as const;
  if (status === "blocked_by_stale_reconciliation") return "danger" as const;
  if (status === "ready_for_review" || status === "validating") return "warning" as const;
  if (status === "failed") return "danger" as const;
  return "primary" as const;
}

function getFilingStatusVariant(status?: ReturnFilingRecord["status"]) {
  if (status === "filed" || status === "arn_received") return "success" as const;
  if (status === "submitted" || status === "queued_for_filing" || status === "approved" || status === "needs_retry") return "warning" as const;
  if (status === "failed" || status === "cancelled") return "danger" as const;
  return "primary" as const;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getRecordString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function getProviderStage(attempt?: ReturnFilingAttemptRecord | null): WhiteBooksProviderStage {
  const responseSummary = asRecord(attempt?.response_summary);
  const requestSummary = asRecord(attempt?.request_summary);
  return (
    getRecordString(responseSummary, "provider_stage") ||
    getRecordString(requestSummary, "provider_stage")
  ) as WhiteBooksProviderStage;
}

function getProviderStageLabel(stage?: WhiteBooksProviderStage, returnType?: ReturnPreparationRecord["return_type"] | ReturnFilingRecord["return_type"]) {
  if (stage === "draft_saved") {
    return returnType === "gstr3b" ? "draft saved, awaiting offset" : "draft saved";
  }
  if (stage === "offset_applied") return "offset applied";
  if (stage === "proceeded_to_file") return "proceeded to file";
  if (stage === "file_requested") return returnType === "gstr3b" ? "final filing requested, awaiting ARN" : "file requested";
  if (stage === "sandbox_submitted") return "sandbox submitted";
  if (stage === "submitted") return "submitted";
  return "not started";
}

function getProviderStageVariant(stage?: WhiteBooksProviderStage) {
  if (stage === "draft_saved" || stage === "offset_applied" || stage === "proceeded_to_file" || stage === "file_requested" || stage === "sandbox_submitted" || stage === "submitted") {
    return "warning" as const;
  }
  return "primary" as const;
}

function getProviderMessage(attempt?: ReturnFilingAttemptRecord | null) {
  const responseSummary = asRecord(attempt?.response_summary);
  const saveResponse = asRecord(responseSummary?.save_response);

  return (
    getRecordString(responseSummary, "message") ||
    getRecordString(saveResponse, "status_desc") ||
    getRecordString(saveResponse, "message") ||
    ""
  );
}

function getProviderResponseSummary(attempt?: ReturnFilingAttemptRecord | null) {
  return asRecord(attempt?.response_summary);
}

function getSavedProviderResponse(attempt?: ReturnFilingAttemptRecord | null) {
  const responseSummary = getProviderResponseSummary(attempt);
  return asRecord(responseSummary?.save_response);
}

function getOffsetProviderResponse(attempt?: ReturnFilingAttemptRecord | null) {
  const responseSummary = getProviderResponseSummary(attempt);
  return asRecord(responseSummary?.offset_response);
}

function getStatusProviderResponse(attempt?: ReturnFilingAttemptRecord | null) {
  const responseSummary = getProviderResponseSummary(attempt);
  return asRecord(responseSummary?.status_response);
}

function getTrackProviderResponse(attempt?: ReturnFilingAttemptRecord | null) {
  const responseSummary = getProviderResponseSummary(attempt);
  return asRecord(responseSummary?.track_response);
}

function getFailureSummary(attempt?: ReturnFilingAttemptRecord | null) {
  const responseSummary = getProviderResponseSummary(attempt);
  return asRecord(responseSummary?.failure_summary);
}

function getLinkedAuthSessionId(attempt?: ReturnFilingAttemptRecord | null) {
  const responseSummary = getProviderResponseSummary(attempt);
  return getRecordString(responseSummary, "auth_session_id");
}

function getProceedGuidance(attempt?: ReturnFilingAttemptRecord | null) {
  const responseSummary = getProviderResponseSummary(attempt);
  const failureSummary = getFailureSummary(attempt);
  const failedOperation = getRecordString(responseSummary, "failed_operation");
  const nextAction = getRecordString(responseSummary, "next_action");
  const retryable = responseSummary?.retryable === true || failureSummary?.retryable === true;

  if (failedOperation !== "proceed") {
    return null;
  }

  if (retryable || nextAction === "retry_filing") {
    return {
      title: "Proceed step can be retried",
      description:
        "WhiteBooks saved the draft, but the proceed-to-file step hit a temporary issue. Review the provider message below, then retry the filing when you are ready.",
      variant: "warning" as const,
    };
  }

  return {
    title: "Proceed step needs review before retry",
    description:
      "WhiteBooks saved the draft, but the proceed-to-file step was rejected. Review the provider message and response evidence before attempting another filing run.",
    variant: "danger" as const,
  };
}

function getRecommendedAction(
  filing?: ReturnFilingRecord | null,
  attempt?: ReturnFilingAttemptRecord | null,
  providerStage?: WhiteBooksProviderStage,
) {
  const responseSummary = getProviderResponseSummary(attempt);
  const nextAction = getRecordString(responseSummary, "next_action");
  const retryable = responseSummary?.retryable === true || getFailureSummary(attempt)?.retryable === true;

  if (filing?.status === "needs_retry" || retryable || nextAction === "retry_filing") {
    return {
      title: "Recommended next action",
      description: "Retry this filing attempt after reviewing the latest provider failure details. The draft-save evidence has been preserved.",
      tone: "warning" as const,
    };
  }

  if (providerStage === "proceeded_to_file" || nextAction === "await_final_filing_automation") {
    return {
      title: "Recommended next action",
      description: "Do not retry this filing yet. The draft and proceed steps succeeded, so the next safe step is final filing automation or a controlled manual completion path.",
      tone: "primary" as const,
    };
  }

  if (providerStage === "offset_applied" || nextAction === "await_gstr3b_final_filing_automation") {
    return {
      title: "Recommended next action",
      description: "Do not retry this filing yet. The GSTR-3B draft save and liability offset completed, so the next safe step is final filing automation or a controlled manual completion path.",
      tone: "primary" as const,
    };
  }

  if (providerStage === "file_requested" || nextAction === "resync_for_arn_or_status") {
    return {
      title: "Recommended next action",
      description:
        filing?.return_type === "gstr3b"
          ? "Treat this GSTR-3B as confirmation-pending. Resync for ARN or terminal provider status before telling operations the return is filed."
          : "Treat this filing as confirmation-pending. Resync for ARN or terminal status before telling operations that the return is filed.",
      tone: "primary" as const,
    };
  }

  if (providerStage === "draft_saved" || nextAction === "review_draft_save_or_continue_manually") {
    if (filing?.return_type === "gstr3b" || nextAction === "await_offset_automation") {
      return {
        title: "Recommended next action",
        description: "Treat this as a saved GSTR-3B draft only. The provider save completed, but liability offset and final filing still need to happen before this can move forward.",
        tone: "primary" as const,
      };
    }
    return {
      title: "Recommended next action",
      description: "Treat this as a saved draft only. Review the linked auth session and provider evidence before continuing with proceed or any manual portal action.",
      tone: "primary" as const,
    };
  }

  if (filing?.status === "failed") {
    return {
      title: "Recommended next action",
      description: "Review the failure details and provider evidence before retrying. Only retry if the issue is clearly operational rather than a provider rejection.",
      tone: "danger" as const,
    };
  }

  return null;
}

function getFilingEventLabel(eventType: string) {
  if (eventType === "filing.draft_save_requested") return "draft save requested";
  if (eventType === "filing.draft_saved") return "draft saved to WhiteBooks";
  if (eventType === "filing.draft_save_failed") return "draft save failed";
  if (eventType === "filing.offset_requested") return "offset requested";
  if (eventType === "filing.offset_applied") return "offset applied";
  if (eventType === "filing.offset_failed") return "offset failed";
  if (eventType === "filing.proceed_requested") return "proceed to file requested";
  if (eventType === "filing.proceeded_to_file") return "proceeded to file";
  if (eventType === "filing.proceed_failed") return "proceed to file failed";
  if (eventType === "filing.file_requested") return "final file requested";
  if (eventType === "filing.file_submitted") return "final file submitted";
  if (eventType === "filing.file_failed") return "final file failed";
  if (eventType === "filing.retry_requested") return "retry requested";
  if (eventType === "filing.recovery_requeued") return "requeued after review";
  if (eventType === "filing.status_synced") return "status synced";
  return eventType.replace(/\./g, " ");
}

function getWhiteBooksAuthStatusVariant(status?: WhiteBooksAuthSessionRecord["status"]) {
  if (status === "session_active") return "success" as const;
  if (status === "otp_requested" || status === "auth_token_received") return "warning" as const;
  if (status === "failed") return "danger" as const;
  return "primary" as const;
}

function getPrimaryTaxableValue(preparedReturn?: ReturnPreparationRecord) {
  const summary = preparedReturn?.summary_snapshot ?? {};
  const outwardSupplies = (summary.outward_supplies as Record<string, unknown> | undefined) ?? {};
  return String(
    outwardSupplies.total_taxable_value ??
      outwardSupplies.outward_taxable_value ??
      "0.00",
  );
}

function getPrimaryTaxAmount(preparedReturn?: ReturnPreparationRecord) {
  const summary = preparedReturn?.summary_snapshot ?? {};
  const outwardSupplies = (summary.outward_supplies as Record<string, unknown> | undefined) ?? {};
  return String(
    outwardSupplies.total_tax_amount ??
      outwardSupplies.outward_tax_liability ??
      "0.00",
  );
}

function getItcAmount(preparedReturn?: ReturnPreparationRecord) {
  const summary = preparedReturn?.summary_snapshot ?? {};
  const itcSummary = (summary.itc_summary as Record<string, unknown> | undefined) ?? {};
  return String(itcSummary.eligible_itc ?? "0.00");
}

function getNetPayable(preparedReturn?: ReturnPreparationRecord) {
  const summary = preparedReturn?.summary_snapshot ?? {};
  const itcSummary = (summary.itc_summary as Record<string, unknown> | undefined) ?? {};
  return String(itcSummary.net_tax_payable ?? "0.00");
}

function getReadinessLabel(status?: "ready" | "ready_with_warnings" | "blocked") {
  if (status === "ready") return "Ready";
  if (status === "ready_with_warnings") return "Ready with warnings";
  if (status === "blocked") return "Blocked";
  return "Pending";
}

function getReadinessVariant(status?: "ready" | "ready_with_warnings" | "blocked") {
  if (status === "ready") return "success" as const;
  if (status === "ready_with_warnings") return "warning" as const;
  if (status === "blocked") return "danger" as const;
  return "primary" as const;
}

function buildIssueActionHref(
  actionTarget?: string | null,
  issueCode?: string,
  transactionIds?: string[],
  suggestedFix?: {
    mode: "bulk_correct" | "row_review";
    fields?: string[];
  } | null,
) {
  if (!actionTarget) {
    return "#";
  }
  if (actionTarget !== "/reports" || !transactionIds || transactionIds.length === 0) {
    return actionTarget;
  }
  const params = new URLSearchParams();
  params.set("focus", issueCode ?? "readiness_issue");
  params.set("ids", transactionIds.join(","));
  if (suggestedFix?.mode) {
    params.set("suggest_mode", suggestedFix.mode);
  }
  if (suggestedFix?.fields?.length) {
    params.set("suggest_fields", suggestedFix.fields.join(","));
  }
  return `${actionTarget}?${params.toString()}`;
}

export default function ReturnsPage() {
  const searchParams = useSearchParams();
  const { user } = useSession();
  const {
    selectedWorkspace,
    selectedWorkspaceId,
    selectedClient,
    selectedClientId,
    selectedGstin,
    selectedGstinId,
    selectedPeriod,
    selectedPeriodId,
  } = useWorkspaceContext();
  const [manualSelectedReturnId, setManualSelectedReturnId] = useState<string | null>(null);
  const [dismissedQueryReturnId, setDismissedQueryReturnId] = useState<string | null>(null);
  const [isMarkFiledOpen, setIsMarkFiledOpen] = useState(false);
  const [arn, setArn] = useState("");
  const [whiteBooksEmail, setWhiteBooksEmail] = useState("");
  const [whiteBooksOtp, setWhiteBooksOtp] = useState("");
  const [whiteBooksTxn, setWhiteBooksTxn] = useState("");
  const selectedReturnFromQuery = searchParams.get("returnId");
  const selectedFocusFromQuery = searchParams.get("focus");
  const filingLifecycleRef = useRef<HTMLDivElement | null>(null);

  const filters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      period: selectedPeriodId ?? undefined,
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId],
  );
  const reconciliationFilters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      compliance_period: selectedPeriodId ?? undefined,
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId],
  );

  const returnsQuery = useReturnsQuery(filters);
  const querySelectedReturnId =
    selectedReturnFromQuery &&
    selectedReturnFromQuery !== dismissedQueryReturnId &&
    (returnsQuery.data?.items ?? []).some((item) => item.id === selectedReturnFromQuery)
      ? selectedReturnFromQuery
      : null;
  const selectedReturnId = manualSelectedReturnId ?? querySelectedReturnId;
  const returnQuery = useReturnQuery(selectedReturnId ?? undefined);
  const readinessQuery = useReturnReadinessQuery(filters);
  const reconciliationRunsQuery = useReconciliationRunsQuery(reconciliationFilters);
  const salesTransactionsQuery = useGstTransactionsQuery({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    transaction_type: "sales",
  });
  const purchaseTransactionsQuery = useGstTransactionsQuery({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    transaction_type: "purchase",
  });
  const approvalsQuery = useApprovalsQuery({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    period: selectedPeriodId ?? undefined,
    entity_type: "return_preparation",
  });
  const filingsQuery = useFilingsQuery({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
  });
  const whiteBooksAuthSessionsQuery = useProviderAuthSessionsQuery({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    provider: "whitebooks",
  });
  const prepareReturnMutation = usePrepareReturnMutation(filters);
  const approveReturnMutation = useApproveReturnMutation(filters);
  const markFiledMutation = useMarkFiledMutation(filters);
  const startFilingMutation = useStartFilingMutation({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
  });
  const retryFilingMutation = useRetryFilingMutation({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
  });
  const resyncFilingMutation = useResyncFilingMutation({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
  });
  const requeueAfterReviewMutation = useRequeueAfterReviewMutation({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
  });
  const escalateFilingAlertsMutation = useEscalateFilingAlertsMutation({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
  });
  const requestWhiteBooksOTPMutation = useRequestProviderOTPMutation({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    provider: "whitebooks",
  });
  const verifyWhiteBooksOTPMutation = useVerifyProviderOTPMutation({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    provider: "whitebooks",
  });
  const createApprovalMutation = useCreateApprovalMutation({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    period: selectedPeriodId ?? undefined,
    entity_type: "return_preparation",
  });

  const activeReturn = selectedReturnId ? returnQuery.data : returnsQuery.data?.items[0];
  const activeFiling = useMemo(
    () => (filingsQuery.data?.items ?? []).find((item) => item.prepared_return === activeReturn?.id) ?? null,
    [filingsQuery.data?.items, activeReturn?.id],
  );
  const activeWhiteBooksAuthSession = useMemo(
    () => (whiteBooksAuthSessionsQuery.data?.items ?? [])[0] ?? null,
    [whiteBooksAuthSessionsQuery.data?.items],
  );
  const filingAttemptsQuery = useFilingAttemptsQuery(activeFiling?.id);
  const filingEventsQuery = useFilingEventsQuery(activeFiling?.id);
  const gstr1Return = returnsQuery.data?.items.find((item) => item.return_type === "gstr1");
  const gstr3bReturn = returnsQuery.data?.items.find((item) => item.return_type === "gstr3b");
  const latestRun = reconciliationRunsQuery.data?.items[0];
  const activeApproval = (approvalsQuery.data?.items ?? []).find((item) => item.entity_id === activeReturn?.id) ?? null;
  const unresolvedMismatchCount =
    (latestRun?.partial_match_count ?? 0) +
    (latestRun?.mismatch_count ?? 0) +
    (latestRun?.missing_in_books_count ?? 0) +
    (latestRun?.missing_in_portal_count ?? 0) +
    (latestRun?.duplicate_count ?? 0);
  const isReconciliationStale = Boolean(latestRun?.is_stale);
  const staleReconciliationReason = latestRun?.invalidation_reason
    ? latestRun.invalidation_reason.replace(/_/g, " ")
    : "Source imports changed after the last reconciliation run.";
  const salesTransactionCount = salesTransactionsQuery.data?.count ?? 0;
  const purchaseTransactionCount = purchaseTransactionsQuery.data?.count ?? 0;
  const readiness = readinessQuery.data;
  const activeFilingProviderStage = getProviderStage(activeFiling?.latest_attempt);
  const latestProviderMessage = getProviderMessage(activeFiling?.latest_attempt);
  const linkedAuthSessionId = getLinkedAuthSessionId(activeFiling?.latest_attempt);
  const latestSavedProviderResponse = getSavedProviderResponse(activeFiling?.latest_attempt);
  const latestOffsetProviderResponse = getOffsetProviderResponse(activeFiling?.latest_attempt);
  const latestStatusProviderResponse = getStatusProviderResponse(activeFiling?.latest_attempt);
  const latestTrackProviderResponse = getTrackProviderResponse(activeFiling?.latest_attempt);
  const latestFailureSummary = getFailureSummary(activeFiling?.latest_attempt);
  const providerEvidenceSummary = activeFiling?.provider_evidence_summary;
  const proceedGuidance = getProceedGuidance(activeFiling?.latest_attempt);
  const recommendedAction = getRecommendedAction(activeFiling, activeFiling?.latest_attempt, activeFilingProviderStage);
  const supportActionsSummary = activeFiling?.support_actions_summary;
  const supportStatusSummary = activeFiling?.support_status_summary;
  const rolloutPolicySummary = activeFiling?.rollout_policy_summary;
  const interventionEvents = activeFiling?.intervention_history ?? [];
  const retrySupportAction = supportActionsSummary?.actions.find((action) => action.action === "retry");
  const resyncSupportAction = supportActionsSummary?.actions.find((action) => action.action === "resync");
  const requeueSupportAction = supportActionsSummary?.actions.find((action) => action.action === "requeue_after_review");
  const isCurrentAuthSessionLinked =
    Boolean(linkedAuthSessionId) && activeWhiteBooksAuthSession?.id === linkedAuthSessionId;

  const isPeriodLocked = Boolean(selectedPeriod?.is_locked);
  const canPrepare = Boolean(selectedWorkspaceId && selectedClientId && selectedGstinId && selectedPeriodId && !isPeriodLocked);
  const exportReturnType = activeReturn?.return_type ?? (gstr1Return ? "gstr1" : gstr3bReturn ? "gstr3b" : null);
  const activeReadiness =
    exportReturnType === "gstr1" ? readiness?.gstr1 : exportReturnType === "gstr3b" ? readiness?.gstr3b : null;
  const isReturnFlowBlockedByStaleSource = Boolean(activeReturn?.is_blocked_by_stale_reconciliation || isReconciliationStale);

  useEffect(() => {
    if (
      selectedFocusFromQuery !== "filing_lifecycle" ||
      !selectedReturnId ||
      selectedReturnId !== selectedReturnFromQuery ||
      !activeReturn
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      filingLifecycleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [activeReturn, selectedFocusFromQuery, selectedReturnFromQuery, selectedReturnId]);

  const handlePrepare = async (returnType: "gstr1" | "gstr3b") => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
      toast.error("Select workspace, client, GSTIN, and compliance period before preparing a return.");
      return;
    }
    if (isPeriodLocked) {
      toast.error("This compliance period is locked. Unlock it before preparing returns.");
      return;
    }
    const targetReadiness = returnType === "gstr1" ? readiness?.gstr1 : readiness?.gstr3b;
    if (targetReadiness?.status === "blocked") {
      toast.error(targetReadiness.issues[0]?.detail ?? `Resolve ${returnType.toUpperCase()} blockers before preparation.`);
      return;
    }

    try {
      const preparedReturn = await prepareReturnMutation.mutateAsync({
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        gstin: selectedGstinId,
        compliance_period: selectedPeriodId,
        return_type: returnType,
      });
      setManualSelectedReturnId(preparedReturn.id);
      setDismissedQueryReturnId(null);
      toast.success(`${returnType.toUpperCase()} draft prepared.`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleRequestApproval = async () => {
    if (!activeReturn || !selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId || !user) {
      toast.error("A reviewer and active return context are required before creating an approval request.");
      return;
    }
    try {
      await createApprovalMutation.mutateAsync({
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        gstin: selectedGstinId,
        compliance_period: selectedPeriodId,
        entity_type: "return_preparation",
        entity_id: activeReturn.id,
        requested_to: user.id,
        status: "pending",
        comments: "Please review this return draft.",
      });
      toast.success("Approval request created.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleApprove = async (returnId: string) => {
    try {
      await approveReturnMutation.mutateAsync(returnId);
      toast.success("Return approved.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleMarkFiled = async () => {
    if (!activeReturn) return;
    try {
      await markFiledMutation.mutateAsync({ returnId: activeReturn.id, arn });
      toast.success("Return marked filed.");
      setIsMarkFiledOpen(false);
      setArn("");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleStartPortalFiling = async () => {
    if (!activeReturn || !selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
      toast.error("Select a full return context before starting provider filing.");
      return;
    }
    const linkedApproval = (approvalsQuery.data?.items ?? []).find(
      (item) => item.entity_id === activeReturn.id && item.status === "approved",
    );
    try {
      await startFilingMutation.mutateAsync({
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        gstin: selectedGstinId,
        compliance_period: selectedPeriodId,
        prepared_return: activeReturn.id,
        return_type: activeReturn.return_type,
        provider: "whitebooks",
        approval_request: linkedApproval?.id,
        confirmation_note: "Started from returns workspace.",
      });
      toast.success("Provider filing started.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleRetryFiling = async () => {
    if (!activeFiling) return;
    try {
      await retryFilingMutation.mutateAsync({
        filingId: activeFiling.id,
        comments: "Retry requested from returns workspace.",
      });
      toast.success("Filing retry started.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleResyncFiling = async () => {
    if (!activeFiling) return;
    try {
      await resyncFilingMutation.mutateAsync(activeFiling.id);
      toast.success("Filing status resynced.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleRequeueAfterReview = async () => {
    if (!activeFiling) return;
    try {
      await requeueAfterReviewMutation.mutateAsync({
        filingId: activeFiling.id,
        comments: "Requeued after support review from returns workspace.",
      });
      toast.success("Filing requeued after review.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleEscalateAlerts = async () => {
    if (!activeFiling) return;
    try {
      await escalateFilingAlertsMutation.mutateAsync({
        filingId: activeFiling.id,
        comments: "Escalated from returns workspace for routed support follow-up.",
      });
      toast.success("Operational alerts escalated.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleRequestWhiteBooksOtp = async () => {
    if (!selectedWorkspaceId || !selectedClientId) {
      toast.error("Select workspace and client before starting WhiteBooks authentication.");
      return;
    }
    try {
      const session = await requestWhiteBooksOTPMutation.mutateAsync({
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        gstin: selectedGstinId ?? undefined,
        provider: "whitebooks",
        email: whiteBooksEmail.trim() || user?.email || undefined,
      });
      setWhiteBooksTxn(session.txn || "");
      toast.success("WhiteBooks OTP requested.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleVerifyWhiteBooksOtp = async () => {
    if (!activeWhiteBooksAuthSession) {
      toast.error("Request a WhiteBooks OTP first.");
      return;
    }
    if (!whiteBooksOtp.trim()) {
      toast.error("Enter the OTP received from WhiteBooks.");
      return;
    }
    try {
      const session = await verifyWhiteBooksOTPMutation.mutateAsync({
        sessionId: activeWhiteBooksAuthSession.id,
        otp: whiteBooksOtp.trim(),
        txn: whiteBooksTxn.trim() || activeWhiteBooksAuthSession.txn || undefined,
      });
      setWhiteBooksTxn(session.txn || "");
      toast.success(
        session.response_contract_confirmed
          ? "WhiteBooks session activated."
          : "WhiteBooks auth token captured. Session mapping is still pending contract confirmation.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const summary = (activeReturn?.summary_snapshot ?? {}) as Record<string, unknown>;
  const outwardSupplies = (summary.outward_supplies as Record<string, unknown> | undefined) ?? {};
  const itcSummary = (summary.itc_summary as Record<string, unknown> | undefined) ?? {};
  const reconciliationSummary = (summary.reconciliation as Record<string, unknown> | undefined) ?? {};

  const handleExport = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedPeriodId) {
      toast.error("Select workspace, client, and period before exporting return summaries.");
      return;
    }
    if (activeReadiness?.status === "blocked") {
      toast.error(activeReadiness.issues[0]?.detail ?? "Resolve filing blockers before exporting this return workbook.");
      return;
    }
    if (activeReadiness?.status === "ready_with_warnings") {
      toast.warning("Exporting with warnings. Review readiness issues before sharing the workbook.");
    }
    try {
      const exportParams: Record<string, string> = {
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        compliance_period: selectedPeriodId,
      };
      if (selectedGstinId) {
        exportParams.gstin = selectedGstinId;
      }
      let filename = "return-summary.xlsx";
      let successMessage = "Return summary export downloaded.";
      const exportReturnType = activeReturn?.return_type ?? (gstr1Return ? "gstr1" : gstr3bReturn ? "gstr3b" : null);
      if (exportReturnType === "gstr1") {
        exportParams.return_type = "gstr1";
        exportParams.export_mode = "full_gstr1";
        filename = `gstr1-${selectedPeriod?.period ?? "export"}.xlsx`;
        successMessage = "Full GSTR-1 workbook downloaded.";
      } else if (exportReturnType === "gstr3b") {
        exportParams.return_type = "gstr3b";
        exportParams.export_mode = "full_gstr3b";
        filename = `gstr3b-${selectedPeriod?.period ?? "export"}.xlsx`;
        successMessage = "Full GSTR-3B workbook downloaded.";
      }
      await downloadFile("/exports/return-summary/", exportParams, filename);
      toast.success(successMessage);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns"
        description="Prepare draft GSTR-1 and GSTR-3B summaries from imported transactions and reconciliation outcomes before approval and manual filing."
        actions={[{ label: activeReturn?.return_type === "gstr3b" ? "Export GSTR-3B XLSX" : activeReturn?.return_type === "gstr1" || gstr1Return ? "Export GSTR-1 XLSX" : gstr3bReturn ? "Export GSTR-3B XLSX" : "Export XLSX", onClick: handleExport, disabled: !selectedWorkspaceId || !selectedClientId || !selectedPeriodId || activeReadiness?.status === "blocked" }]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel-card-hero overflow-hidden px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100">Return preparation desk</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                {selectedClient?.legal_name ?? "Choose a client"}{selectedPeriod ? ` for ${selectedPeriod.period}` : ""}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-indigo-100/95">
                Move from prepared books to approval-ready returns, then into controlled filing with provider evidence and readiness checks intact.
              </p>
            </div>
            <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Current filing focus</p>
              <p className="mt-2 text-lg font-semibold">
                {activeReturn ? activeReturn.return_type.toUpperCase() : "Select a draft"}
              </p>
              <p className="mt-2 text-sm text-indigo-100/90">
                {activeReadiness ? `${getReadinessLabel(activeReadiness.status)} for export and workflow actions.` : "Prepare a return to activate filing controls."}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Sales coverage</p>
              <p className="mt-2 text-lg font-semibold">{salesTransactionCount}</p>
              <p className="mt-1 text-sm text-indigo-100/90">Transactions available for GSTR-1 preparation.</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Purchase coverage</p>
              <p className="mt-2 text-lg font-semibold">{purchaseTransactionCount}</p>
              <p className="mt-1 text-sm text-indigo-100/90">Transactions available for 3B and ITC summary support.</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Mismatch exposure</p>
              <p className="mt-2 text-lg font-semibold">{unresolvedMismatchCount}</p>
              <p className="mt-1 text-sm text-indigo-100/90">Unresolved reconciliation items still affecting confidence.</p>
            </div>
          </div>
        </div>

        <SectionCard
          title="Return workflow focus"
          description="Use this page to validate readiness before approvals and provider filing begin."
          variant="soft"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <div className="metric-icon-wrap bg-indigo-50 text-indigo-600 ring-indigo-100">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Prepare only when the context is clean</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Workspace, GSTIN, period, and transaction coverage should all be present before drafting returns.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <div className="metric-icon-wrap bg-amber-50 text-amber-600 ring-amber-100">
                <FileCheck className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Treat readiness as the release gate</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Warnings can still export, but blockers should be cleared before sharing or filing.</p>
              </div>
            </div>
            {unresolvedMismatchCount > 0 ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <p className="text-sm leading-6 text-amber-700">
                  There are still {unresolvedMismatchCount} unresolved reconciliation items. Final return decisions should be made with that exposure in mind.
                </p>
              </div>
            ) : null}
            {isReconciliationStale ? (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-4">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-rose-900">Reconciliation is no longer current</p>
                  <p className="mt-1 text-sm leading-6 text-rose-700">
                    Source imports were changed after the last reconciliation run. Re-run reconciliation before approving, filing, or sharing this return output.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Current return context"
        description="Return preparation runs against the active workspace, client, GSTIN, and compliance period."
        variant="soft"
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => handlePrepare("gstr1")} disabled={!canPrepare || prepareReturnMutation.isPending}>
              {prepareReturnMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Prepare GSTR-1"}
            </Button>
            <Button size="sm" onClick={() => handlePrepare("gstr3b")} disabled={!canPrepare || prepareReturnMutation.isPending}>
              {prepareReturnMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Prepare GSTR-3B"}
            </Button>
          </div>
        }
      >
        {selectedPeriodId && salesTransactionCount === 0 && purchaseTransactionCount > 0 ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Purchase transactions exist in this period, but no sales transactions are available for GSTR-1 yet.
            This usually means the file was uploaded under the wrong import type. Re-upload the sales register from
            Imports with <span className="font-semibold">Import type = Sales</span>.
          </div>
        ) : null}
        <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
          <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Workspace</p><p className="mt-1 font-semibold text-slate-900">{selectedWorkspace?.name ?? "Not selected"}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Client</p><p className="mt-1 font-semibold text-slate-900">{selectedClient?.legal_name ?? "Not selected"}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">GSTIN</p><p className="mt-1 font-semibold text-slate-900">{selectedGstin?.gstin ?? "Not selected"}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Period</p><p className="mt-1 font-semibold text-slate-900">{selectedPeriod?.period ?? "Not selected"}</p></div>
        </div>
        {!canPrepare ? (
          <div className="mt-4">
            <EmptyState
              title="Select the working context first"
              description="Use the topbar selectors to choose workspace, client, GSTIN, and compliance period before preparing a return."
            />
          </div>
        ) : isPeriodLocked ? (
          <div className="mt-4">
            <ErrorState
              title="This period is locked"
              description="Return preparation is disabled for locked compliance periods. Unlock the period first if changes are still required."
            />
          </div>
        ) : unresolvedMismatchCount > 0 ? (
          <div className="mt-4">
            <ErrorState
              title="Unresolved reconciliation items detected"
              description={`There are ${unresolvedMismatchCount} unresolved reconciliation items in the latest 2B run. Review them before finalizing GSTR-3B.`}
            />
          </div>
        ) : isReconciliationStale ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-rose-950">Returns blocked by stale reconciliation</p>
                <p className="mt-1 leading-6">
                  {staleReconciliationReason} Re-run reconciliation first, then refresh the return draft before moving into approval or filing.
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="border-rose-200 bg-white text-rose-900 hover:bg-rose-100">
                <Link href="/reconciliation">Open reconciliation</Link>
              </Button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Return readiness"
        description="Validate filing completeness before exporting or sending returns for approval."
        variant="soft"
      >
        {!selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId ? (
          <EmptyState title="Readiness checks need a full context" description="Select workspace, client, GSTIN, and period to evaluate GSTR-1 and GSTR-3B readiness." />
        ) : readinessQuery.isLoading ? (
          <LoadingState message="Evaluating filing readiness..." />
        ) : readinessQuery.isError ? (
          <ErrorState title="We couldn’t evaluate readiness" description={getErrorMessage(readinessQuery.error)} />
        ) : readiness ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {[readiness.gstr1, readiness.gstr3b].map((item) => (
                <div key={item.return_type} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">{item.return_type.toUpperCase()}</p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-900">{getReadinessLabel(item.status)}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.error_count} blocker(s) • {item.warning_count} warning(s)
                      </p>
                    </div>
                    <StatusBadge label={getReadinessLabel(item.status)} variant={getReadinessVariant(item.status)} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Prepare</p>
                      <p className="mt-2 font-semibold text-slate-900">{item.can_prepare ? "Allowed" : "Blocked"}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Export</p>
                      <p className="mt-2 font-semibold text-slate-900">{item.can_export ? "Allowed" : "Blocked"}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Prepared draft</p>
                      <p className="mt-2 font-semibold text-slate-900">{item.prepared_return?.status?.replace(/_/g, " ") ?? "Not prepared"}</p>
                    </div>
                  </div>
                  {item.issues.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {item.issues.slice(0, 4).map((issue) => (
                        <div key={`${item.return_type}-${issue.code}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              {issue.severity === "error" ? (
                                <ShieldAlert className="mt-0.5 size-4 text-rose-500" />
                              ) : (
                                <AlertTriangle className="mt-0.5 size-4 text-amber-500" />
                              )}
                              <div>
                                <p className="font-medium text-slate-900">{issue.title}</p>
                                <p className="mt-1 text-sm text-slate-600">{issue.detail}</p>
                              </div>
                            </div>
                            <StatusBadge
                              label={issue.severity === "error" ? "Blocker" : "Warning"}
                              variant={issue.severity === "error" ? "danger" : "warning"}
                            />
                          </div>
                          {issue.action_label && issue.action_target ? (
                            <div className="mt-3">
                                <Link
                                href={buildIssueActionHref(issue.action_target, issue.code, issue.transaction_ids, issue.suggested_fix)}
                                className="inline-flex text-sm font-medium text-indigo-600 transition hover:text-indigo-500"
                              >
                                {issue.action_label}
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 size-4" />
                        <p>This return has no readiness blockers or warnings in the current validation layer.</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Overall filing signal</p>
              <p className="mt-1">
                {readiness.overall_status === "blocked"
                  ? "At least one return has hard blockers. Exports are disabled until the issues are resolved."
                  : readiness.overall_status === "ready_with_warnings"
                    ? "Returns can be prepared and exported, but warnings should be reviewed before sharing workbooks."
                    : "Both returns are currently ready for preparation and export in this period."}
              </p>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Return Type"
          value={activeReturn ? activeReturn.return_type.toUpperCase() : "—"}
          detail="Latest draft or approved return in the selected context."
          tone="primary"
          variant="soft"
          icon={FileCheck}
        />
        <StatCard
          label="Taxable Value"
          value={`Rs. ${formatMoney(getPrimaryTaxableValue(activeReturn))}`}
          detail="Primary taxable base from the prepared return summary."
          tone="success"
          variant="soft"
          icon={ShieldCheck}
        />
        <StatCard
          label="Tax Amount"
          value={`Rs. ${formatMoney(getPrimaryTaxAmount(activeReturn))}`}
          detail="Output tax for GSTR-1 or tax liability for GSTR-3B."
          tone="warning"
          variant="soft"
          icon={AlertTriangle}
        />
        <StatCard
          label="ITC / Net Payable"
          value={
            activeReturn?.return_type === "gstr3b"
              ? `Rs. ${formatMoney(getNetPayable(activeReturn))}`
              : `Rs. ${formatMoney(getItcAmount(activeReturn))}`
          }
          detail={
            activeReturn?.return_type === "gstr3b"
              ? "Net tax payable after eligible ITC."
              : "Reserved for ITC impact once a 3B draft is prepared."
          }
          tone="danger"
          variant="soft"
          icon={TriangleAlert}
        />
      </div>

      <SectionCard title="Return preparation history" description="Track prepared, approved, and filed return drafts for the selected period.">
        {!selectedClientId || !selectedPeriodId ? (
          <EmptyState title="Return history will appear here" description="Choose a client and period to load return preparations." />
        ) : returnsQuery.isLoading ? (
          <LoadingState message="Loading return preparations..." />
        ) : returnsQuery.isError ? (
          <ErrorState title="We couldn’t load returns" description={getErrorMessage(returnsQuery.error)} />
        ) : returnsQuery.data && returnsQuery.data.items.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Return</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Taxable Value</TableHead>
                  <TableHead>Tax Amount</TableHead>
                  <TableHead>Prepared</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead>Filed</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnsQuery.data.items.map((preparedReturn) => (
                  <TableRow key={preparedReturn.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{preparedReturn.return_type.toUpperCase()}</p>
                        <p className="text-xs text-slate-500">{preparedReturn.compliance_period_label}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={preparedReturn.status.replace(/_/g, " ")} variant={getStatusVariant(preparedReturn.status)} />
                      {preparedReturn.is_blocked_by_stale_reconciliation ? (
                        <p className="mt-2 text-xs text-slate-500">
                          {preparedReturn.blocking_reason ? preparedReturn.blocking_reason.replace(/_/g, " ") : "Source import changed after reconciliation."}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>Rs. {formatMoney(getPrimaryTaxableValue(preparedReturn))}</TableCell>
                    <TableCell>Rs. {formatMoney(getPrimaryTaxAmount(preparedReturn))}</TableCell>
                    <TableCell>{preparedReturn.prepared_by_name ?? "System"} / {formatDateTime(preparedReturn.updated_at)}</TableCell>
                    <TableCell>{preparedReturn.approved_by_name ?? "—"}</TableCell>
                    <TableCell>{preparedReturn.filed_by_name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setManualSelectedReturnId(preparedReturn.id);
                          setDismissedQueryReturnId(null);
                        }}
                      >
                        <ActionLabel kind="view" label="View" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            title="No prepared returns yet"
            description="Prepare GSTR-1 or GSTR-3B to create the first draft summary for this compliance period."
          />
        )}
      </SectionCard>

      <Dialog
        open={Boolean(selectedReturnId)}
        onOpenChange={(open) => {
          if (open) {
            return;
          }
          setManualSelectedReturnId(null);
          if (querySelectedReturnId) {
            setDismissedQueryReturnId(querySelectedReturnId);
          }
        }}
      >
        <AppModalContent size="xl">
          <AppModalHeader
            title="Return detail"
            description="Review the prepared summary, reconciliation impact, and filing status before approval or manual filing."
          />
          <AppModalBody>
          <div className="space-y-6">
            {returnQuery.isLoading ? (
              <LoadingState message="Loading return detail..." />
            ) : returnQuery.isError ? (
              <ErrorState description={getErrorMessage(returnQuery.error)} />
            ) : activeReturn ? (
              <>
                <SectionCard
                  title={`${activeReturn.return_type.toUpperCase()} filing status`}
                  description={`${activeReturn.client_name ?? "Client"} • ${activeReturn.gstin_value ?? ""} • ${activeReturn.compliance_period_label ?? ""}`}
                  action={<StatusBadge label={activeReturn.status.replace(/_/g, " ")} variant={getStatusVariant(activeReturn.status)} />}
                >
                  {isReturnFlowBlockedByStaleSource ? (
                    <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-rose-950">Return workflow paused until reconciliation is rerun</p>
                          <p className="mt-1 leading-6">
                            {activeReturn.blocking_reason ? activeReturn.blocking_reason.replace(/_/g, " ") : staleReconciliationReason} Re-run reconciliation, then refresh this return draft before approval or filing.
                          </p>
                        </div>
                        <Button asChild size="sm" variant="outline" className="border-rose-200 bg-white text-rose-900 hover:bg-rose-100">
                          <Link href="/reconciliation">Re-run context</Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2 text-sm">
                    <div className="space-y-3">
                      <div><span className="text-slate-500">Prepared by:</span> <span className="font-medium text-slate-900">{activeReturn.prepared_by_name ?? "System"}</span></div>
                      <div><span className="text-slate-500">Approved by:</span> <span className="font-medium text-slate-900">{activeReturn.approved_by_name ?? "Pending"}</span></div>
                      <div><span className="text-slate-500">Filed by:</span> <span className="font-medium text-slate-900">{activeReturn.filed_by_name ?? "Pending"}</span></div>
                    </div>
                    <div className="space-y-3">
                      <div><span className="text-slate-500">Prepared / Updated:</span> <span className="font-medium text-slate-900">{formatDateTime(activeReturn.updated_at)}</span></div>
                      <div><span className="text-slate-500">Filed at:</span> <span className="font-medium text-slate-900">{formatDateTime(activeReturn.filed_at)}</span></div>
                      <div><span className="text-slate-500">ARN:</span> <span className="font-medium text-slate-900">{activeReturn.arn || "Not captured"}</span></div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Outward supplies" description="Draft totals derived from normalized GST transactions.">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Object.entries(outwardSupplies).map(([key, value]) => (
                      <div key={key} className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-sm capitalize text-slate-500">{key.replace(/_/g, " ")}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          {key.includes("count") ? String(value) : `Rs. ${formatMoney(String(value))}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="ITC summary" description="Relevant for GSTR-3B drafts where reconciliation impacts input tax credit.">
                  {Object.keys(itcSummary).length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {Object.entries(itcSummary).map(([key, value]) => (
                        <div key={key} className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm capitalize text-slate-500">{key.replace(/_/g, " ")}</p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">
                            {key.includes("count") ? String(value) : `Rs. ${formatMoney(String(value))}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No ITC section for this return" description="GSTR-1 drafts do not include ITC computation." />
                  )}
                </SectionCard>

                <SectionCard title="Mismatch impact" description="Latest reconciliation context captured during GSTR-3B preparation.">
                  {Object.keys(reconciliationSummary).length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {Object.entries(reconciliationSummary).map(([key, value]) => (
                        <div key={key} className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm capitalize text-slate-500">{key.replace(/_/g, " ")}</p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">{String(value ?? "—")}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No reconciliation impact captured" description="Prepare GSTR-3B after running 2B reconciliation to populate this section." />
                  )}
                </SectionCard>

                <SectionCard
                  title="Actions"
                  description="Advance the draft through review, provider filing, and fallback manual filing."
                >
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={handleRequestApproval}
                      disabled={activeReturn.status !== "ready_for_review" || isReturnFlowBlockedByStaleSource || Boolean(activeApproval) || createApprovalMutation.isPending}
                    >
                      {createApprovalMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Request approval"}
                    </Button>
                    <Button
                      onClick={() => handleApprove(activeReturn.id)}
                      disabled={activeReturn.status !== "ready_for_review" || isReturnFlowBlockedByStaleSource || approveReturnMutation.isPending}
                    >
                      {approveReturnMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Approve return"}
                    </Button>
                    <Button
                      onClick={handleStartPortalFiling}
                      disabled={
                        activeReturn.status !== "approved" ||
                        isReturnFlowBlockedByStaleSource ||
                        startFilingMutation.isPending ||
                        activeFiling?.status === "submitted" ||
                        activeFiling?.status === "filed" ||
                        activeFiling?.status === "arn_received" ||
                        activeFiling?.status === "queued_for_filing"
                      }
                    >
                      {startFilingMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      <span className="ml-2">Start WhiteBooks filing</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleRetryFiling}
                      disabled={!activeFiling || !retrySupportAction?.allowed || retryFilingMutation.isPending}
                    >
                      {retryFilingMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                      <span className="ml-2">Retry filing</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleResyncFiling}
                      disabled={!activeFiling || !resyncSupportAction?.allowed || resyncFilingMutation.isPending}
                    >
                      {resyncFilingMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Resync status"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleRequeueAfterReview}
                      disabled={
                        !activeFiling ||
                        !requeueSupportAction?.allowed ||
                        requeueAfterReviewMutation.isPending
                      }
                    >
                      {requeueAfterReviewMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Requeue after review"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsMarkFiledOpen(true)}
                      disabled={activeReturn.status !== "approved" || isReturnFlowBlockedByStaleSource}
                    >
                      Mark filed
                    </Button>
                  </div>
                  {activeApproval ? (
                    <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                      <p className="font-medium text-slate-900">Approval status</p>
                      <p className="mt-1">
                        {activeApproval.status.replace(/_/g, " ")}{activeApproval.requested_to_name ? ` • Reviewer: ${activeApproval.requested_to_name}` : ""}
                      </p>
                    </div>
                  ) : null}
                </SectionCard>

                <div ref={filingLifecycleRef}>
                <SectionCard
                  title="Provider filing lifecycle"
                  description="Track WhiteBooks-backed filing attempts, live draft-save progress, and provider events without overstating filing completion."
                  action={
                    activeFiling ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={getProviderStageLabel(activeFilingProviderStage, activeFiling.return_type)}
                          variant={getProviderStageVariant(activeFilingProviderStage)}
                        />
                        <StatusBadge label={activeFiling.status.replace(/_/g, " ")} variant={getFilingStatusVariant(activeFiling.status)} />
                      </div>
                    ) : undefined
                  }
                >
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">WhiteBooks authentication</p>
                          <p className="mt-1 text-sm text-slate-600">
                            Request an OTP and capture the auth-token response here before switching filing from sandbox to live WhiteBooks transport.
                          </p>
                        </div>
                        {activeWhiteBooksAuthSession ? (
                          <StatusBadge
                            label={activeWhiteBooksAuthSession.status.replace(/_/g, " ")}
                            variant={getWhiteBooksAuthStatusVariant(activeWhiteBooksAuthSession.status)}
                          />
                        ) : (
                          <StatusBadge label="not started" variant="primary" />
                        )}
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="whitebooks-email">WhiteBooks email</Label>
                          <Input
                            id="whitebooks-email"
                            value={whiteBooksEmail}
                            onChange={(event) => setWhiteBooksEmail(event.target.value)}
                            placeholder={user?.email ?? "ops@example.com"}
                            className="h-11 bg-slate-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="whitebooks-txn">TXN</Label>
                          <Input
                            id="whitebooks-txn"
                            value={whiteBooksTxn}
                            onChange={(event) => setWhiteBooksTxn(event.target.value)}
                            placeholder={activeWhiteBooksAuthSession?.txn || "Auto-captured if WhiteBooks returns it"}
                            className="h-11 bg-slate-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="whitebooks-otp">OTP</Label>
                          <Input
                            id="whitebooks-otp"
                            value={whiteBooksOtp}
                            onChange={(event) => setWhiteBooksOtp(event.target.value)}
                            placeholder="Enter OTP"
                            className="h-11 bg-slate-50"
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={handleRequestWhiteBooksOtp}
                          disabled={!selectedWorkspaceId || !selectedClientId || requestWhiteBooksOTPMutation.isPending}
                        >
                          {requestWhiteBooksOTPMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Request OTP"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleVerifyWhiteBooksOtp}
                          disabled={!activeWhiteBooksAuthSession || verifyWhiteBooksOTPMutation.isPending}
                        >
                          {verifyWhiteBooksOTPMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Verify OTP"}
                        </Button>
                      </div>

                      {whiteBooksAuthSessionsQuery.isLoading ? (
                        <div className="mt-4">
                          <LoadingState message="Loading WhiteBooks auth status..." />
                        </div>
                      ) : whiteBooksAuthSessionsQuery.isError ? (
                        <div className="mt-4">
                          <ErrorState description={getErrorMessage(whiteBooksAuthSessionsQuery.error)} />
                        </div>
                      ) : activeWhiteBooksAuthSession ? (
                        <div className="mt-4 space-y-3">
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-sm text-slate-500">Email</p>
                              <p className="mt-2 font-semibold text-slate-900">{activeWhiteBooksAuthSession.email}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-sm text-slate-500">TXN</p>
                              <p className="mt-2 font-semibold text-slate-900">{activeWhiteBooksAuthSession.txn || "Pending"}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-sm text-slate-500">Last OTP request</p>
                              <p className="mt-2 font-semibold text-slate-900">{formatDateTime(activeWhiteBooksAuthSession.last_requested_at)}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-sm text-slate-500">Response contract</p>
                              <p className="mt-2 font-semibold text-slate-900">
                                {activeWhiteBooksAuthSession.response_contract_confirmed ? "Confirmed" : "Pending confirmation"}
                              </p>
                            </div>
                          </div>
                          {activeWhiteBooksAuthSession.error_summary && Object.keys(activeWhiteBooksAuthSession.error_summary).length > 0 ? (
                            <ErrorState
                              title="WhiteBooks authentication issue"
                              description={String(
                                activeWhiteBooksAuthSession.error_summary.message ??
                                  activeWhiteBooksAuthSession.error_summary.code ??
                                  "A WhiteBooks authentication issue was recorded.",
                              )}
                            />
                          ) : null}
                          {!activeWhiteBooksAuthSession.response_contract_confirmed ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                              Auth token capture is working, but live filing still stays disabled until we confirm the real WhiteBooks auth-token success payload.
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-4">
                          <EmptyState
                            title="No WhiteBooks auth session yet"
                            description="Request an OTP here to create the first WhiteBooks authentication session for this client context."
                          />
                        </div>
                      )}
                    </div>

                    {!activeFiling ? (
                      <EmptyState
                        title="No provider filing started"
                        description="Approve the return first, then start the WhiteBooks filing flow to create provider attempts and event history."
                      />
                    ) : (
                      <div className="space-y-5">
                      {activeFilingProviderStage === "draft_saved" ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          {activeFiling.return_type === "gstr3b" ? (
                            <>
                              <p className="font-medium text-amber-950">Saved to WhiteBooks draft, offset still pending</p>
                              <p className="mt-1">
                                This GSTR-3B has been pushed to WhiteBooks as a draft save only. Liability offset, final filing, and ARN capture are still separate steps.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium text-amber-950">Saved to WhiteBooks draft, not filed</p>
                              <p className="mt-1">
                                This return has been pushed to WhiteBooks as a draft save only. Final GST filing, ARN capture, and portal completion are still separate steps.
                              </p>
                            </>
                          )}
                        </div>
                      ) : null}

                      {activeFilingProviderStage === "proceeded_to_file" ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          <p className="font-medium text-amber-950">Proceeded in WhiteBooks, not filed</p>
                          <p className="mt-1">
                            WhiteBooks has accepted the draft and the proceed-to-file step, but final GST filing automation, ARN capture, and portal completion are still pending implementation.
                          </p>
                        </div>
                      ) : null}

                      {activeFilingProviderStage === "offset_applied" ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                          <p className="font-medium text-sky-950">Offset applied in WhiteBooks, final filing still pending</p>
                          <p className="mt-1">
                            WhiteBooks has accepted the GSTR-3B draft save and liability offset, but final filing and ARN capture are still pending.
                          </p>
                        </div>
                      ) : null}

                      {activeFilingProviderStage === "file_requested" ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                          {activeFiling.return_type === "gstr3b" ? (
                            <>
                              <p className="font-medium text-sky-950">GSTR-3B final filing requested, awaiting ARN or rejection status</p>
                              <p className="mt-1">
                                WhiteBooks accepted the GSTR-3B final filing request, but this return must still be treated as confirmation-pending until ARN or a terminal provider response is synced back.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium text-sky-950">Final filing requested, awaiting confirmation</p>
                              <p className="mt-1">
                                WhiteBooks accepted the final filing request, but this return should still be treated as confirmation-pending until ARN or terminal status is synced back.
                              </p>
                            </>
                          )}
                        </div>
                      ) : null}

                      {proceedGuidance ? (
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm ${
                            proceedGuidance.variant === "danger"
                              ? "border border-rose-200 bg-rose-50 text-rose-900"
                              : "border border-amber-200 bg-amber-50 text-amber-900"
                          }`}
                        >
                          <p className={proceedGuidance.variant === "danger" ? "font-medium text-rose-950" : "font-medium text-amber-950"}>
                            {proceedGuidance.title}
                          </p>
                          <p className="mt-1">{proceedGuidance.description}</p>
                        </div>
                      ) : null}

                      {recommendedAction ? (
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm ${
                            recommendedAction.tone === "danger"
                              ? "border border-rose-200 bg-rose-50 text-rose-900"
                              : recommendedAction.tone === "warning"
                                ? "border border-amber-200 bg-amber-50 text-amber-900"
                                : "border border-sky-200 bg-sky-50 text-sky-900"
                          }`}
                        >
                          <p
                            className={
                              recommendedAction.tone === "danger"
                                ? "font-medium text-rose-950"
                                : recommendedAction.tone === "warning"
                                  ? "font-medium text-amber-950"
                                  : "font-medium text-sky-950"
                            }
                          >
                            {recommendedAction.title}
                          </p>
                          <p className="mt-1">{recommendedAction.description}</p>
                        </div>
                      ) : null}

                      {supportActionsSummary?.summary_reason ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                          <p className="font-medium text-slate-900">Backend support action guidance</p>
                          <p className="mt-1">{supportActionsSummary.summary_reason}</p>
                          <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                            Recommended: {supportActionsSummary.recommended_action.replace(/_/g, " ")}
                          </p>
                          <div className="mt-3 grid gap-2 md:grid-cols-3">
                            {supportActionsSummary.actions.map((action) => (
                              <div key={action.action} className="rounded-2xl bg-slate-50 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-slate-900">{action.label}</p>
                                  <StatusBadge label={action.allowed ? "allowed" : "blocked"} variant={action.allowed ? "success" : "warning"} />
                                </div>
                                <p className="mt-2 text-xs text-slate-600">{action.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {supportStatusSummary ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900">Support status summary</p>
                              <p className="mt-1 text-sm text-slate-600">
                                Compact operator snapshot for current filing state, guidance, evidence, and intervention depth.
                              </p>
                            </div>
                            <StatusBadge
                              label={supportStatusSummary.recommended_action.replace(/_/g, " ")}
                              variant={
                                supportStatusSummary.has_provider_failure
                                  ? "danger"
                                  : supportStatusSummary.recommended_action === "resync_status" ||
                                      supportStatusSummary.recommended_action === "review_rollout_controls"
                                    ? "warning"
                                    : "primary"
                              }
                            />
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Filing status</p>
                              <p className="mt-2 font-medium text-slate-900">{supportStatusSummary.filing_status.replace(/_/g, " ")}</p>
                            </div>
                            <div className="rounded-2xl bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Provider stage</p>
                              <p className="mt-2 font-medium text-slate-900">
                                {getProviderStageLabel((supportStatusSummary.provider_stage || "") as WhiteBooksProviderStage, activeFiling.return_type)}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Interventions</p>
                              <p className="mt-2 font-medium text-slate-900">{supportStatusSummary.intervention_count}</p>
                            </div>
                            <div className="rounded-2xl bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Evidence flags</p>
                              <p className="mt-2 font-medium text-slate-900">
                                {[
                                  supportStatusSummary.evidence_flags.save_response ? "save" : null,
                                  supportStatusSummary.evidence_flags.offset_response ? "offset" : null,
                                  supportStatusSummary.evidence_flags.proceed_response ? "proceed" : null,
                                  supportStatusSummary.evidence_flags.file_response ? "file" : null,
                                  supportStatusSummary.evidence_flags.status_response ? "status" : null,
                                  supportStatusSummary.evidence_flags.track_response ? "track" : null,
                                ]
                                  .filter(Boolean)
                                  .join(", ") || "None"}
                              </p>
                            </div>
                          </div>
                          {supportStatusSummary.summary_reason ? (
                            <p className="mt-4 text-sm text-slate-700">{supportStatusSummary.summary_reason}</p>
                          ) : null}
                          {supportStatusSummary.latest_message ? (
                            <p className="mt-2 text-sm text-slate-600">{supportStatusSummary.latest_message}</p>
                          ) : null}
                        </div>
                      ) : null}

                      {rolloutPolicySummary ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900">Tenant rollout summary</p>
                              <p className="mt-1 text-sm text-slate-600">
                                Backend rollout controls for this workspace, GSTIN, provider, and return type context.
                              </p>
                            </div>
                            <StatusBadge
                              label={rolloutPolicySummary.live_submission_allowed ? "live enabled" : "live blocked"}
                              variant={rolloutPolicySummary.live_submission_allowed ? "success" : "warning"}
                            />
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Enforced</p>
                              <p className="mt-2 font-medium text-slate-900">{rolloutPolicySummary.enforced ? "Yes" : "No"}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Policy present</p>
                              <p className="mt-2 font-medium text-slate-900">{rolloutPolicySummary.policy_present ? "Yes" : "No"}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Submission</p>
                              <p className="mt-2 font-medium text-slate-900">{rolloutPolicySummary.live_submission_allowed ? "Allowed" : "Blocked"}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Status sync</p>
                              <p className="mt-2 font-medium text-slate-900">{rolloutPolicySummary.live_status_sync_allowed ? "Allowed" : "Blocked"}</p>
                            </div>
                          </div>
                          {rolloutPolicySummary.policy_scope.length ? (
                            <p className="mt-4 text-sm text-slate-700">
                              Scope: {rolloutPolicySummary.policy_scope.join(", ")}
                            </p>
                          ) : null}
                          {rolloutPolicySummary.submission_reason ? (
                            <p className="mt-2 text-sm text-slate-600">{rolloutPolicySummary.submission_reason}</p>
                          ) : null}
                          {rolloutPolicySummary.notes ? (
                            <p className="mt-2 text-sm text-slate-600">Notes: {rolloutPolicySummary.notes}</p>
                          ) : null}
                        </div>
                      ) : null}

                      {activeFiling?.operational_alerts?.length ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-amber-950">Operational alerts</p>
                              {activeFiling.alert_routing_summary?.recipients?.length ? (
                                <p className="mt-1 text-xs text-amber-800">
                                  {activeFiling.alert_routing_summary.routing_mode === "default" ? "Default routing policy" : "Explicit routing rules"}:
                                  {" "}
                                  {activeFiling.alert_routing_summary.recipients.map((recipient) => `${recipient.name} (${recipient.role})`).join(", ")}
                                </p>
                              ) : null}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                              onClick={handleEscalateAlerts}
                              disabled={escalateFilingAlertsMutation.isPending}
                            >
                              {escalateFilingAlertsMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Escalate alerts"}
                            </Button>
                          </div>
                          <div className="mt-3 space-y-3">
                            {activeFiling.operational_alerts.map((alert) => (
                              <div
                                key={`${alert.code}-${alert.title}`}
                                className={`rounded-2xl px-3 py-3 ${
                                  alert.severity === "critical" ? "border border-rose-200 bg-rose-50 text-rose-900" : "border border-amber-200 bg-white text-amber-900"
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-medium">{alert.title}</p>
                                  <StatusBadge label={alert.severity} variant={alert.severity === "critical" ? "danger" : "warning"} />
                                </div>
                                <p className="mt-2 text-sm">{alert.message}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {activeFiling?.incident_notes?.length ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                          <p className="font-medium text-slate-900">Recent incident notes</p>
                          <div className="mt-3 space-y-3">
                            {activeFiling.incident_notes.map((note) => (
                              <div key={note.id} className="rounded-2xl bg-slate-50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-medium text-slate-900">{note.title}</p>
                                  <div className="flex items-center gap-2">
                                    <StatusBadge label={note.severity} variant={note.severity === "critical" ? "danger" : note.severity === "warning" ? "warning" : "primary"} />
                                    <StatusBadge label={note.status} variant={note.status === "resolved" ? "success" : "warning"} />
                                  </div>
                                </div>
                                <p className="mt-2 text-sm text-slate-700">{note.note}</p>
                                {Array.isArray(note.metadata?.routed_recipients) && note.metadata.routed_recipients.length ? (
                                  <p className="mt-2 text-xs text-slate-500">
                                    Routed to: {note.metadata.routed_recipients.map((recipient) => {
                                      if (!recipient || typeof recipient !== "object") return "";
                                      const name = typeof recipient.name === "string" ? recipient.name : "recipient";
                                      const role = typeof recipient.role === "string" ? recipient.role : "";
                                      return role ? `${name} (${role})` : name;
                                    }).filter(Boolean).join(", ")}
                                  </p>
                                ) : null}
                                <p className="mt-2 text-xs text-slate-500">
                                  {formatDateTime(note.created_at)}
                                  {note.alert_code ? ` • ${note.alert_code}` : ""}
                                  {note.resolved_by_name ? ` • resolved by ${note.resolved_by_name}` : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {latestProviderMessage ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                          <p className="font-medium text-slate-900">Latest provider message</p>
                          <p className="mt-1">{latestProviderMessage}</p>
                        </div>
                      ) : null}

                      {latestFailureSummary ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                          <p className="font-medium text-rose-950">Latest provider failure</p>
                          <p className="mt-1">{getRecordString(latestFailureSummary, "message") || activeFiling?.latest_attempt?.failure_message || "Provider step failed."}</p>
                          <p className="mt-2 text-xs uppercase tracking-wide text-rose-700">
                            Code: {getRecordString(latestFailureSummary, "code") || activeFiling?.latest_attempt?.failure_code || "n/a"}
                            {" • "}
                            Retryable: {latestFailureSummary.retryable === true ? "yes" : "no"}
                          </p>
                        </div>
                      ) : null}

                      {linkedAuthSessionId ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900">Auth session used for this draft save</p>
                              <p className="mt-1">
                                Session <span className="font-mono text-xs">{linkedAuthSessionId}</span>
                                {activeWhiteBooksAuthSession?.email ? ` • ${activeWhiteBooksAuthSession.email}` : ""}
                              </p>
                            </div>
                            <StatusBadge
                              label={isCurrentAuthSessionLinked ? "current session" : "historical session"}
                              variant={isCurrentAuthSessionLinked ? "success" : "warning"}
                            />
                          </div>
                          {!isCurrentAuthSessionLinked ? (
                            <p className="mt-3 text-sm text-slate-600">
                              The latest WhiteBooks auth session in this workspace is different from the one used for the saved draft. Re-authenticate only if you intend to continue with a new provider session.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {providerEvidenceSummary ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900">Provider evidence snapshot</p>
                              <p className="mt-1 text-sm text-slate-600">
                                A compact backend summary of the latest provider evidence stored on this filing attempt.
                              </p>
                            </div>
                            <StatusBadge
                              label={getProviderStageLabel((providerEvidenceSummary.provider_stage || "") as WhiteBooksProviderStage, activeFiling.return_type)}
                              variant={getProviderStageVariant((providerEvidenceSummary.provider_stage || "") as WhiteBooksProviderStage)}
                            />
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Ops completed</p>
                              <p className="mt-2 font-medium text-slate-900">
                                {providerEvidenceSummary.operations_completed.length
                                  ? providerEvidenceSummary.operations_completed.join(", ")
                                  : "None"}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Ops failed</p>
                              <p className="mt-2 font-medium text-slate-900">
                                {providerEvidenceSummary.operations_failed.length
                                  ? providerEvidenceSummary.operations_failed.join(", ")
                                  : "None"}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Next action</p>
                              <p className="mt-2 font-medium text-slate-900">
                                {providerEvidenceSummary.next_action
                                  ? providerEvidenceSummary.next_action.replace(/_/g, " ")
                                  : "None"}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Evidence stored</p>
                              <p className="mt-2 font-medium text-slate-900">
                                {[
                                  providerEvidenceSummary.evidence_available.save_response ? "save" : null,
                                  providerEvidenceSummary.evidence_available.offset_response ? "offset" : null,
                                  providerEvidenceSummary.evidence_available.proceed_response ? "proceed" : null,
                                  providerEvidenceSummary.evidence_available.file_response ? "file" : null,
                                  providerEvidenceSummary.evidence_available.status_response ? "status" : null,
                                  providerEvidenceSummary.evidence_available.track_response ? "track" : null,
                                ]
                                  .filter(Boolean)
                                  .join(", ") || "None"}
                              </p>
                            </div>
                          </div>
                          {providerEvidenceSummary.latest_message ? (
                            <p className="mt-4 text-sm text-slate-700">{providerEvidenceSummary.latest_message}</p>
                          ) : null}
                          {providerEvidenceSummary.latest_failure?.message ? (
                            <p className="mt-2 text-sm text-rose-700">
                              Failure: {providerEvidenceSummary.latest_failure.message}
                              {providerEvidenceSummary.latest_failure.code ? ` (${providerEvidenceSummary.latest_failure.code})` : ""}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">Provider stage</p>
                          <div className="mt-2">
                            <StatusBadge label={getProviderStageLabel(activeFilingProviderStage, activeFiling.return_type)} variant={getProviderStageVariant(activeFilingProviderStage)} />
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">Provider</p>
                          <p className="mt-2 font-semibold text-slate-900">{activeFiling.provider}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">Provider Ref</p>
                          <p className="mt-2 font-semibold text-slate-900">{activeFiling.provider_reference_id || "Pending"}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">ARN</p>
                          <p className="mt-2 font-semibold text-slate-900">{activeFiling.arn || "Pending"}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">Last Sync</p>
                          <p className="mt-2 font-semibold text-slate-900">{formatDateTime(activeFiling.last_status_sync_at)}</p>
                        </div>
                      </div>

                      {activeFiling.error_summary && Object.keys(activeFiling.error_summary).length > 0 ? (
                        <ErrorState
                          title="Provider filing issue"
                          description={String(activeFiling.error_summary.message ?? activeFiling.error_summary.code ?? "A provider-side issue was recorded.")}
                        />
                      ) : null}

                      {latestSavedProviderResponse ? (
                        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <summary className="cursor-pointer list-none font-medium text-slate-900">
                            Support evidence: sanitized WhiteBooks draft-save response
                          </summary>
                          <p className="mt-2 text-sm text-slate-600">
                            This payload is stored after redaction so support can inspect the WhiteBooks draft-save result without exposing live secrets.
                          </p>
                          <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                            {JSON.stringify(latestSavedProviderResponse, null, 2)}
                          </pre>
                        </details>
                      ) : null}

                      {latestOffsetProviderResponse ? (
                        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <summary className="cursor-pointer list-none font-medium text-slate-900">
                            Support evidence: sanitized WhiteBooks offset response
                          </summary>
                          <p className="mt-2 text-sm text-slate-600">
                            This payload is stored after redaction so support can inspect the WhiteBooks liability-offset result without exposing live secrets.
                          </p>
                          <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                            {JSON.stringify(latestOffsetProviderResponse, null, 2)}
                          </pre>
                        </details>
                      ) : null}

                      {latestStatusProviderResponse || latestTrackProviderResponse ? (
                        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <summary className="cursor-pointer list-none font-medium text-slate-900">
                            Support evidence: sanitized WhiteBooks status sync responses
                          </summary>
                          <p className="mt-2 text-sm text-slate-600">
                            These payloads are captured during resync so support can inspect ARN, status, or rejection details without exposing live secrets.
                          </p>
                          {latestStatusProviderResponse ? (
                            <>
                              <p className="mt-3 text-sm font-medium text-slate-900">Status response</p>
                              <pre className="mt-2 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                                {JSON.stringify(latestStatusProviderResponse, null, 2)}
                              </pre>
                            </>
                          ) : null}
                          {latestTrackProviderResponse ? (
                            <>
                              <p className="mt-3 text-sm font-medium text-slate-900">Track response</p>
                              <pre className="mt-2 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                                {JSON.stringify(latestTrackProviderResponse, null, 2)}
                              </pre>
                            </>
                          ) : null}
                        </details>
                      ) : null}

                      <div className="grid gap-5 xl:grid-cols-2">
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Attempts</p>
                            <p className="mt-1 text-sm text-slate-600">Each retry creates a new attempt record with its own request and response summary.</p>
                          </div>
                          {filingAttemptsQuery.isLoading ? (
                            <LoadingState message="Loading filing attempts..." />
                          ) : filingAttemptsQuery.isError ? (
                            <ErrorState description={getErrorMessage(filingAttemptsQuery.error)} />
                          ) : filingAttemptsQuery.data?.items.length ? (
                            <div className="overflow-hidden rounded-2xl border border-slate-200">
                              <Table>
                                <TableHeader className="bg-slate-50">
                                  <TableRow className="hover:bg-transparent">
                                    <TableHead>Attempt</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Stage</TableHead>
                                    <TableHead>Provider Ref</TableHead>
                                    <TableHead>Completed</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {filingAttemptsQuery.data.items.map((attempt) => (
                                    <TableRow key={attempt.id}>
                                      <TableCell className="font-medium text-slate-900">#{attempt.attempt_number}</TableCell>
                                      <TableCell>
                                        <StatusBadge label={attempt.status.replace(/_/g, " ")} variant={attempt.status === "completed" ? "success" : attempt.status === "failed" ? "danger" : "warning"} />
                                      </TableCell>
                                      <TableCell>
                                        <StatusBadge label={getProviderStageLabel(getProviderStage(attempt), activeFiling.return_type)} variant={getProviderStageVariant(getProviderStage(attempt))} />
                                      </TableCell>
                                      <TableCell>{attempt.provider_request_id || "Pending"}</TableCell>
                                      <TableCell>{formatDateTime(attempt.completed_at ?? attempt.submitted_at ?? attempt.started_at)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <EmptyState title="No filing attempts recorded" description="Attempts will appear here after provider filing starts." />
                          )}
                        </div>

                        <div className="space-y-3">
                          {interventionEvents.length ? (
                            <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">Intervention history</p>
                                  <p className="mt-1 text-sm text-slate-700">
                                    Recent support-sensitive actions like resync, retry, reviewed requeue, and provider-stage failures.
                                  </p>
                                </div>
                                <StatusBadge label={`${interventionEvents.length} recent`} variant="warning" />
                              </div>
                              <div className="mt-4 space-y-3">
                                {interventionEvents.map((event) => {
                                  return (
                                    <div key={event.id} className="rounded-2xl border border-amber-200 bg-white/80 p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="font-medium text-slate-900">{event.label}</p>
                                        <StatusBadge
                                          label={event.new_status?.replace(/_/g, " ") || "event"}
                                          variant={getFilingStatusVariant((event.new_status || undefined) as ReturnFilingRecord["status"] | undefined)}
                                        />
                                      </div>
                                      <p className="mt-2 text-sm text-slate-600">
                                        {event.actor_name ? `${event.actor_name} • ` : ""}
                                        {formatDateTime(event.created_at)}
                                      </p>
                                      {event.note ? (
                                        <p className="mt-2 text-sm text-slate-700">{event.note}</p>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Event timeline</p>
                            <p className="mt-1 text-sm text-slate-600">Operational events show how the filing moved from queue to submission, sync, retry, or final filed state.</p>
                          </div>
                          {filingEventsQuery.isLoading ? (
                            <LoadingState message="Loading filing events..." />
                          ) : filingEventsQuery.isError ? (
                            <ErrorState description={getErrorMessage(filingEventsQuery.error)} />
                          ) : filingEventsQuery.data?.items.length ? (
                            <div className="space-y-3">
                              {filingEventsQuery.data.items.map((event) => (
                                <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="font-medium text-slate-900">{getFilingEventLabel(event.event_type)}</p>
                                    <StatusBadge label={event.new_status?.replace(/_/g, " ") || "event"} variant={getFilingStatusVariant((event.new_status || undefined) as ReturnFilingRecord["status"] | undefined)} />
                                  </div>
                                  <p className="mt-2 text-sm text-slate-600">
                                    {event.actor_name ? `${event.actor_name} • ` : ""}{formatDateTime(event.created_at)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <EmptyState title="No filing events yet" description="Event history will appear here after filing actions run." />
                          )}
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                </SectionCard>
                </div>
              </>
            ) : (
              <EmptyState title="No return selected" description="Choose a return preparation from history to inspect the draft summary." />
            )}
          </div>
          </AppModalBody>
        </AppModalContent>
      </Dialog>

      <Dialog open={isMarkFiledOpen} onOpenChange={setIsMarkFiledOpen}>
        <AppModalContent size="sm">
          <AppModalHeader
            title="Mark return as filed"
            description="Capture the ARN manually for the approved return. This does not sync with GSTN yet."
          />
          <AppModalBody>
            <div className="space-y-2">
              <Label htmlFor="return-arn">ARN</Label>
              <Input id="return-arn" value={arn} onChange={(event) => setArn(event.target.value)} placeholder="Enter ARN (optional)" className="h-11 bg-slate-50" />
            </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">Use this after the return is approved and manually filed.</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setIsMarkFiledOpen(false)}>
                <ActionLabel kind="cancel" label="Cancel" />
              </Button>
              <Button onClick={handleMarkFiled} disabled={markFiledMutation.isPending}>
              {markFiledMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ActionLabel kind="confirm" label="Confirm filing" />}
              </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>
    </div>
  );
}
