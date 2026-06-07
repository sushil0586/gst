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
import { ReturnSectionSummary } from "@/components/common/return-section-summary";
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
  useRefreshProviderAuthSessionMutation,
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
import { getErrorMessage, getFieldErrors } from "@/lib/api/error-handler";
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

function getPrimaryFieldError(error: unknown, fieldName: string) {
  return getFieldErrors(error)?.[fieldName]?.[0] ?? null;
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
        "The filing channel saved the draft, but the proceed-to-file step hit a temporary issue. Review the filing message below, then retry when you are ready.",
        variant: "warning" as const,
      };
  }

  return {
    title: "Proceed step needs review before retry",
    description:
      "The filing channel saved the draft, but the proceed-to-file step was rejected. Review the filing message and saved proof before attempting another filing run.",
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
      description: "Retry this filing attempt after reviewing the latest filing issue details. The draft-save proof has been preserved.",
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
          ? "Treat this GSTR-3B as confirmation-pending. Refresh for ARN or terminal filing status before telling operations the return is filed."
          : "Treat this filing as confirmation-pending. Resync for ARN or terminal status before telling operations that the return is filed.",
      tone: "primary" as const,
    };
  }

  if (providerStage === "draft_saved" || nextAction === "review_draft_save_or_continue_manually") {
    if (filing?.return_type === "gstr3b" || nextAction === "await_offset_automation") {
      return {
        title: "Recommended next action",
        description: "Treat this as a saved GSTR-3B draft only. The draft save completed, but liability offset and final filing still need to happen before this can move forward.",
        tone: "primary" as const,
      };
    }
    return {
      title: "Recommended next action",
      description: "Treat this as a saved draft only. Review the linked access session and filing proof before continuing with proceed or any manual portal action.",
      tone: "primary" as const,
    };
  }

  if (filing?.status === "failed") {
    return {
      title: "Recommended next action",
      description: "Review the failure details and filing proof before retrying. Only retry if the issue is clearly operational rather than a channel rejection.",
      tone: "danger" as const,
    };
  }

  return null;
}

function getFilingEventLabel(eventType: string) {
  if (eventType === "filing.draft_save_requested") return "draft save requested";
  if (eventType === "filing.draft_saved") return "draft saved to filing channel";
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
  return String(itcSummary.claim_ready_itc ?? itcSummary.eligible_itc ?? "0.00");
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

function formatSummaryKey(key: string) {
  const labels: Record<string, string> = {
    b2b_taxable_value: "B2B taxable value",
    b2b_tax_amount: "B2B tax amount",
    b2c_taxable_value: "B2C taxable value",
    b2c_tax_amount: "B2C tax amount",
    credit_note_taxable_value: "Credit note taxable value",
    credit_note_tax_amount: "Credit note tax amount",
    debit_note_taxable_value: "Debit note taxable value",
    debit_note_tax_amount: "Debit note tax amount",
    total_taxable_value: "Total taxable value",
    total_tax_amount: "Total tax amount",
    document_count: "Document count",
    outward_taxable_value: "Outward taxable value",
    outward_tax_liability: "Outward tax liability",
    books_itc: "Books ITC",
    reflected_itc: "2B reflected ITC",
    claim_ready_itc: "Claim-ready ITC",
    pending_2b_itc: "Pending in 2B ITC",
    pending_review_itc: "Pending review ITC",
    blocked_itc: "Blocked ITC",
    timing_difference_itc: "Timing-difference ITC",
    vendor_followup_required_itc: "Vendor follow-up ITC",
    claim_ready_count: "Claim-ready rows",
    pending_2b_count: "Pending in 2B rows",
    pending_review_count: "Pending review rows",
    blocked_count: "Blocked rows",
    timing_difference_count: "Timing-difference rows",
    vendor_followup_required_count: "Vendor follow-up rows",
    eligible_itc: "Eligible ITC",
    itc_at_risk: "ITC at risk",
    deferred_blocked_itc: "Deferred / blocked ITC",
    net_tax_payable: "Net tax payable",
    unresolved_mismatch_count: "Unresolved mismatch count",
    latest_run_id: "Latest reconciliation run",
    matched_count: "Matched count",
    partial_match_count: "Partial match count",
    missing_in_books_count: "Missing in books count",
    missing_in_portal_count: "Missing in 2B count",
    duplicate_count: "Duplicate count",
    itc_ready_count: "ITC ready rows",
    itc_pending_2b_count: "Pending in 2B rows",
    itc_pending_review_count: "Pending review rows",
    itc_blocked_count: "Blocked ITC rows",
    itc_timing_difference_count: "Timing-difference rows",
    itc_vendor_followup_required_count: "Vendor follow-up rows",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function hasPeriodException(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }
  const raw = metadata.period_exception;
  if (!raw || typeof raw !== "object") {
    return false;
  }
  return (raw as Record<string, unknown>).allowed === true;
}

function getPeriodExceptionCountFromSummary(summary: Record<string, unknown> | null | undefined) {
  if (!summary || typeof summary !== "object") {
    return 0;
  }
  const raw = summary.period_exceptions;
  if (!raw || typeof raw !== "object") {
    return 0;
  }
  const count = (raw as Record<string, unknown>).count;
  return typeof count === "number" ? count : 0;
}

function chooseGstr3bReviewTab(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = preparedReturn?.summary_snapshot ?? {};
  const periodExceptionCount = getPeriodExceptionCountFromSummary(summary);
  const reconciliationSummary = (summary.reconciliation as Record<string, unknown> | undefined) ?? {};
  const itcSummary = (summary.itc_summary as Record<string, unknown> | undefined) ?? {};

  if (preparedReturn?.is_blocked_by_stale_reconciliation || periodExceptionCount > 0) return "exceptions";
  if (
    Number(reconciliationSummary.manual_review_decision_count ?? 0) > 0 ||
    Number(reconciliationSummary.prior_period_deferred_count ?? 0) > 0
  ) {
    return "decisions";
  }
  if (
    Number(itcSummary.unresolved_mismatch_count ?? 0) > 0 ||
    Number(reconciliationSummary.partial_match_count ?? 0) > 0 ||
    Number(reconciliationSummary.missing_in_books_count ?? 0) > 0 ||
    Number(reconciliationSummary.missing_in_portal_count ?? 0) > 0 ||
    Number(reconciliationSummary.duplicate_count ?? 0) > 0
  ) {
    return "reconciliation";
  }
  if (
    Number(itcSummary.pending_2b_count ?? 0) > 0 ||
    Number(itcSummary.pending_review_count ?? 0) > 0 ||
    Number(itcSummary.blocked_count ?? 0) > 0 ||
    Number(itcSummary.timing_difference_count ?? 0) > 0 ||
    Number(itcSummary.vendor_followup_required_count ?? 0) > 0
  ) {
    return "itc";
  }
  return "overview";
}

function chooseGstr7ReviewTab(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = (preparedReturn?.summary_snapshot as Record<string, unknown> | undefined) ?? {};
  const tdsSummary = (summary.tds_summary as Record<string, unknown> | undefined) ?? {};
  const deducteeRows = ((summary.deductees as Record<string, unknown> | undefined)?.rows as unknown[] | undefined) ?? [];
  const periodExceptionCount = getPeriodExceptionCountFromSummary(summary);

  if (preparedReturn?.is_blocked_by_stale_reconciliation || periodExceptionCount > 0) return "warnings";
  if (Number(tdsSummary.deductee_count ?? 0) === 0 || deducteeRows.length === 0) return "source-imports";
  return "overview";
}

function chooseGstr9ReviewTab(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = (preparedReturn?.summary_snapshot as Record<string, unknown> | undefined) ?? {};
  const sourceMonths = (summary.source_months as Record<string, unknown> | undefined) ?? {};
  const warningsSummary = (summary.warnings_summary as Record<string, unknown> | undefined) ?? {};

  if (preparedReturn?.is_blocked_by_stale_reconciliation) return "exceptions";
  if (Number(sourceMonths.blocked_source_periods ? (sourceMonths.blocked_source_periods as unknown[]).length : 0) > 0) return "exceptions";
  if (Number(warningsSummary.warning_count ?? 0) > 0) return "source-months";
  return "overview";
}

function chooseGstr9cReviewTab(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = (preparedReturn?.summary_snapshot as Record<string, unknown> | undefined) ?? {};
  const warningsSummary = (summary.warnings_summary as Record<string, unknown> | undefined) ?? {};
  const comparisonSummary = (summary.comparison_summary as Record<string, unknown> | undefined) ?? {};
  const sourceTrace = (summary.source_trace as Record<string, unknown> | undefined) ?? {};

  if (preparedReturn?.is_blocked_by_stale_reconciliation) return "exceptions";
  if (!sourceTrace.gstr9_return_id) return "exceptions";
  if (
    Number(comparisonSummary.outward_taxable_variance_absolute ?? 0) > 0 ||
    Number(comparisonSummary.outward_tax_variance_absolute ?? 0) > 0 ||
    Number(comparisonSummary.books_itc_variance_absolute ?? 0) > 0 ||
    Number(comparisonSummary.claim_ready_itc_variance_absolute ?? 0) > 0
  ) {
    return "comparison";
  }
  if (Number(warningsSummary.warning_count ?? 0) > 0) return "exceptions";
  return "overview";
}

function hasExplicitAnnualLiveSavePayload(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = (preparedReturn?.summary_snapshot as Record<string, unknown> | undefined) ?? {};
  if (preparedReturn?.return_type === "gstr9") {
    if (summary.whitebooks_gstr9_save_payload && typeof summary.whitebooks_gstr9_save_payload === "object") return true;
    const nested = summary.whitebooks;
    if (nested && typeof nested === "object") {
      const nestedMap = nested as Record<string, unknown>;
      return Boolean(
        (nestedMap.gstr9_save_payload && typeof nestedMap.gstr9_save_payload === "object") ||
          (nestedMap.save_payload && typeof nestedMap.save_payload === "object"),
      );
    }
    return Boolean(summary.gstr9_save_payload && typeof summary.gstr9_save_payload === "object");
  }
  if (preparedReturn?.return_type === "gstr9c") {
    if (summary.whitebooks_gstr9c_save_payload && typeof summary.whitebooks_gstr9c_save_payload === "object") return true;
    const nested = summary.whitebooks;
    if (nested && typeof nested === "object") {
      const nestedMap = nested as Record<string, unknown>;
      return Boolean(
        (nestedMap.gstr9c_save_payload && typeof nestedMap.gstr9c_save_payload === "object") ||
          (nestedMap.save_payload && typeof nestedMap.save_payload === "object"),
      );
    }
    return Boolean(summary.gstr9c_save_payload && typeof summary.gstr9c_save_payload === "object");
  }
  return false;
}

function getFirstBlockingMessage(messages: Array<string | null | false | undefined>) {
  return messages.find((message): message is string => Boolean(message)) ?? null;
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
    workspaces,
    clients,
    gstins,
    periods,
    selectedWorkspace,
    selectedWorkspaceId,
    selectedClient,
    selectedClientId,
    selectedGstin,
    selectedGstinId,
    selectedPeriod,
    selectedPeriodId,
    setSelectedWorkspaceId,
    setSelectedClientId,
    setSelectedGstinId,
    setSelectedPeriodId,
  } = useWorkspaceContext();
  const [manualSelectedReturnId, setManualSelectedReturnId] = useState<string | null>(null);
  const [dismissedQueryReturnId, setDismissedQueryReturnId] = useState<string | null>(null);
  const [isMarkFiledOpen, setIsMarkFiledOpen] = useState(false);
  const [arn, setArn] = useState("");
  const [whiteBooksOtp, setWhiteBooksOtp] = useState("");
  const [whiteBooksTxn, setWhiteBooksTxn] = useState("");
  const [filingActionFeedback, setFilingActionFeedback] = useState<{ tone: "warning" | "danger" | "success"; message: string } | null>(null);
  const queryWorkspaceId = searchParams.get("workspace");
  const queryClientId = searchParams.get("client");
  const queryGstinId = searchParams.get("gstin");
  const queryPeriodId = searchParams.get("period") ?? searchParams.get("compliance_period");
  const selectedReturnFromQuery = searchParams.get("returnId");
  const selectedFocusFromQuery = searchParams.get("focus");
  const filingLifecycleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (queryWorkspaceId && queryWorkspaceId !== selectedWorkspaceId && workspaces.some((workspace) => workspace.id === queryWorkspaceId)) {
      setSelectedWorkspaceId(queryWorkspaceId);
      return;
    }
    if (queryClientId && queryClientId !== selectedClientId && clients.some((client) => client.id === queryClientId)) {
      setSelectedClientId(queryClientId);
      return;
    }
    if (queryGstinId && queryGstinId !== selectedGstinId && gstins.some((gstin) => gstin.id === queryGstinId)) {
      setSelectedGstinId(queryGstinId);
      return;
    }
    if (queryPeriodId && queryPeriodId !== selectedPeriodId && periods.some((period) => period.id === queryPeriodId)) {
      setSelectedPeriodId(queryPeriodId);
    }
  }, [
    clients,
    gstins,
    periods,
    queryClientId,
    queryGstinId,
    queryPeriodId,
    queryWorkspaceId,
    selectedClientId,
    selectedGstinId,
    selectedPeriodId,
    selectedWorkspaceId,
    setSelectedClientId,
    setSelectedGstinId,
    setSelectedPeriodId,
    setSelectedWorkspaceId,
    workspaces,
  ]);

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
  const refreshWhiteBooksAuthSessionMutation = useRefreshProviderAuthSessionMutation({
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
  const gstr7Return = returnsQuery.data?.items.find((item) => item.return_type === "gstr7");
  const gstr9Return = returnsQuery.data?.items.find((item) => item.return_type === "gstr9");
  const gstr9cReturn = returnsQuery.data?.items.find((item) => item.return_type === "gstr9c");
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
  const salesPeriodExceptionCount = useMemo(
    () => (salesTransactionsQuery.data?.items ?? []).filter((transaction) => hasPeriodException(transaction.metadata)).length,
    [salesTransactionsQuery.data?.items],
  );
  const purchasePeriodExceptionCount = useMemo(
    () => (purchaseTransactionsQuery.data?.items ?? []).filter((transaction) => hasPeriodException(transaction.metadata)).length,
    [purchaseTransactionsQuery.data?.items],
  );
  const totalPeriodExceptionCount = salesPeriodExceptionCount + purchasePeriodExceptionCount;
  const readiness = readinessQuery.data;
  const activeFilingProviderStage = getProviderStage(activeFiling?.latest_attempt);
  const latestProviderMessage = getProviderMessage(activeFiling?.latest_attempt);
  const linkedAuthSessionId = getLinkedAuthSessionId(activeFiling?.latest_attempt);
  const latestSavedProviderResponse = getSavedProviderResponse(activeFiling?.latest_attempt);
  const latestOffsetProviderResponse = getOffsetProviderResponse(activeFiling?.latest_attempt);
  const latestStatusProviderResponse = getStatusProviderResponse(activeFiling?.latest_attempt);
  const latestTrackProviderResponse = getTrackProviderResponse(activeFiling?.latest_attempt);
  const activeWhiteBooksAuthFreshness = activeWhiteBooksAuthSession?.freshness_summary;
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
  const filingAuthOtpRequested = Boolean(activeWhiteBooksAuthSession?.last_requested_at);
  const filingAuthOtpVerified =
    activeWhiteBooksAuthSession?.status === "auth_token_received" ||
    activeWhiteBooksAuthSession?.status === "session_active";
  const liveFilingConfirmed = Boolean(activeWhiteBooksAuthSession?.response_contract_confirmed);
  const filingAuthFresh = !activeWhiteBooksAuthFreshness?.is_stale;
  const filingQueuedBeforeLiveSubmission =
    activeFiling?.status === "queued_for_filing" &&
    !activeFiling?.submitted_at &&
    !activeFiling?.provider_reference_id &&
    (activeFiling?.latest_attempt?.status === "created" || activeFiling?.latest_attempt?.status === "queued");
  const filingNeedsFreshOtpRestart = Boolean(
    filingQueuedBeforeLiveSubmission && (!filingAuthOtpVerified || !liveFilingConfirmed || !filingAuthFresh),
  );
  const filingRestartReady = Boolean(
    filingQueuedBeforeLiveSubmission && filingAuthOtpVerified && liveFilingConfirmed && filingAuthFresh,
  );
  const filingAlreadyInFlight =
    (activeFiling?.status === "queued_for_filing" && !filingRestartReady) ||
    activeFiling?.status === "submitted" ||
    activeFiling?.status === "filed" ||
    activeFiling?.status === "arn_received";

  const isPeriodLocked = Boolean(selectedPeriod?.is_locked);
  const isManualAnnualFiling =
    activeFiling?.readiness_snapshot?.manual_filing_only === true ||
    ((activeReturn?.return_type === "gstr9" || activeReturn?.return_type === "gstr9c") && !hasExplicitAnnualLiveSavePayload(activeReturn));
  const canPrepare = Boolean(selectedWorkspaceId && selectedClientId && selectedGstinId && selectedPeriodId && !isPeriodLocked);
  const exportReturnType =
    activeReturn?.return_type ??
    (gstr1Return ? "gstr1" : gstr3bReturn ? "gstr3b" : gstr7Return ? "gstr7" : gstr9Return ? "gstr9" : gstr9cReturn ? "gstr9c" : null);
  const activeReadiness =
    exportReturnType === "gstr1"
      ? readiness?.gstr1
      : exportReturnType === "gstr3b"
        ? readiness?.gstr3b
        : exportReturnType === "gstr7"
          ? readiness?.gstr7
          : exportReturnType === "gstr9"
            ? readiness?.gstr9
            : exportReturnType === "gstr9c"
              ? readiness?.gstr9c
            : null;
  const isReturnFlowBlockedByStaleSource = Boolean(activeReturn?.is_blocked_by_stale_reconciliation || isReconciliationStale);
  const canRequestOtp = !isManualAnnualFiling && Boolean(selectedWorkspaceId && selectedClientId) && !requestWhiteBooksOTPMutation.isPending;
  const canVerifyOtp =
    !isManualAnnualFiling &&
    Boolean(activeWhiteBooksAuthSession) &&
    Boolean(whiteBooksOtp.trim()) &&
    !verifyWhiteBooksOTPMutation.isPending;
  const canRefreshOtpSession =
    !isManualAnnualFiling &&
    Boolean(activeWhiteBooksAuthSession?.id) &&
    Boolean((whiteBooksTxn.trim() || activeWhiteBooksAuthSession?.txn || "").trim()) &&
    filingAuthOtpVerified &&
    !refreshWhiteBooksAuthSessionMutation.isPending;
  const startFilingDisabledReason = getFirstBlockingMessage([
    activeReturn?.status !== "approved" ? "Approve this return before starting filing." : null,
    isReturnFlowBlockedByStaleSource ? "Re-run reconciliation and refresh the return draft before filing." : null,
    isManualAnnualFiling && activeFiling ? "A manual annual filing record already exists for this return." : null,
    isManualAnnualFiling || activeFiling ? null : !activeWhiteBooksAuthSession ? "Request OTP first to create a filing access session." : null,
    isManualAnnualFiling ? null : !filingAuthOtpVerified ? "Verify OTP successfully before starting filing." : null,
    isManualAnnualFiling ? null : !liveFilingConfirmed ? "Finish OTP verification for this GSTIN before live filing can start." : null,
    isManualAnnualFiling ? null : !filingAuthFresh ? activeWhiteBooksAuthFreshness?.stale_reason || "The filing access session is stale. Request OTP again." : null,
    isManualAnnualFiling ? null :
    filingNeedsFreshOtpRestart
      ? "An earlier filing attempt was queued before OTP verification finished. Request a fresh OTP for this GSTIN, verify it, then use Resume filing. The verified session stays active for up to 6 hours."
      : null,
    isManualAnnualFiling ? null :
    filingAlreadyInFlight ? `A filing run is already ${activeFiling?.status?.replace(/_/g, " ") || "in progress"} for this return.` : null,
  ]);
  const retryFilingDisabledReason = getFirstBlockingMessage([
    !activeFiling ? "Start a filing run first." : null,
    activeFiling && !retrySupportAction?.allowed ? retrySupportAction?.reason || supportActionsSummary?.summary_reason || "Retry is not recommended right now." : null,
  ]);
  const resyncDisabledReason = getFirstBlockingMessage([
    !activeFiling ? "Start a filing run first." : null,
    activeFiling && !resyncSupportAction?.allowed ? resyncSupportAction?.reason || supportActionsSummary?.summary_reason || "Status refresh is not available right now." : null,
  ]);
  const requeueDisabledReason = getFirstBlockingMessage([
    !activeFiling ? "Start a filing run first." : null,
    activeFiling && !requeueSupportAction?.allowed ? requeueSupportAction?.reason || supportActionsSummary?.summary_reason || "Requeue is not allowed right now." : null,
  ]);
  const filingNextStep = !activeReturn
    ? null
    : activeReturn.status !== "approved"
      ? {
          title: "Approve the return first",
          description: "Live filing starts only after this draft is approved.",
          tone: "warning" as const,
        }
      : isReturnFlowBlockedByStaleSource
        ? {
            title: "Re-run reconciliation before filing",
            description: "Source data changed after reconciliation, so the return draft must be refreshed first.",
            tone: "danger" as const,
          }
      : isManualAnnualFiling && !activeFiling
          ? {
              title: "Open the annual filing record",
              description: "Create the operational filing record first, then complete the annual filing manually and capture the ARN here.",
              tone: "primary" as const,
            }
          : isManualAnnualFiling
            ? {
                title: "Capture annual filing proof",
                description: "This annual return uses a manual filing flow. Complete the filing outside the gateway, then mark the return filed with ARN here.",
                tone: "success" as const,
              }
        : !activeWhiteBooksAuthSession
          ? {
              title: "Request OTP",
              description: "Start the filing access session for this GSTIN by sending OTP to the registered email.",
              tone: "primary" as const,
            }
          : !filingAuthOtpVerified
            ? {
                title: "Verify OTP",
                description: "Enter the OTP from the filing email to verify the live access session.",
                tone: "primary" as const,
              }
            : !liveFilingConfirmed
              ? {
                  title: "Finish live OTP verification",
                  description: "Complete OTP verification for this GSTIN. Once verified, the filing session stays active for up to 6 hours.",
                  tone: "warning" as const,
                }
              : !filingAuthFresh
                ? {
                    title: "Request a fresh OTP",
                    description: activeWhiteBooksAuthFreshness?.stale_reason || "This filing session expired before filing could start.",
                    tone: "warning" as const,
                  }
                : filingNeedsFreshOtpRestart || filingRestartReady
                  ? {
                      title: "Resume the queued filing",
                      description: "An earlier filing run was queued before live verification completed. You can safely resume it now.",
                      tone: "primary" as const,
                    }
                  : filingAlreadyInFlight
                    ? {
                        title: "Filing already in progress",
                        description: `A filing run is already ${activeFiling?.status?.replace(/_/g, " ") || "active"} for this return.`,
                        tone: "warning" as const,
                      }
                    : {
                        title: "Start live filing",
                        description: "Approval and OTP verification are complete. You can now start the filing run.",
                        tone: "success" as const,
                      };
  const primaryFilingGuidance = filingActionFeedback
    ? {
        title: filingActionFeedback.tone === "success" ? "Latest filing update" : "Action needed before filing can continue",
        description: filingActionFeedback.message,
        tone: filingActionFeedback.tone,
      }
    : filingNextStep;
  const otpAccessLatestMessage = !selectedWorkspaceId || !selectedClientId
    ? {
        tone: "danger" as const,
        title: "Choose the correct filing context first",
        description: "Select the workspace and client before requesting OTP, so the session is created for the right GSTIN and client.",
      }
      : isManualAnnualFiling
        ? {
            tone: "success" as const,
            title: "Manual annual filing flow",
            description: "This annual return does not require an OTP filing session here. Open the filing record, complete the annual filing manually, then capture ARN.",
          }
      : filingNeedsFreshOtpRestart
      ? {
          tone: "warning" as const,
          title: "Fresh OTP needed for this GSTIN",
          description: "An earlier filing attempt was queued too early. Request a fresh OTP, verify it, then use Resume filing.",
        }
      : !activeWhiteBooksAuthSession
        ? {
            tone: "primary" as const,
            title: "No active filing session yet",
            description: "Request OTP to create a filing session for this GSTIN.",
          }
        : !filingAuthOtpVerified
          ? {
              tone: "primary" as const,
              title: "Enter and verify OTP",
              description: "Use the OTP sent to the registered filing email to activate this GSTIN session.",
            }
          : !liveFilingConfirmed
            ? {
                tone: "warning" as const,
                title: "Session not ready yet",
                description: "OTP is captured, but the filing session is still not ready. Request and verify a fresh OTP for this GSTIN before filing.",
              }
            : !filingAuthFresh
              ? {
                  tone: "warning" as const,
                  title: "Session expired",
                  description: activeWhiteBooksAuthFreshness?.stale_reason || "This filing session expired. Request OTP again to continue.",
                }
              : {
                  tone: "success" as const,
                  title: "Session active for this GSTIN",
                  description: "OTP is verified and the filing session is active for up to 6 hours for this GSTIN.",
                };

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

  const getFilingActionErrorMessage = (error: unknown) =>
    getPrimaryFieldError(error, "provider_auth") ||
    getPrimaryFieldError(error, "prepared_return") ||
    getPrimaryFieldError(error, "approval_request") ||
    getErrorMessage(error);

  const handlePrepare = async (returnType: "gstr1" | "gstr3b" | "gstr7" | "gstr9" | "gstr9c") => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
      toast.error("Select workspace, client, GSTIN, and compliance period before preparing a return.");
      return;
    }
    if (isPeriodLocked) {
      toast.error("This compliance period is locked. Unlock it before preparing returns.");
      return;
    }
    const targetReadiness =
      returnType === "gstr1"
        ? readiness?.gstr1
        : returnType === "gstr3b"
          ? readiness?.gstr3b
          : returnType === "gstr7"
            ? readiness?.gstr7
            : returnType === "gstr9"
              ? readiness?.gstr9
              : readiness?.gstr9c;
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
      setFilingActionFeedback(null);
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
    const summary = activeReturn.summary_snapshot ?? {};
    const itcSummary = (summary.itc_summary as Record<string, unknown> | undefined) ?? {};
    const gstr3bApprovalNotes =
      activeReturn.return_type === "gstr3b"
        ? [
            `Claim-ready ITC: Rs. ${formatMoney(String(itcSummary.claim_ready_itc ?? itcSummary.eligible_itc ?? "0.00"))}`,
            `Pending in 2B: ${String(itcSummary.pending_2b_count ?? 0)} row(s)`,
            `Pending review: ${String(itcSummary.pending_review_count ?? 0)} row(s)`,
            `Blocked ITC: ${String(itcSummary.blocked_count ?? 0)} row(s)`,
            `Timing differences: ${String(itcSummary.timing_difference_count ?? 0)} row(s)`,
            `Vendor follow-up: ${String(itcSummary.vendor_followup_required_count ?? 0)} row(s)`,
          ]
        : [];
    const periodExceptionNote =
      returnPeriodExceptionCount > 0 ? [`Source period exceptions: ${returnPeriodExceptionCount} row(s)`] : [];
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
        comments: [
          `Please review this ${activeReturn.return_type.toUpperCase()} draft.`,
          ...gstr3bApprovalNotes,
          ...periodExceptionNote,
        ].join(" "),
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
      toast.error("Select a full return context before starting filing.");
      return;
    }
    const linkedApproval = (approvalsQuery.data?.items ?? []).find(
      (item) => item.entity_id === activeReturn.id && item.status === "approved",
    );
    try {
      setFilingActionFeedback(null);
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
      setFilingActionFeedback({ tone: "success", message: "Filing request accepted. Use the status cards below to track gateway progress." });
      toast.success("Provider filing started.");
    } catch (error) {
      const message = getFilingActionErrorMessage(error);
      setFilingActionFeedback({ tone: "warning", message });
      toast.error(message);
    }
  };

  const handleRetryFiling = async () => {
    if (!activeFiling) return;
    try {
      setFilingActionFeedback(null);
      await retryFilingMutation.mutateAsync({
        filingId: activeFiling.id,
        comments: "Retry requested from returns workspace.",
      });
      setFilingActionFeedback({ tone: "success", message: "Retry request accepted. Refresh status after the provider processes the next attempt." });
      toast.success("Filing retry started.");
    } catch (error) {
      const message = getFilingActionErrorMessage(error);
      setFilingActionFeedback({ tone: "warning", message });
      toast.error(message);
    }
  };

  const handleResyncFiling = async () => {
    if (!activeFiling) return;
    try {
      setFilingActionFeedback(null);
      await resyncFilingMutation.mutateAsync(activeFiling.id);
      setFilingActionFeedback({ tone: "success", message: "Status refresh requested. Check the filing progress section for the next provider update." });
      toast.success("Filing status refreshed.");
    } catch (error) {
      const message = getFilingActionErrorMessage(error);
      setFilingActionFeedback({ tone: "warning", message });
      toast.error(message);
    }
  };

  const handleRequeueAfterReview = async () => {
    if (!activeFiling) return;
    try {
      setFilingActionFeedback(null);
      await requeueAfterReviewMutation.mutateAsync({
        filingId: activeFiling.id,
        comments: "Requeued after operator review from returns workspace.",
      });
      setFilingActionFeedback({ tone: "success", message: "Requeue request accepted. Resume tracking in the filing progress section below." });
      toast.success("Filing requeued after review.");
    } catch (error) {
      const message = getFilingActionErrorMessage(error);
      setFilingActionFeedback({ tone: "warning", message });
      toast.error(message);
    }
  };

  const handleEscalateAlerts = async () => {
    if (!activeFiling) return;
    try {
      await escalateFilingAlertsMutation.mutateAsync({
        filingId: activeFiling.id,
        comments: "Escalated from returns workspace for routed follow-up.",
      });
      toast.success("Operational alerts escalated.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleRequestWhiteBooksOtp = async () => {
    if (!selectedWorkspaceId || !selectedClientId) {
      toast.error("Select workspace and client before starting filing access verification.");
      return;
    }
    try {
      setFilingActionFeedback(null);
      const session = await requestWhiteBooksOTPMutation.mutateAsync({
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        gstin: selectedGstinId ?? undefined,
        provider: "whitebooks",
      });
      setWhiteBooksTxn(session.txn || "");
      toast.success("Provider OTP requested.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleVerifyWhiteBooksOtp = async () => {
    if (!activeWhiteBooksAuthSession) {
      toast.error("Request an OTP first.");
      return;
    }
    if (!whiteBooksOtp.trim()) {
      toast.error("Enter the OTP you received.");
      return;
    }
    try {
      setFilingActionFeedback(null);
      const session = await verifyWhiteBooksOTPMutation.mutateAsync({
        sessionId: activeWhiteBooksAuthSession.id,
        otp: whiteBooksOtp.trim(),
        txn: whiteBooksTxn.trim() || activeWhiteBooksAuthSession.txn || undefined,
      });
      setWhiteBooksTxn(session.txn || "");
      setFilingActionFeedback({
        tone: "success",
        message: session.response_contract_confirmed
          ? "OTP verified. This filing session is now active for this GSTIN and can be used for up to 6 hours."
          : "OTP verified. If filing is still locked, request a fresh OTP for this GSTIN and verify it again before resuming.",
      });
      toast.success(
        session.response_contract_confirmed
          ? "Provider session activated."
          : "Provider auth token captured. Session mapping is still pending contract confirmation.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleRefreshWhiteBooksSession = async () => {
    if (!activeWhiteBooksAuthSession) {
      toast.error("Request and verify OTP first.");
      return;
    }
    const txn = whiteBooksTxn.trim() || activeWhiteBooksAuthSession.txn || "";
    if (!txn) {
      toast.error("Session reference is required before refresh.");
      return;
    }
    try {
      setFilingActionFeedback(null);
      const session = await refreshWhiteBooksAuthSessionMutation.mutateAsync({
        sessionId: activeWhiteBooksAuthSession.id,
        txn,
      });
      setWhiteBooksTxn(session.txn || "");
      setFilingActionFeedback({
        tone: "success",
        message: "Provider session refreshed. This GSTIN session has a fresh verification window now.",
      });
      toast.success("Provider session refreshed.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const summary = (activeReturn?.summary_snapshot ?? {}) as Record<string, unknown>;
  const outwardSupplies = (summary.outward_supplies as Record<string, unknown> | undefined) ?? {};
  const itcSummary = (summary.itc_summary as Record<string, unknown> | undefined) ?? {};
  const reconciliationSummary = (summary.reconciliation as Record<string, unknown> | undefined) ?? {};
  const manualReviewDecisionCount = Number(reconciliationSummary.manual_review_decision_count ?? 0);
  const manualReviewDecisionSummary = {
    claimNow: Number(reconciliationSummary.manual_claim_now_count ?? 0),
    defer: Number(reconciliationSummary.manual_defer_count ?? 0),
    blocked: Number(reconciliationSummary.manual_blocked_count ?? 0),
    vendorFollowUp: Number(reconciliationSummary.manual_vendor_followup_count ?? 0),
  };
  const priorPeriodDeferredPeriod = typeof reconciliationSummary.prior_period_deferred_period === "string" ? reconciliationSummary.prior_period_deferred_period : "";
  const priorPeriodDeferredCount = Number(reconciliationSummary.prior_period_deferred_count ?? 0);
  const priorPeriodDeferredItc = String(reconciliationSummary.prior_period_deferred_itc ?? "0.00");
  const reconciliationImpactEntries = Object.entries(reconciliationSummary).filter(
    ([key]) => !key.startsWith("manual_") && !key.startsWith("prior_period_"),
  );
  const returnPeriodExceptionCount = getPeriodExceptionCountFromSummary(summary);

  const handleExport = async (returnType: "gstr1" | "gstr3b" | "gstr7" | "gstr9") => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedPeriodId) {
      toast.error("Select workspace, client, and period before exporting return summaries.");
      return;
    }
    const targetReturn =
      returnType === "gstr1"
        ? gstr1Return
        : returnType === "gstr3b"
          ? gstr3bReturn
          : returnType === "gstr7"
            ? gstr7Return
            : gstr9Return;
    if (!targetReturn) {
      toast.error(`Prepare ${returnType.toUpperCase()} before exporting its workbook.`);
      return;
    }
    const targetReadiness =
      returnType === "gstr1"
        ? readiness?.gstr1
        : returnType === "gstr3b"
          ? readiness?.gstr3b
          : returnType === "gstr7"
            ? readiness?.gstr7
            : readiness?.gstr9;
    if (targetReadiness?.status === "blocked") {
      toast.warning(targetReadiness.issues[0]?.detail ?? "Exporting a prepared return that still has readiness blockers.");
    } else if (targetReadiness?.status === "ready_with_warnings") {
      toast.warning("Exporting with warnings. Review readiness issues before sharing the workbook.");
    }
    try {
      const exportParams: Record<string, string> = {
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        compliance_period: selectedPeriodId,
        return_type: returnType,
      };
      if (selectedGstinId) {
        exportParams.gstin = selectedGstinId;
      }
      let filename = "return-summary.xlsx";
      let successMessage = "Return summary export downloaded.";
      if (returnType === "gstr1") {
        exportParams.export_mode = "full_gstr1";
        filename = `gstr1-${selectedPeriod?.period ?? "export"}.xlsx`;
        successMessage = "Full GSTR-1 workbook downloaded.";
      } else if (returnType === "gstr3b") {
        exportParams.export_mode = "full_gstr3b";
        filename = `gstr3b-${selectedPeriod?.period ?? "export"}.xlsx`;
        successMessage = "Full GSTR-3B workbook downloaded.";
      } else if (returnType === "gstr7") {
        exportParams.export_mode = "full_gstr7";
        filename = `gstr7-${selectedPeriod?.period ?? "export"}.xlsx`;
        successMessage = "GSTR-7 workbook downloaded.";
      } else {
        exportParams.export_mode = "full_gstr9";
        filename = `gstr9-${selectedPeriod?.period ?? "export"}.xlsx`;
        successMessage = "First-pass GSTR-9 workbook downloaded.";
      }
      await downloadFile("/exports/return-summary/", exportParams, filename);
      toast.success(successMessage);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const gstr1ReviewHref = useMemo(() => {
    if (!gstr1Return || !selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
      return null;
    }
    const params = new URLSearchParams({
      workspace: selectedWorkspaceId,
      client: selectedClientId,
      gstin: selectedGstinId,
      period: selectedPeriodId,
      returnId: gstr1Return.id,
    });
    return `/returns/gstr1-review?${params.toString()}`;
  }, [gstr1Return, selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId]);
  const gstr3bReviewHref = useMemo(() => {
    if (!gstr3bReturn || !selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
      return null;
    }
    const params = new URLSearchParams({
      workspace: selectedWorkspaceId,
      client: selectedClientId,
      gstin: selectedGstinId,
      period: selectedPeriodId,
      returnId: gstr3bReturn.id,
    });
    params.set("tab", chooseGstr3bReviewTab(gstr3bReturn));
    return `/returns/gstr3b-review?${params.toString()}`;
  }, [gstr3bReturn, selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId]);
  const gstr7ReviewHref = useMemo(() => {
    if (!gstr7Return || !selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
      return null;
    }
    const params = new URLSearchParams({
      workspace: selectedWorkspaceId,
      client: selectedClientId,
      gstin: selectedGstinId,
      period: selectedPeriodId,
      returnId: gstr7Return.id,
    });
    params.set("tab", chooseGstr7ReviewTab(gstr7Return));
    return `/returns/gstr7-review?${params.toString()}`;
  }, [gstr7Return, selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId]);
  const gstr9ReviewHref = useMemo(() => {
    if (!gstr9Return || !selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
      return null;
    }
    const params = new URLSearchParams({
      workspace: selectedWorkspaceId,
      client: selectedClientId,
      gstin: selectedGstinId,
      period: selectedPeriodId,
      returnId: gstr9Return.id,
    });
    params.set("tab", chooseGstr9ReviewTab(gstr9Return));
    return `/returns/gstr9-review?${params.toString()}`;
  }, [gstr9Return, selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId]);
  const gstr9cReviewHref = useMemo(() => {
    if (!gstr9cReturn || !selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
      return null;
    }
    const params = new URLSearchParams({
      workspace: selectedWorkspaceId,
      client: selectedClientId,
      gstin: selectedGstinId,
      period: selectedPeriodId,
      returnId: gstr9cReturn.id,
    });
    params.set("tab", chooseGstr9cReviewTab(gstr9cReturn));
    return `/returns/gstr9c-review?${params.toString()}`;
  }, [gstr9cReturn, selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns"
        description="Prepare draft GSTR-1, GSTR-3B, GSTR-7, GSTR-9, and GSTR-9C summaries from imported transactions and reconciliation outcomes before approval and manual filing."
        actions={[
          ...(gstr1ReviewHref
            ? [{
                label: "Open GSTR-1 Review",
                href: gstr1ReviewHref,
                disabled: !gstr1Return,
              }]
            : []),
          ...(gstr3bReviewHref
            ? [{
                label: "Open GSTR-3B Review",
                href: gstr3bReviewHref,
                disabled: !gstr3bReturn,
              }]
            : []),
          ...(gstr7ReviewHref
            ? [{
                label: "Open GSTR-7 Review",
                href: gstr7ReviewHref,
                disabled: !gstr7Return,
              }]
            : []),
          ...(gstr9ReviewHref
            ? [{
                label: "Open GSTR-9 Review",
                href: gstr9ReviewHref,
                disabled: !gstr9Return,
              }]
            : []),
          ...(gstr9cReviewHref
            ? [{
                label: "Open GSTR-9C Review",
                href: gstr9cReviewHref,
                disabled: !gstr9cReturn,
              }]
            : []),
          ...(gstr1Return
            ? [{
                label: "Export GSTR-1 XLSX",
                onClick: () => handleExport("gstr1"),
                disabled: !selectedWorkspaceId || !selectedClientId || !selectedPeriodId,
              }]
            : []),
          ...(gstr3bReturn
            ? [{
                label: "Export GSTR-3B XLSX",
                onClick: () => handleExport("gstr3b"),
                disabled: !selectedWorkspaceId || !selectedClientId || !selectedPeriodId,
              }]
            : []),
          ...(gstr7Return
            ? [{
                label: "Export GSTR-7 XLSX",
                onClick: () => handleExport("gstr7"),
                disabled: !selectedWorkspaceId || !selectedClientId || !selectedPeriodId,
              }]
            : []),
          ...(gstr9Return
            ? [{
                label: "Export GSTR-9 XLSX",
                onClick: () => handleExport("gstr9"),
                disabled: !selectedWorkspaceId || !selectedClientId || !selectedPeriodId,
              }]
            : []),
        ]}
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
                Move from prepared books to approval-ready returns, then into controlled filing with proof and readiness checks intact.
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
          description="Use this page to validate readiness before approvals and filing begin."
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
            {totalPeriodExceptionCount > 0 ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-900">Out-of-period source exceptions are part of this return context</p>
                  <p className="mt-1 text-sm leading-6 text-amber-700">
                    {totalPeriodExceptionCount} source transaction{totalPeriodExceptionCount === 1 ? "" : "s"} {totalPeriodExceptionCount === 1 ? "was" : "were"} accepted through a period exception. Review those reasons before approving, exporting, or filing this return.
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
            <Button size="sm" variant="outline" onClick={() => handlePrepare("gstr7")} disabled={!canPrepare || prepareReturnMutation.isPending}>
              {prepareReturnMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Prepare GSTR-7"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handlePrepare("gstr9")} disabled={!canPrepare || prepareReturnMutation.isPending}>
              {prepareReturnMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Prepare GSTR-9"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handlePrepare("gstr9c")} disabled={!canPrepare || prepareReturnMutation.isPending}>
              {prepareReturnMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Prepare GSTR-9C"}
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
        ) : totalPeriodExceptionCount > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-amber-950">Period exceptions detected in return inputs</p>
                <p className="mt-1 leading-6">
                  Sales rows with period exceptions: {salesPeriodExceptionCount}. Purchase rows with period exceptions: {purchasePeriodExceptionCount}. Review the affected source transactions in Reports before finalizing the return.
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="border-amber-200 bg-white text-amber-900 hover:bg-amber-100">
                <Link href="/reports">Open reports</Link>
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
          <EmptyState title="Readiness checks need a full context" description="Select workspace, client, GSTIN, and period to evaluate GSTR-1, GSTR-3B, GSTR-7, GSTR-9, and GSTR-9C readiness." />
        ) : readinessQuery.isLoading ? (
          <LoadingState message="Evaluating filing readiness..." />
        ) : readinessQuery.isError ? (
          <ErrorState title="We couldn’t evaluate readiness" description={getErrorMessage(readinessQuery.error)} />
        ) : readiness ? (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-3">
              {[readiness.gstr1, readiness.gstr3b, readiness.gstr7, readiness.gstr9, readiness.gstr9c].map((item) => (
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
                  ? "At least one return has hard blockers. Resolve those issues before trusting preparation or export decisions."
                  : readiness.overall_status === "ready_with_warnings"
                    ? "Returns can be prepared and exported where supported, but warnings should be reviewed before sharing or filing."
                    : "The current return set is ready for preparation and supported export actions in this period."}
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
                          setFilingActionFeedback(null);
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
          setFilingActionFeedback(null);
          setManualSelectedReturnId(null);
          if (querySelectedReturnId) {
            setDismissedQueryReturnId(querySelectedReturnId);
          }
        }}
      >
        <AppModalContent size="xl">
          <AppModalHeader
            title={activeReturn ? `${activeReturn.return_type.toUpperCase()} review summary` : "Return detail"}
            description={
              activeReturn
                ? `${activeReturn.client_name ?? "Client"} • ${activeReturn.gstin_value ?? ""} • ${activeReturn.compliance_period_label ?? ""}`
                : "Review the prepared summary, reconciliation impact, and filing status before approval or manual filing."
            }
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
                  title="At a glance"
                  description="A quick summary of where this draft stands before you review the full totals."
                >
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Return stage</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{activeReturn.status.replace(/_/g, " ")}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Approval state</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {activeReturn.approved_by_name ? "Approved" : activeApproval ? activeApproval.status.replace(/_/g, " ") : "Pending"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Filing proof</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{activeReturn.arn || "Not captured"}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Review attention</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {isReturnFlowBlockedByStaleSource
                          ? "Re-run reconciliation"
                          : totalPeriodExceptionCount > 0
                            ? `${totalPeriodExceptionCount} source exception${totalPeriodExceptionCount === 1 ? "" : "s"}`
                            : "No special flags"}
                      </p>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title={`${activeReturn.return_type.toUpperCase()} workflow status`}
                  description="Prepared ownership, approval progress, filing proof, and source review warnings for this draft."
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
                  {totalPeriodExceptionCount > 0 ? (
                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                      <div className="flex items-start gap-3">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-amber-950">Period exceptions exist in the source transactions behind this return</p>
                          <p className="mt-1 leading-6">
                            Sales rows with exceptions: {salesPeriodExceptionCount}. Purchase rows with exceptions: {purchasePeriodExceptionCount}. Keep those justifications in mind before approval or filing.
                          </p>
                        </div>
                        <Button asChild size="sm" variant="outline" className="border-amber-200 bg-white text-amber-900 hover:bg-amber-100">
                          <Link href="/reports">Review source rows</Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-4 text-sm md:grid-cols-2">
                    <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
                      <div><span className="text-slate-500">Prepared by:</span> <span className="font-medium text-slate-900">{activeReturn.prepared_by_name ?? "System"}</span></div>
                      <div><span className="text-slate-500">Prepared / updated:</span> <span className="font-medium text-slate-900">{formatDateTime(activeReturn.updated_at)}</span></div>
                      <div><span className="text-slate-500">Approved by:</span> <span className="font-medium text-slate-900">{activeReturn.approved_by_name ?? "Pending"}</span></div>
                    </div>
                    <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
                      <div><span className="text-slate-500">Filed by:</span> <span className="font-medium text-slate-900">{activeReturn.filed_by_name ?? "Pending"}</span></div>
                      <div><span className="text-slate-500">Filed at:</span> <span className="font-medium text-slate-900">{formatDateTime(activeReturn.filed_at)}</span></div>
                      <div><span className="text-slate-500">ARN / filing proof:</span> <span className="font-medium text-slate-900">{activeReturn.arn || "Not captured"}</span></div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Outward supplies" description="Draft totals derived from normalized GST transactions.">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Object.entries(outwardSupplies).map(([key, value]) => (
                      <div key={key} className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">{formatSummaryKey(key)}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          {key.includes("count") ? String(value) : `Rs. ${formatMoney(String(value))}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <ReturnSectionSummary
                  returnType={activeReturn.return_type}
                  summarySnapshot={activeReturn.summary_snapshot}
                  variant="full"
                />

                <SectionCard title="ITC summary" description="Relevant for GSTR-3B drafts where reconciliation impacts input tax credit.">
                  {Object.keys(itcSummary).length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {Object.entries(itcSummary).map(([key, value]) => (
                        <div key={key} className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">{formatSummaryKey(key)}</p>
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

                {manualReviewDecisionCount > 0 ? (
                  <SectionCard
                    title="Manual review decisions"
                    description="These rows were intentionally overridden by a CA reviewer instead of following raw reconciliation status."
                  >
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Claim now</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{manualReviewDecisionSummary.claimNow}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Defer</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{manualReviewDecisionSummary.defer}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Blocked</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{manualReviewDecisionSummary.blocked}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Vendor follow-up</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{manualReviewDecisionSummary.vendorFollowUp}</p>
                      </div>
                    </div>
                  </SectionCard>
                ) : null}

                {priorPeriodDeferredCount > 0 ? (
                  <SectionCard
                    title="Deferred from prior review"
                    description="These rows were intentionally held back in the previous period and should be checked again before finalizing this month."
                  >
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Prior period</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{priorPeriodDeferredPeriod || "Earlier period"}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Deferred rows</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{priorPeriodDeferredCount}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Deferred ITC to revisit</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">Rs. {formatMoney(priorPeriodDeferredItc)}</p>
                      </div>
                    </div>
                  </SectionCard>
                ) : null}

                <SectionCard title="Mismatch impact" description="Latest reconciliation context captured during GSTR-3B preparation.">
                  {reconciliationImpactEntries.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {reconciliationImpactEntries.map(([key, value]) => (
                        <div key={key} className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">{formatSummaryKey(key)}</p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">{String(value ?? "—")}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No reconciliation impact captured" description="Prepare GSTR-3B after running 2B reconciliation to populate this section." />
                  )}
                </SectionCard>

                <SectionCard
                  title="Filing flow"
          description={
            activeReturn.return_type === "gstr9" || activeReturn.return_type === "gstr9c"
              ? "Follow this simple sequence: approve the annual draft, open the filing record, complete the annual filing manually, then capture the ARN."
              : "Follow this simple sequence: approve the draft, complete OTP verification, then start live filing."
          }
                >
                  {primaryFilingGuidance ? (
                    <div
                      className={`mb-4 rounded-2xl border px-4 py-4 text-sm ${
                        primaryFilingGuidance.tone === "danger"
                          ? "border-rose-200 bg-rose-50 text-rose-900"
                          : primaryFilingGuidance.tone === "warning"
                            ? "border-amber-200 bg-amber-50 text-amber-900"
                            : primaryFilingGuidance.tone === "success"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : "border-sky-200 bg-sky-50 text-sky-900"
                      }`}
                    >
                      <p
                        className={
                          primaryFilingGuidance.tone === "danger"
                            ? "font-medium text-rose-950"
                            : primaryFilingGuidance.tone === "warning"
                              ? "font-medium text-amber-950"
                              : primaryFilingGuidance.tone === "success"
                                ? "font-medium text-emerald-950"
                                : "font-medium text-sky-950"
                        }
                      >
                        {primaryFilingGuidance.title}
                      </p>
                      <p className="mt-1">{primaryFilingGuidance.description}</p>
                    </div>
                  ) : null}
                  <div className="mb-4 grid gap-3 md:grid-cols-3">
                    <div className={`rounded-2xl border px-4 py-3 text-sm ${activeReturn.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                      <p className="font-medium">1. Approval</p>
                      <p className="mt-1">{activeReturn.status === "approved" ? "Approved and ready for the OTP step." : "Approve the return before live filing can begin."}</p>
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 text-sm ${isManualAnnualFiling ? "border-sky-200 bg-sky-50 text-sky-900" : filingAuthOtpVerified ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                      <p className="font-medium">2. {isManualAnnualFiling ? "Create filing record" : "OTP verification"}</p>
                      <p className="mt-1">{isManualAnnualFiling ? (activeFiling ? "The annual filing record is open for manual tracking." : "Create the filing record to start operational tracking for this annual return.") : filingAuthOtpVerified ? "OTP accepted for this filing session." : "Request OTP, then verify it in the section below."}</p>
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 text-sm ${!startFilingDisabledReason ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                      <p className="font-medium">3. {isManualAnnualFiling ? "Manual filing & ARN" : "Live filing"}</p>
                      <p className="mt-1">
                        {startFilingDisabledReason ?? (isManualAnnualFiling ? "Use Mark filed after the annual filing is completed and ARN is available." : filingRestartReady ? "Fresh OTP verified. You can now resume the earlier filing run." : "Live filing can start now.")}
                      </p>
                    </div>
                  </div>
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
                        Boolean(startFilingDisabledReason) || startFilingMutation.isPending
                      }
                    >
                      {startFilingMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      <span className="ml-2">
                        {isManualAnnualFiling ? (activeFiling ? "Filing record opened" : "Open filing record") : filingRestartReady ? "Resume filing" : "Start filing"}
                      </span>
                    </Button>
                    {!isManualAnnualFiling ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={handleRetryFiling}
                          disabled={Boolean(retryFilingDisabledReason) || retryFilingMutation.isPending}
                        >
                          {retryFilingMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                          <span className="ml-2">Retry filing</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleResyncFiling}
                          disabled={Boolean(resyncDisabledReason) || resyncFilingMutation.isPending}
                        >
                          {resyncFilingMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Refresh status"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleRequeueAfterReview}
                          disabled={Boolean(requeueDisabledReason) || requeueAfterReviewMutation.isPending}
                        >
                          {requeueAfterReviewMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Requeue after review"}
                        </Button>
                      </>
                    ) : null}
                    <Button
                      variant="outline"
                      onClick={() => setIsMarkFiledOpen(true)}
                      disabled={activeReturn.status !== "approved" || isReturnFlowBlockedByStaleSource}
                    >
                      Mark filed
                    </Button>
                  </div>
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">When other actions unlock</p>
                    <p className="mt-1">
                      {isManualAnnualFiling
                        ? "Annual returns use a manual filing flow here. Open the filing record for operational tracking, then use Mark filed after external filing is complete and ARN is available."
                        : <>
                            <span className="font-medium text-slate-900">Retry filing</span> becomes useful only after a real filing run fails.
                            {" "}
                            <span className="font-medium text-slate-900">Refresh status</span> becomes useful after a filing run has reached the gateway.
                            {" "}
                            <span className="font-medium text-slate-900">Requeue after review</span> is reserved for controlled recovery after support review.
                          </>}
                    </p>
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
                  title="Filing progress & access"
                  description="Use this section for OTP access, current filing progress, and confirmation updates after the main filing step."
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
                    {isManualAnnualFiling ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Manual annual filing status</p>
                            <p className="mt-1 text-sm text-slate-600">
                              This annual return is tracked operationally in the app, but the final filing is completed manually outside the live gateway flow.
                            </p>
                          </div>
                          <StatusBadge label={activeFiling ? activeFiling.status.replace(/_/g, " ") : "not started"} variant={activeFiling ? getFilingStatusVariant(activeFiling.status) : "primary"} />
                        </div>

                        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
                          <p className="font-medium">Annual filing guidance</p>
                          <p className="mt-1">
                            Use <span className="font-medium">Open filing record</span> after approval to create the operational filing entry. After the annual filing is completed externally, use <span className="font-medium">Mark filed</span> to capture ARN and close the return in both backend and UI.
                          </p>
                        </div>
                      </div>
                    ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">OTP access check</p>
                          <p className="mt-1 text-sm text-slate-600">
                            This filing session is saved for the selected workspace, client, GSTIN, and provider only. If the same customer has multiple clients or GSTINs, each filing context needs its own OTP session.
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

                      <div
                        className={`mt-4 rounded-2xl border px-4 py-4 text-sm ${
                          otpAccessLatestMessage.tone === "danger"
                            ? "border-rose-200 bg-rose-50 text-rose-900"
                            : otpAccessLatestMessage.tone === "warning"
                              ? "border-amber-200 bg-amber-50 text-amber-900"
                              : otpAccessLatestMessage.tone === "success"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                : "border-sky-200 bg-sky-50 text-sky-900"
                        }`}
                      >
                        <p className="font-medium">
                          {otpAccessLatestMessage.title}
                        </p>
                        <p className="mt-1">{otpAccessLatestMessage.description}</p>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="whitebooks-txn">Session reference</Label>
                          <Input
                            id="whitebooks-txn"
                            value={whiteBooksTxn || activeWhiteBooksAuthSession?.txn || ""}
                            onChange={(event) => setWhiteBooksTxn(event.target.value)}
                            placeholder={activeWhiteBooksAuthSession?.txn || "Auto-captured when returned by the gateway"}
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
                          disabled={!canRequestOtp}
                        >
                          {requestWhiteBooksOTPMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Request OTP"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleVerifyWhiteBooksOtp}
                          disabled={!canVerifyOtp}
                        >
                          {verifyWhiteBooksOTPMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Verify OTP"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleRefreshWhiteBooksSession}
                          disabled={!canRefreshOtpSession}
                        >
                          {refreshWhiteBooksAuthSessionMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Refresh session"}
                        </Button>
                      </div>

                      {whiteBooksAuthSessionsQuery.isLoading ? (
                        <div className="mt-4">
                          <LoadingState message="Loading filing access status..." />
                        </div>
                      ) : activeWhiteBooksAuthSession ? (
                        <div className="mt-4 space-y-3">
                          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <p className="font-medium text-slate-900">Current session facts</p>
                            <p className="mt-1">
                              {activeWhiteBooksAuthSession.txn
                                ? "This saved session belongs only to the selected workspace, client, GSTIN, and provider."
                                : "The session will show a saved reference after WhiteBooks returns it for this GSTIN."}
                            </p>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-sm text-slate-500">Session reference</p>
                              <p className="mt-2 font-semibold text-slate-900">{activeWhiteBooksAuthSession.txn || "Pending"}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-sm text-slate-500">Last OTP request</p>
                              <p className="mt-2 font-semibold text-slate-900">{formatDateTime(activeWhiteBooksAuthSession.last_requested_at)}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-sm text-slate-500">Session status</p>
                              <p className="mt-2 font-semibold text-slate-900">
                                {activeWhiteBooksAuthSession.response_contract_confirmed
                                  ? "Active for this GSTIN"
                                  : filingAuthOtpVerified
                                    ? "Waiting for final confirmation"
                                    : filingAuthOtpRequested
                                      ? "Needs OTP verification"
                                      : "Not started"}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-sm text-slate-500">Session expiry</p>
                              <p className="mt-2 font-semibold text-slate-900">
                                {activeWhiteBooksAuthFreshness?.expires_at
                                  ? formatDateTime(activeWhiteBooksAuthFreshness.expires_at)
                                  : "Starts after OTP verification"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    )}

                    {!activeFiling ? (
                      <EmptyState
                        title="No filing run started"
                        description="Approve the return first, then start filing to create attempt history and status updates."
                      />
                    ) : (
                      <div className="space-y-5">
                      {activeFilingProviderStage === "draft_saved" ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          {activeFiling.return_type === "gstr3b" ? (
                            <>
                              <p className="font-medium text-amber-950">Saved to draft, offset still pending</p>
                              <p className="mt-1">
                                This GSTR-3B has been saved as a draft only. Liability offset, final filing, and ARN capture are still separate steps.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium text-amber-950">Saved to draft, not filed</p>
                              <p className="mt-1">
                                This return has been saved as a draft only. Final GST filing, ARN capture, and portal completion are still separate steps.
                              </p>
                            </>
                          )}
                        </div>
                      ) : null}

                      {activeFilingProviderStage === "proceeded_to_file" ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          <p className="font-medium text-amber-950">Proceeded in filing flow, not filed</p>
                          <p className="mt-1">
                            The filing channel has accepted the draft and the proceed-to-file step, but final GST filing automation, ARN capture, and portal completion are still pending implementation.
                          </p>
                        </div>
                      ) : null}

                      {activeFilingProviderStage === "offset_applied" ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                          <p className="font-medium text-sky-950">Offset applied in filing flow, final filing still pending</p>
                          <p className="mt-1">
                            The filing channel has accepted the GSTR-3B draft save and liability offset, but final filing and ARN capture are still pending.
                          </p>
                        </div>
                      ) : null}

                      {activeFilingProviderStage === "file_requested" ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                          {activeFiling.return_type === "gstr3b" ? (
                            <>
                              <p className="font-medium text-sky-950">GSTR-3B final filing requested, awaiting ARN or rejection status</p>
                              <p className="mt-1">
                                The filing channel accepted the GSTR-3B final filing request, but this return must still be treated as confirmation-pending until ARN or a terminal response is refreshed back.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium text-sky-950">Final filing requested, awaiting confirmation</p>
                              <p className="mt-1">
                                The filing channel accepted the final filing request, but this return should still be treated as confirmation-pending until ARN or terminal status is refreshed back.
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
                          <p className="font-medium text-slate-900">Recommended next action</p>
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
                              <p className="font-medium text-slate-900">Operator status summary</p>
                              <p className="mt-1 text-sm text-slate-600">
                                Compact operator snapshot for current filing state, guidance, proof, and intervention depth.
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
                              <p className="text-xs uppercase tracking-wide text-slate-500">Filing stage</p>
                              <p className="mt-2 font-medium text-slate-900">
                                {getProviderStageLabel((supportStatusSummary.provider_stage || "") as WhiteBooksProviderStage, activeFiling.return_type)}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Interventions</p>
                              <p className="mt-2 font-medium text-slate-900">{supportStatusSummary.intervention_count}</p>
                            </div>
                            <div className="rounded-2xl bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Snapshots available</p>
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
                              <p className="font-medium text-slate-900">Live rollout summary</p>
                              <p className="mt-1 text-sm text-slate-600">Live filing controls for this workspace, GSTIN, channel, and return type context.</p>
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
                              <p className="text-xs uppercase tracking-wide text-slate-500">Status refresh</p>
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
                          <p className="font-medium text-slate-900">Latest filing message</p>
                          <p className="mt-1">{latestProviderMessage}</p>
                        </div>
                      ) : null}

                      {latestFailureSummary ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                          <p className="font-medium text-rose-950">Latest filing issue</p>
                          <p className="mt-1">{getRecordString(latestFailureSummary, "message") || activeFiling?.latest_attempt?.failure_message || "Filing step failed."}</p>
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
                              <p className="mt-1">Session <span className="font-mono text-xs">{linkedAuthSessionId}</span></p>
                            </div>
                            <StatusBadge
                              label={isCurrentAuthSessionLinked ? "current session" : "historical session"}
                              variant={isCurrentAuthSessionLinked ? "success" : "warning"}
                            />
                          </div>
                          {!isCurrentAuthSessionLinked ? (
                            <p className="mt-3 text-sm text-slate-600">
                              The latest filing access session in this workspace is different from the one used for the saved draft. Re-verify only if you intend to continue with a new session.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {providerEvidenceSummary ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900">Filing activity snapshot</p>
                              <p className="mt-1 text-sm text-slate-600">A compact summary of the latest filing proof stored on this attempt.</p>
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
                              <p className="text-xs uppercase tracking-wide text-slate-500">Proof stored</p>
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
                          <p className="text-sm text-slate-500">Filing stage</p>
                          <div className="mt-2">
                            <StatusBadge label={getProviderStageLabel(activeFilingProviderStage, activeFiling.return_type)} variant={getProviderStageVariant(activeFilingProviderStage)} />
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">Filing channel</p>
                          <p className="mt-2 font-semibold text-slate-900">{activeFiling.provider}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">Filing reference</p>
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
                          title="Filing issue"
                          description={String(activeFiling.error_summary.message ?? activeFiling.error_summary.code ?? "A filing-side issue was recorded.")}
                        />
                      ) : null}

                      {latestSavedProviderResponse ? (
                        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <summary className="cursor-pointer list-none font-medium text-slate-900">
                            Operator snapshot: sanitized draft-save response
                          </summary>
                          <p className="mt-2 text-sm text-slate-600">
                            This payload is stored after redaction so operators can inspect the draft-save result without exposing live secrets.
                          </p>
                          <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                            {JSON.stringify(latestSavedProviderResponse, null, 2)}
                          </pre>
                        </details>
                      ) : null}

                      {latestOffsetProviderResponse ? (
                        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <summary className="cursor-pointer list-none font-medium text-slate-900">
                            Operator snapshot: sanitized offset response
                          </summary>
                          <p className="mt-2 text-sm text-slate-600">
                            This payload is stored after redaction so operators can inspect the liability-offset result without exposing live secrets.
                          </p>
                          <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                            {JSON.stringify(latestOffsetProviderResponse, null, 2)}
                          </pre>
                        </details>
                      ) : null}

                      {latestStatusProviderResponse || latestTrackProviderResponse ? (
                        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <summary className="cursor-pointer list-none font-medium text-slate-900">
                            Operator snapshot: sanitized status refresh responses
                          </summary>
                          <p className="mt-2 text-sm text-slate-600">
                            These payloads are captured during refresh so operators can inspect ARN, status, or rejection details without exposing live secrets.
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
                                    <TableHead>Filing Ref</TableHead>
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
                            <EmptyState title="No filing attempts recorded" description="Attempts will appear here after filing starts." />
                          )}
                        </div>

                        <div className="space-y-3">
                          {interventionEvents.length ? (
                            <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">Intervention history</p>
                                  <p className="mt-1 text-sm text-slate-700">
                                    Recent operator actions like refresh, retry, reviewed requeue, and filing-stage failures.
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
