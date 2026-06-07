"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CircleAlert, Database, GitCompareArrows, Loader2, SearchCheck } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useFetchGstr2BImportBatchMutation, useGstTransactionsQuery } from "@/features/imports";
import { useProviderAuthSessionsQuery, useRequestProviderOTPMutation, useVerifyProviderOTPMutation } from "@/features/filings";
import {
  useCreateReconciliationBooksEntryMutation,
  useCorrectReconciliationItemMutation,
  useCreateReconciliationRunMutation,
  useReconciliationItemCorrectionsQuery,
  useReconciliationRunItemsQuery,
  useReconciliationRunQuery,
  useReconciliationRunsQuery,
  useUpdateReconciliationItemMutation,
} from "@/features/reconciliation";
import { downloadFile } from "@/lib/api/download";
import { getErrorMessage } from "@/lib/api/error-handler";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { ReconciliationItemRecord } from "@/types/api";

const matchStatusOptions = [
  { value: "all", label: "All match statuses" },
  { value: "matched", label: "Matched" },
  { value: "partial_match", label: "Partial Match" },
  { value: "mismatch", label: "Mismatch" },
  { value: "missing_in_books", label: "Missing in Books" },
  { value: "missing_in_portal", label: "Missing in 2B" },
  { value: "duplicate_in_books", label: "Duplicate in Books" },
  { value: "duplicate_in_portal", label: "Duplicate in Portal" },
];

const actionStatusOptions = [
  { value: "all", label: "All action statuses" },
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "resolved", label: "Resolved" },
  { value: "deferred", label: "Deferred" },
  { value: "ignored", label: "Ignored" },
];

const reviewDecisionOptions = [
  { value: "auto", label: "Auto from reconciliation" },
  { value: "claim_now", label: "Claim now" },
  { value: "defer", label: "Defer" },
  { value: "blocked", label: "Blocked" },
  { value: "vendor_follow_up", label: "Vendor follow-up" },
];

const mismatchReasonOptions = [
  { value: "all", label: "All reasons" },
  { value: "gstin_mismatch", label: "GSTIN mismatch" },
  { value: "document_number_mismatch", label: "Document number mismatch" },
  { value: "date_mismatch", label: "Date mismatch" },
  { value: "taxable_value_mismatch", label: "Taxable mismatch" },
  { value: "tax_amount_mismatch", label: "Tax mismatch" },
  { value: "total_amount_mismatch", label: "Total mismatch" },
  { value: "duplicate_invoice", label: "Duplicate invoice" },
  { value: "missing_in_books", label: "Missing in books" },
  { value: "missing_in_portal", label: "Missing in 2B" },
];

const issueBucketOptions = [
  { value: "all", label: "All issue buckets" },
  { value: "ready", label: "Ready / matched" },
  { value: "timing_difference", label: "Timing difference" },
  { value: "vendor_follow_up", label: "Vendor follow-up" },
  { value: "books_correction", label: "Books correction" },
  { value: "value_review", label: "Value review" },
  { value: "document_review", label: "Document review" },
  { value: "duplicate_cleanup", label: "Duplicate cleanup" },
  { value: "issue_review", label: "General review" },
];

const itcStatusOptions = [
  { value: "all", label: "All ITC decisions" },
  { value: "itc_ready", label: "ITC ready" },
  { value: "itc_pending_2b", label: "Pending in 2B" },
  { value: "itc_pending_review", label: "Pending review" },
  { value: "itc_blocked", label: "Blocked" },
  { value: "itc_timing_difference", label: "Timing difference" },
  { value: "itc_vendor_followup_required", label: "Vendor follow-up required" },
];

const correctionReasonOptions = [
  { value: "books_entry_error", label: "Books entry error" },
  { value: "document_alignment", label: "Document alignment" },
  { value: "tax_amount_correction", label: "Tax amount correction" },
  { value: "vendor_clarification", label: "Vendor clarification" },
  { value: "other", label: "Other" },
];

const creationReasonOptions = [
  { value: "missing_books_entry", label: "Missing books entry" },
  { value: "late_booking", label: "Late booking" },
  { value: "portal_confirmed_booking", label: "Portal confirmed booking" },
  { value: "vendor_clarification", label: "Vendor clarification" },
  { value: "other", label: "Other" },
];

function formatDateTime(value?: string | null) {
  if (!value) return "Pending";
  return format(new Date(value), "dd MMM yyyy, h:mm a");
}

function formatMoney(value?: string | null) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function actionStatusVariant(status: ReconciliationItemRecord["action_status"]) {
  if (status === "resolved") return "success" as const;
  if (status === "assigned" || status === "deferred") return "warning" as const;
  if (status === "ignored") return "neutral" as const;
  return "primary" as const;
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

function getIssueBucket(item: ReconciliationItemRecord) {
  switch (item.issue_bucket) {
    case "ready":
      return {
        value: item.issue_bucket,
        label: "Ready / matched",
        detail: "Books and GSTR-2B align for this invoice.",
        nextAction: item.recommended_next_action || "No action needed",
        variant: "success" as const,
      };
    case "timing_difference":
      return {
        value: item.issue_bucket,
        label: "Timing difference",
        detail:
          item.period_relationship === "prior_period"
            ? "Books appear in a later period than the GST-side record."
            : item.period_relationship === "next_period"
              ? "Books appear in an earlier period than the GST-side record."
              : "Document appears across different periods and needs timing review.",
        nextAction: item.recommended_next_action || "Review period timing",
        variant: "warning" as const,
      };
    case "vendor_follow_up":
      return {
        value: item.issue_bucket,
        label: "Vendor follow-up",
        detail: "Invoice is booked in books but not reflected in GSTR-2B yet.",
        nextAction: item.recommended_next_action || "Follow up with supplier",
        variant: "danger" as const,
      };
    case "books_correction":
      return {
        value: item.issue_bucket,
        label: "Books correction",
        detail: "Invoice appears in GSTR-2B but is missing from the purchase register.",
        nextAction: item.recommended_next_action || "Check missing booking",
        variant: "primary" as const,
      };
    case "value_review":
      return {
        value: item.issue_bucket,
        label: "Value review",
        detail: "Invoice exists in both sources, but values do not agree yet.",
        nextAction: item.recommended_next_action || "Review values against source",
        variant: "warning" as const,
      };
    case "document_review":
      return {
        value: item.issue_bucket,
        label: "Document review",
        detail: "Key identity fields do not match between books and GSTR-2B.",
        nextAction: item.recommended_next_action || "Compare source invoice",
        variant: "danger" as const,
      };
    case "duplicate_cleanup":
      return {
        value: item.issue_bucket,
        label: "Duplicate cleanup",
        detail: "Potential duplicate invoice needs cleanup before return work.",
        nextAction: item.recommended_next_action || "Review and clear duplicate",
        variant: "warning" as const,
      };
    default:
      return {
        value: item.issue_bucket,
        label: "General review",
        detail: "This row needs review before it can be treated as ready.",
        nextAction: item.recommended_next_action || "Open and review",
        variant: "primary" as const,
      };
  }
}

function getItcDecision(item: ReconciliationItemRecord) {
  switch (item.itc_status) {
    case "itc_ready":
      return {
        value: item.itc_status,
        label: "ITC ready",
        detail: "This row is aligned enough for ITC confidence in the current cycle.",
        variant: "success" as const,
      };
    case "itc_pending_2b":
      return {
        value: item.itc_status,
        label: "Pending in 2B",
        detail: "Books entry exists, but the GST-side reflection is still pending.",
        variant: "warning" as const,
      };
    case "itc_timing_difference":
      return {
        value: item.itc_status,
        label: "Timing difference",
        detail: "The invoice is matching across periods and needs ITC timing review.",
        variant: "warning" as const,
      };
    case "itc_vendor_followup_required":
      return {
        value: item.itc_status,
        label: "Vendor follow-up required",
        detail: "Supplier-side action or clarification is needed before ITC is comfortable.",
        variant: "danger" as const,
      };
    case "itc_blocked":
      return {
        value: item.itc_status,
        label: "ITC blocked",
        detail: "This row should not be relied on for ITC until books or source issues are fixed.",
        variant: "danger" as const,
      };
    default:
      return {
        value: item.itc_status,
        label: "Pending review",
        detail: "The row needs review before a clean ITC decision can be made.",
        variant: "primary" as const,
      };
  }
}

function getReviewDecision(item: ReconciliationItemRecord) {
  switch (item.review_decision) {
    case "claim_now":
      return {
        label: "CA: claim now",
        detail: "A reviewer chose to include this row in the current ITC claim.",
        variant: "success" as const,
      };
    case "defer":
      return {
        label: "CA: defer",
        detail: "A reviewer chose to hold this row back from the current claim.",
        variant: "warning" as const,
      };
    case "blocked":
      return {
        label: "CA: blocked",
        detail: "A reviewer chose to keep this row out of the current ITC claim.",
        variant: "danger" as const,
      };
    case "vendor_follow_up":
      return {
        label: "CA: vendor follow-up",
        detail: "A reviewer chose to wait for supplier clarification before claiming.",
        variant: "danger" as const,
      };
    default:
      return {
        label: "Auto from reconciliation",
        detail: "No manual CA override has been applied to this row.",
        variant: "neutral" as const,
      };
  }
}

function formatCorrectionReason(value?: string | null) {
  if (!value) return "Unspecified";
  return correctionReasonOptions.find((option) => option.value === value)?.label ?? value.replace(/_/g, " ");
}

export default function ReconciliationPage() {
  const searchParams = useSearchParams();
  const { user } = useSession();
  const {
    workspaces,
    clients,
    gstins,
    periods,
    selectedWorkspaceId,
    selectedWorkspace,
    selectedClientId,
    selectedClient,
    selectedGstinId,
    selectedGstin,
    selectedPeriodId,
    selectedPeriod,
    setSelectedWorkspaceId,
    setSelectedClientId,
    setSelectedGstinId,
    setSelectedPeriodId,
  } = useWorkspaceContext();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ReconciliationItemRecord | null>(null);
  const [matchStatus, setMatchStatus] = useState("all");
  const [issueBucket, setIssueBucket] = useState("all");
  const [itcStatus, setItcStatus] = useState("all");
  const [actionStatus, setActionStatus] = useState("all");
  const [mismatchReason, setMismatchReason] = useState("all");
  const [search, setSearch] = useState("");
  const [isFetch2BAuthModalOpen, setIsFetch2BAuthModalOpen] = useState(false);
  const [pendingFetchAfterOtp, setPendingFetchAfterOtp] = useState(false);
  const [fetch2BOtp, setFetch2BOtp] = useState("");
  const queryWorkspaceId = searchParams.get("workspace");
  const queryClientId = searchParams.get("client");
  const queryGstinId = searchParams.get("gstin");
  const queryPeriodId = searchParams.get("period") ?? searchParams.get("compliance_period");
  const [actionForm, setActionForm] = useState({
    action_status: "open" as ReconciliationItemRecord["action_status"],
    review_decision: "auto" as ReconciliationItemRecord["review_decision"],
    assigned_to: "none",
    remarks: "",
  });
  const [correctionForm, setCorrectionForm] = useState({
    reason_code: "books_entry_error",
    reason_note: "",
    reference_number: "",
    transaction_date: "",
    counterparty_gstin: "",
    counterparty_name: "",
    taxable_value: "",
    cgst_amount: "",
    sgst_amount: "",
    igst_amount: "",
    cess_amount: "",
    total_amount: "",
    place_of_supply: "",
    reverse_charge: false,
  });

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

  const runFilters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      compliance_period: selectedPeriodId ?? undefined,
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId],
  );
  const runsQuery = useReconciliationRunsQuery(runFilters);
  const activeRunId = useMemo(() => {
    const runIds = new Set((runsQuery.data?.items ?? []).map((run) => run.id));
    if (selectedRunId && runIds.has(selectedRunId)) {
      return selectedRunId;
    }
    return runsQuery.data?.items[0]?.id;
  }, [selectedRunId, runsQuery.data?.items]);
  const runQuery = useReconciliationRunQuery(activeRunId ?? undefined);
  const itemsQuery = useReconciliationRunItemsQuery(activeRunId ?? undefined, {
    match_status: matchStatus !== "all" ? matchStatus : undefined,
    issue_bucket: issueBucket !== "all" ? issueBucket : undefined,
    itc_status: itcStatus !== "all" ? itcStatus : undefined,
    action_status: actionStatus !== "all" ? actionStatus : undefined,
    mismatch_reason: mismatchReason !== "all" ? mismatchReason : undefined,
    search: search || undefined,
  });
  const purchaseTransactionsQuery = useGstTransactionsQuery({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    transaction_type: "purchase",
  });
  const portalTransactionsQuery = useGstTransactionsQuery({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    transaction_type: "gstr_2b",
  });
  const createRunMutation = useCreateReconciliationRunMutation(runFilters);
  const fetchGstr2bMutation = useFetchGstr2BImportBatchMutation({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    compliance_period: selectedPeriodId ?? undefined,
  });
  const providerAuthFilters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      provider: "whitebooks" as const,
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId],
  );
  const providerAuthSessionsQuery = useProviderAuthSessionsQuery(providerAuthFilters);
  const requestProviderOTPMutation = useRequestProviderOTPMutation(providerAuthFilters);
  const verifyProviderOTPMutation = useVerifyProviderOTPMutation(providerAuthFilters);
  const updateItemMutation = useUpdateReconciliationItemMutation(activeRunId ?? undefined, {
    match_status: matchStatus !== "all" ? matchStatus : undefined,
    issue_bucket: issueBucket !== "all" ? issueBucket : undefined,
    itc_status: itcStatus !== "all" ? itcStatus : undefined,
    action_status: actionStatus !== "all" ? actionStatus : undefined,
    mismatch_reason: mismatchReason !== "all" ? mismatchReason : undefined,
    search: search || undefined,
  });
  const itemCorrectionsQuery = useReconciliationItemCorrectionsQuery(selectedItem?.id);
  const correctItemMutation = useCorrectReconciliationItemMutation(activeRunId ?? undefined, {
    match_status: matchStatus !== "all" ? matchStatus : undefined,
    issue_bucket: issueBucket !== "all" ? issueBucket : undefined,
    itc_status: itcStatus !== "all" ? itcStatus : undefined,
    action_status: actionStatus !== "all" ? actionStatus : undefined,
    mismatch_reason: mismatchReason !== "all" ? mismatchReason : undefined,
    search: search || undefined,
  });
  const createBooksEntryMutation = useCreateReconciliationBooksEntryMutation(activeRunId ?? undefined, {
    match_status: matchStatus !== "all" ? matchStatus : undefined,
    issue_bucket: issueBucket !== "all" ? issueBucket : undefined,
    itc_status: itcStatus !== "all" ? itcStatus : undefined,
    action_status: actionStatus !== "all" ? actionStatus : undefined,
    mismatch_reason: mismatchReason !== "all" ? mismatchReason : undefined,
    search: search || undefined,
  });

  const handleCreateRun = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedPeriodId) {
      toast.error("Select workspace, client, and period before running reconciliation.");
      return;
    }
    if (isPeriodLocked) {
      toast.error("This compliance period is locked. Unlock it before running reconciliation.");
      return;
    }

    if ((purchaseTransactionsQuery.data?.count ?? 0) === 0 || (portalTransactionsQuery.data?.count ?? 0) === 0) {
      toast.error("Purchase data and GSTR-2B data are both required before reconciliation can run.");
      return;
    }

    try {
      const run = await createRunMutation.mutateAsync({
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        gstin: selectedGstinId ?? undefined,
        compliance_period: selectedPeriodId,
        run_type: "gstr_2b_purchase",
      });
      setSelectedRunId(run.id);
      toast.success("Reconciliation run created.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const activeProviderAuthSession = providerAuthSessionsQuery.data?.items[0];
  const activeProviderAuthFreshness = activeProviderAuthSession?.freshness_summary;
  const activeProviderAuthReady = Boolean(
    activeProviderAuthSession?.txn &&
      activeProviderAuthSession?.response_contract_confirmed &&
      !activeProviderAuthFreshness?.is_stale,
  );
  const activeProviderAuthPending = Boolean(
    activeProviderAuthSession &&
      !activeProviderAuthReady &&
      (activeProviderAuthSession.status === "otp_requested" || activeProviderAuthSession.status === "auth_token_received"),
  );
  const canRequestFetch2BOtp = Boolean(
    selectedWorkspaceId &&
      selectedClientId &&
      selectedGstinId &&
      !requestProviderOTPMutation.isPending &&
      !verifyProviderOTPMutation.isPending,
  );
  const canVerifyFetch2BOtp = Boolean(
    activeProviderAuthSession?.id &&
      fetch2BOtp.trim() &&
      !verifyProviderOTPMutation.isPending &&
      !requestProviderOTPMutation.isPending,
  );

  const performFetchGstr2B = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
      toast.error("Select workspace, client, GSTIN, and period before fetching GSTR-2B.");
      return false;
    }

    const batch = await fetchGstr2bMutation.mutateAsync({
      workspace: selectedWorkspaceId,
      client: selectedClientId,
      gstin: selectedGstinId,
      compliance_period: selectedPeriodId,
      provider: "whitebooks",
    });
    toast.success(
      batch.transaction_count > 0
        ? `Fetched ${batch.transaction_count} GSTR-2B transaction(s) from the connected filing channel.`
        : "GSTR-2B fetched from the connected filing channel. Review the imported rows before running reconciliation.",
    );
    return true;
  };

  const openFetch2BAuthModal = (shouldContinueAfterOtp = true) => {
    setPendingFetchAfterOtp(shouldContinueAfterOtp);
    setIsFetch2BAuthModalOpen(true);
  };

  const handleFetchGstr2B = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
      toast.error("Select workspace, client, GSTIN, and period before fetching GSTR-2B.");
      return;
    }
    if (isPeriodLocked) {
      toast.error("This compliance period is locked. Unlock it before fetching GSTR-2B.");
      return;
    }

    if (!activeProviderAuthReady) {
      openFetch2BAuthModal(true);
      return;
    }

    try {
      await performFetchGstr2B();
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.toLowerCase().includes("provider auth session") || message.toLowerCase().includes("otp")) {
        openFetch2BAuthModal(true);
      }
      toast.error(getErrorMessage(error));
    }
  };

  const handleRequestFetch2BOtp = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedGstinId) {
      toast.error("Select workspace, client, and GSTIN before requesting OTP.");
      return;
    }

    try {
      const session = await requestProviderOTPMutation.mutateAsync({
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        gstin: selectedGstinId,
        provider: "whitebooks",
      });
      setFetch2BOtp("");
      toast.success(session.txn ? "OTP requested. Enter the OTP for this GSTIN to continue." : "OTP requested. Enter the OTP to continue.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleVerifyFetch2BOtp = async () => {
    if (!activeProviderAuthSession?.id) {
      toast.error("Request OTP first for this GSTIN.");
      return;
    }

    try {
      const session = await verifyProviderOTPMutation.mutateAsync({
        sessionId: activeProviderAuthSession.id,
        otp: fetch2BOtp.trim(),
        txn: activeProviderAuthSession.txn || undefined,
      });
      setFetch2BOtp("");

      if (!session.response_contract_confirmed) {
        toast.error("OTP was accepted, but this GSTIN session is still not ready. Request OTP again if the status does not refresh.");
        return;
      }

      toast.success("Verification complete for this GSTIN. Continuing GSTR-2B fetch...");
      if (pendingFetchAfterOtp) {
        const didFetch = await performFetchGstr2B();
        if (didFetch) {
          setIsFetch2BAuthModalOpen(false);
          setPendingFetchAfterOtp(false);
        }
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleSaveItemAction = async () => {
    if (!selectedItem) {
      return;
    }

    try {
      await updateItemMutation.mutateAsync({
        itemId: selectedItem.id,
        action_status: actionForm.action_status,
        review_decision: actionForm.review_decision,
        assigned_to: actionForm.assigned_to === "none" ? null : Number(actionForm.assigned_to),
        remarks: actionForm.remarks,
      });
      toast.success("Reconciliation item updated.");
      setSelectedItem(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleOpenItem = (item: ReconciliationItemRecord) => {
    setSelectedItem(item);
    setActionForm({
      action_status: item.action_status,
      review_decision: item.review_decision,
      assigned_to: item.assigned_to ? String(item.assigned_to) : "none",
      remarks: item.remarks,
    });
    setCorrectionForm({
      reason_code: item.books_transaction_snapshot ? "books_entry_error" : "missing_books_entry",
      reason_note: "",
      reference_number: item.books_transaction_snapshot?.reference_number ?? item.portal_transaction_snapshot?.reference_number ?? "",
      transaction_date: item.books_transaction_snapshot?.transaction_date ?? item.portal_transaction_snapshot?.transaction_date ?? "",
      counterparty_gstin: item.books_transaction_snapshot?.counterparty_gstin ?? item.portal_transaction_snapshot?.counterparty_gstin ?? "",
      counterparty_name: item.books_transaction_snapshot?.counterparty_name ?? item.portal_transaction_snapshot?.counterparty_name ?? "",
      taxable_value: item.books_transaction_snapshot?.taxable_value ?? item.portal_transaction_snapshot?.taxable_value ?? "",
      cgst_amount: item.books_transaction_snapshot?.cgst_amount ?? item.portal_transaction_snapshot?.cgst_amount ?? "",
      sgst_amount: item.books_transaction_snapshot?.sgst_amount ?? item.portal_transaction_snapshot?.sgst_amount ?? "",
      igst_amount: item.books_transaction_snapshot?.igst_amount ?? item.portal_transaction_snapshot?.igst_amount ?? "",
      cess_amount: item.books_transaction_snapshot?.cess_amount ?? item.portal_transaction_snapshot?.cess_amount ?? "",
      total_amount: item.books_transaction_snapshot?.total_amount ?? item.portal_transaction_snapshot?.total_amount ?? "",
      place_of_supply: item.books_transaction_snapshot?.place_of_supply ?? item.portal_transaction_snapshot?.place_of_supply ?? "",
      reverse_charge: item.books_transaction_snapshot?.reverse_charge ?? item.portal_transaction_snapshot?.reverse_charge ?? false,
    });
  };

  const handleSaveBooksCorrection = async () => {
    if (!selectedItem || !selectedItem.books_transaction_snapshot) {
      toast.error("Books correction is only available when the row already has a books transaction.");
      return;
    }

    try {
      await correctItemMutation.mutateAsync({
        itemId: selectedItem.id,
        reason_code: correctionForm.reason_code,
        reason_note: correctionForm.reason_note.trim(),
        reference_number: correctionForm.reference_number.trim(),
        transaction_date: correctionForm.transaction_date,
        counterparty_gstin: correctionForm.counterparty_gstin.trim(),
        counterparty_name: correctionForm.counterparty_name.trim(),
        taxable_value: correctionForm.taxable_value,
        cgst_amount: correctionForm.cgst_amount,
        sgst_amount: correctionForm.sgst_amount,
        igst_amount: correctionForm.igst_amount,
        cess_amount: correctionForm.cess_amount,
        total_amount: correctionForm.total_amount,
        place_of_supply: correctionForm.place_of_supply.trim(),
        reverse_charge: correctionForm.reverse_charge,
      });
      toast.success("Books correction saved. Reconciliation is rerunning with the updated books entry.");
      setSelectedItem(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleCreateBooksEntry = async () => {
    if (!selectedItem || !selectedItem.portal_transaction_snapshot) {
      toast.error("Books entry creation is only available when the row already has a portal-side transaction.");
      return;
    }

    try {
      await createBooksEntryMutation.mutateAsync({
        itemId: selectedItem.id,
        reason_code: correctionForm.reason_code,
        reason_note: correctionForm.reason_note.trim(),
        reference_number: correctionForm.reference_number.trim(),
        transaction_date: correctionForm.transaction_date,
        counterparty_gstin: correctionForm.counterparty_gstin.trim(),
        counterparty_name: correctionForm.counterparty_name.trim(),
        taxable_value: correctionForm.taxable_value,
        cgst_amount: correctionForm.cgst_amount,
        sgst_amount: correctionForm.sgst_amount,
        igst_amount: correctionForm.igst_amount,
        cess_amount: correctionForm.cess_amount,
        total_amount: correctionForm.total_amount,
        place_of_supply: correctionForm.place_of_supply.trim(),
        reverse_charge: correctionForm.reverse_charge,
      });
      toast.success("Books entry created from the reconciliation row. Reconciliation is rerunning now.");
      setSelectedItem(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const run = runQuery.data;
  const allItems = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data?.items]);
  const items = allItems;
  const issueBucketSummary = useMemo(() => {
    const summary = {
      ready: 0,
      timing_difference: 0,
      vendor_follow_up: 0,
      books_correction: 0,
      value_review: 0,
      document_review: 0,
      duplicate_cleanup: 0,
      issue_review: 0,
    };
    for (const item of allItems) {
      const bucket = getIssueBucket(item).value as keyof typeof summary;
      summary[bucket] += 1;
    }
    return summary;
  }, [allItems]);
  const itcDecisionSummary = useMemo(
    () => ({
      itc_ready: run?.itc_ready_count ?? allItems.filter((item) => item.itc_status === "itc_ready").length,
      itc_pending_2b: run?.itc_pending_2b_count ?? allItems.filter((item) => item.itc_status === "itc_pending_2b").length,
      itc_pending_review: run?.itc_pending_review_count ?? allItems.filter((item) => item.itc_status === "itc_pending_review").length,
      itc_blocked: run?.itc_blocked_count ?? allItems.filter((item) => item.itc_status === "itc_blocked").length,
      itc_timing_difference:
        run?.itc_timing_difference_count ?? allItems.filter((item) => item.itc_status === "itc_timing_difference").length,
      itc_vendor_followup_required:
        run?.itc_vendor_followup_required_count ??
        allItems.filter((item) => item.itc_status === "itc_vendor_followup_required").length,
    }),
    [allItems, run],
  );
  const reviewDecisionSummary = useMemo(
    () => ({
      auto: allItems.filter((item) => item.review_decision === "auto").length,
      claim_now: allItems.filter((item) => item.review_decision === "claim_now").length,
      defer: allItems.filter((item) => item.review_decision === "defer").length,
      blocked: allItems.filter((item) => item.review_decision === "blocked").length,
      vendor_follow_up: allItems.filter((item) => item.review_decision === "vendor_follow_up").length,
    }),
    [allItems],
  );
  const isPeriodLocked = Boolean(selectedPeriod?.is_locked);
  const hasRequiredData = (purchaseTransactionsQuery.data?.count ?? 0) > 0 && (portalTransactionsQuery.data?.count ?? 0) > 0;
  const unresolvedCount =
    (run?.partial_match_count ?? 0) +
    (run?.mismatch_count ?? 0) +
    (run?.missing_in_books_count ?? 0) +
    (run?.missing_in_portal_count ?? 0) +
    (run?.duplicate_count ?? 0);
  const staleRunCount = (runsQuery.data?.items ?? []).filter((entry) => entry.is_stale).length;
  const activeRunIsStale = Boolean(run?.is_stale);
  const staleRunMessage = run?.invalidation_reason
    ? run.invalidation_reason.replace(/_/g, " ")
    : "Source imports changed after this reconciliation run and the results now need a rerun.";
  const purchasePeriodExceptionCount = useMemo(
    () => (purchaseTransactionsQuery.data?.items ?? []).filter((transaction) => hasPeriodException(transaction.metadata)).length,
    [purchaseTransactionsQuery.data?.items],
  );
  const portalPeriodExceptionCount = useMemo(
    () => (portalTransactionsQuery.data?.items ?? []).filter((transaction) => hasPeriodException(transaction.metadata)).length,
    [portalTransactionsQuery.data?.items],
  );
  const totalPeriodExceptionCount = purchasePeriodExceptionCount + portalPeriodExceptionCount;
  const fetch2BLatestMessage = useMemo(() => {
    if (requestProviderOTPMutation.isError) {
      return {
        tone: "danger" as const,
        title: "Couldn’t request OTP",
        description: getErrorMessage(requestProviderOTPMutation.error),
      };
    }
    if (verifyProviderOTPMutation.isError) {
      return {
        tone: "danger" as const,
        title: "Couldn’t verify OTP",
        description: getErrorMessage(verifyProviderOTPMutation.error),
      };
    }
    if (providerAuthSessionsQuery.isError) {
      return {
        tone: "danger" as const,
        title: "Couldn’t load session status",
        description: getErrorMessage(providerAuthSessionsQuery.error),
      };
    }
    if (activeProviderAuthReady) {
      return {
        tone: "success" as const,
        title: "Session ready for this GSTIN",
        description: pendingFetchAfterOtp
          ? "Verification is complete. GSTR-2B can be fetched for this GSTIN now."
          : "A valid WhiteBooks session is already active for this GSTIN for up to 6 hours.",
      };
    }
    if (activeProviderAuthFreshness?.is_stale) {
      return {
        tone: "warning" as const,
        title: "Session expired for this GSTIN",
        description: activeProviderAuthFreshness.stale_reason || "Request OTP again to continue fetching GSTR-2B.",
      };
    }
    if (activeProviderAuthSession?.error_summary && Object.keys(activeProviderAuthSession.error_summary).length > 0) {
      return {
        tone: "danger" as const,
        title: "Verification is required again",
        description: String(
          activeProviderAuthSession.error_summary.message ??
            activeProviderAuthSession.error_summary.code ??
            "The current GSTR-2B access session cannot be used. Request OTP again for this GSTIN.",
        ),
      };
    }
    if (activeProviderAuthPending) {
      return {
        tone: "warning" as const,
        title: "Enter OTP to continue",
        description: "An OTP was requested for this GSTIN. Verify it to continue fetching GSTR-2B.",
      };
    }
    return {
      tone: "info" as const,
      title: "Verification needed to fetch GSTR-2B",
      description:
        "This GSTIN does not have an active WhiteBooks session right now. Request and verify OTP to continue. The session stays active only for this selected workspace, client, and GSTIN.",
    };
  }, [
    activeProviderAuthFreshness?.is_stale,
    activeProviderAuthFreshness?.stale_reason,
    activeProviderAuthPending,
    activeProviderAuthReady,
    activeProviderAuthSession?.error_summary,
    pendingFetchAfterOtp,
    providerAuthSessionsQuery.error,
    providerAuthSessionsQuery.isError,
    requestProviderOTPMutation.error,
    requestProviderOTPMutation.isError,
    verifyProviderOTPMutation.error,
    verifyProviderOTPMutation.isError,
  ]);

  const handleExport = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedPeriodId || !activeRunId) {
      toast.error("Select a reconciliation run in the active context before exporting.");
      return;
    }
    try {
      await downloadFile(
        "/exports/reconciliation/",
        {
          workspace: selectedWorkspaceId,
          client: selectedClientId,
          gstin: selectedGstinId ?? undefined,
          compliance_period: selectedPeriodId,
          run: activeRunId,
          match_status: matchStatus !== "all" ? matchStatus : undefined,
          action_status: actionStatus !== "all" ? actionStatus : undefined,
          mismatch_reason: mismatchReason !== "all" ? mismatchReason : undefined,
        },
        "reconciliation-report.xlsx",
      );
      toast.success("Reconciliation export downloaded.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="2B Reconciliation"
        description="Compare books against imported GSTR-2B transactions, review mismatches, and clear exceptions before return preparation."
        actions={[
          {
            label: fetchGstr2bMutation.isPending ? "Fetching 2B..." : "Fetch 2B from filing channel",
            onClick: handleFetchGstr2B,
            disabled: isPeriodLocked || !selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId,
          },
          { label: createRunMutation.isPending ? "Running..." : "Run Reconciliation", onClick: handleCreateRun, disabled: isPeriodLocked },
          { label: "Export XLSX", onClick: handleExport, disabled: !selectedWorkspaceId || !selectedClientId || !selectedPeriodId || !activeRunId },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel-card-hero overflow-hidden px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100">Exception workspace</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                {selectedClient?.legal_name ?? "Choose a client"}{selectedPeriod ? ` for ${selectedPeriod.period}` : ""}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-indigo-100/95">
                {hasRequiredData
                  ? "Your source inputs are in place. Run or review the latest reconciliation and push unresolved ITC issues into operator action."
                  : "This workspace needs both purchase register data and GSTR-2B data before matching can begin."}
              </p>
            </div>
            <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Run state</p>
              <p className="mt-2 text-lg font-semibold">{run ? run.status.replace(/_/g, " ") : "Awaiting first run"}</p>
              <p className="mt-2 text-sm text-indigo-100/90">
                {run ? `${unresolvedCount} unresolved item(s) in focus.` : "Start a reconciliation run once the inputs are ready."}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Books ready</p>
              <p className="mt-2 text-lg font-semibold">{purchaseTransactionsQuery.data?.count ?? 0}</p>
              <p className="mt-1 text-sm text-indigo-100/90">Purchase transactions available for matching.</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">2B ready</p>
              <p className="mt-2 text-lg font-semibold">{portalTransactionsQuery.data?.count ?? 0}</p>
              <p className="mt-1 text-sm text-indigo-100/90">Portal transactions imported into this period.</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Period state</p>
              <p className="mt-2 text-lg font-semibold">{isPeriodLocked ? "Locked" : "Open"}</p>
              <p className="mt-1 text-sm text-indigo-100/90">Matching and fixes are disabled when the period is locked.</p>
            </div>
          </div>
        </div>

        <SectionCard
          title="What operators should do next"
          description="A small high-signal summary before diving into the run tables and mismatch rows."
          variant="soft"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <div className="metric-icon-wrap bg-indigo-50 text-indigo-600 ring-indigo-100">
                <Database className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Confirm source coverage</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Both purchase and GSTR-2B inputs should be in place before reviewing output quality.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <div className="metric-icon-wrap bg-amber-50 text-amber-600 ring-amber-100">
                <GitCompareArrows className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Focus on unresolved exceptions</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Partial matches, missing invoices, and duplicates should be cleared before return preparation moves forward.
                </p>
              </div>
            </div>
            {isPeriodLocked ? (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-4">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />
                <p className="text-sm leading-6 text-rose-700">
                  The selected compliance period is locked, so this page should be used for review and audit only until the period is reopened.
                </p>
              </div>
            ) : !hasRequiredData ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <p className="text-sm leading-6 text-amber-700">
                  Upload the missing source data or fetch GSTR-2B first, then run reconciliation from this workspace.
                </p>
              </div>
            ) : activeRunIsStale || staleRunCount > 0 ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-900">Source changed after the last match run</p>
                  <p className="mt-1 text-sm leading-6 text-amber-700">
                    {activeRunIsStale
                      ? "The active reconciliation run is stale because source imports changed. Re-run reconciliation before relying on these mismatch counts for return work."
                      : `${staleRunCount} reconciliation run(s) in this context were invalidated by source import changes. Re-run reconciliation before return preparation.`}
                  </p>
                </div>
              </div>
            ) : totalPeriodExceptionCount > 0 ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-900">Period exceptions are included in the source set</p>
                  <p className="mt-1 text-sm leading-6 text-amber-700">
                    {totalPeriodExceptionCount} imported transaction{totalPeriodExceptionCount === 1 ? "" : "s"} in the current books or 2B set {totalPeriodExceptionCount === 1 ? "was" : "were"} accepted through an out-of-period override. Review those reasons before relying on this reconciliation for return work.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Current reconciliation context" description="The engine runs against the active workspace, client, GSTIN, and compliance period." variant="soft">
        <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
          <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Workspace</p><p className="mt-1 font-semibold text-slate-900">{selectedWorkspace?.name ?? "Not selected"}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Client</p><p className="mt-1 font-semibold text-slate-900">{selectedClient?.legal_name ?? "Not selected"}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">GSTIN</p><p className="mt-1 font-semibold text-slate-900">{selectedGstin?.gstin ?? "Optional"}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Period</p><p className="mt-1 font-semibold text-slate-900">{selectedPeriod?.period ?? "Not selected"}</p></div>
        </div>
        {!selectedClientId || !selectedPeriodId ? (
          <div className="mt-4">
            <EmptyState title="Select reconciliation context first" description="Choose client and compliance period from the topbar before running GSTR-2B matching." />
          </div>
        ) : isPeriodLocked ? (
          <div className="mt-4">
            <ErrorState
              title="This period is locked"
              description="Reconciliation is disabled for locked compliance periods. Unlock the period first if changes are still required."
            />
          </div>
        ) : !hasRequiredData ? (
          <div className="mt-4">
            <ErrorState
              title="Purchase and GSTR-2B data required"
              description="Upload purchase register and GSTR-2B transactions for this period, or fetch the 2B directly from the connected filing channel, before starting reconciliation."
            />
          </div>
        ) : activeRunIsStale || staleRunCount > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-950">Source imports changed after reconciliation</p>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  {activeRunIsStale ? staleRunMessage : "At least one run in this working context is stale because imports were corrected, discarded, replaced, or reprocessed."}
                </p>
                <p className="mt-2 text-sm font-medium text-amber-900">Next step: run reconciliation again before preparing or trusting downstream return work.</p>
              </div>
              <Button size="sm" onClick={handleCreateRun} disabled={createRunMutation.isPending || isPeriodLocked || !hasRequiredData}>
                {createRunMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Run again"}
              </Button>
            </div>
          </div>
        ) : totalPeriodExceptionCount > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-950">Period exceptions detected in this reconciliation context</p>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  Books rows with period exceptions: {purchasePeriodExceptionCount}. 2B rows with period exceptions: {portalPeriodExceptionCount}. Review those imported transactions before approving or filing the return.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label="ITC Ready" value={String(itcDecisionSummary.itc_ready)} detail="Rows that are aligned enough for ITC confidence." tone="success" variant="soft" icon={SearchCheck} />
        <StatCard label="Pending in 2B" value={String(itcDecisionSummary.itc_pending_2b)} detail="Booked rows still waiting for GST-side reflection." tone="warning" variant="soft" icon={GitCompareArrows} />
        <StatCard label="Timing Difference" value={String(itcDecisionSummary.itc_timing_difference)} detail="Cross-period cases that need timing review, not panic." tone="warning" variant="soft" icon={GitCompareArrows} />
        <StatCard label="Vendor Follow-up" value={String(itcDecisionSummary.itc_vendor_followup_required)} detail="Supplier-side follow-up needed before ITC is comfortable." tone="danger" variant="soft" icon={AlertTriangle} />
        <StatCard label="Pending Review" value={String(itcDecisionSummary.itc_pending_review)} detail="Rows needing amount or document review before ITC decisions." tone="primary" variant="soft" icon={Database} />
        <StatCard label="ITC Blocked" value={String(itcDecisionSummary.itc_blocked)} detail={`Blocked rows with tax exposure of Rs. ${formatMoney(run?.total_itc_at_risk)}.`} tone="danger" variant="soft" icon={CircleAlert} />
      </div>

      <SectionCard title="Run history" description="Latest reconciliation runs for the selected working context.">
        {!selectedClientId || !selectedPeriodId ? (
          <EmptyState title="Run history will appear here" description="Once a client and period are selected, recent reconciliation runs will be listed here." />
        ) : runsQuery.isLoading ? (
          <LoadingState message="Loading reconciliation runs..." />
        ) : runsQuery.isError ? (
          <ErrorState title="We couldn’t load reconciliation runs" description={getErrorMessage(runsQuery.error)} />
        ) : runsQuery.data && runsQuery.data.items.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Matched</TableHead>
                  <TableHead>Mismatch</TableHead>
                  <TableHead>ITC at Risk</TableHead>
                  <TableHead>Processed</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runsQuery.data.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{entry.run_type.replace(/_/g, " ")}</p>
                        <p className="text-xs text-slate-500">{entry.id.slice(0, 8)}</p>
                        {entry.is_stale ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusBadge label="stale source" variant="warning" />
                            <p className="text-xs text-slate-500">
                              {entry.invalidation_reason ? entry.invalidation_reason.replace(/_/g, " ") : "Source import changed after this run."}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge label={entry.is_stale ? "stale" : entry.status} variant={entry.is_stale ? "warning" : entry.status === "completed" ? "success" : entry.status === "failed" ? "danger" : "warning"} /></TableCell>
                    <TableCell>{entry.matched_count}</TableCell>
                    <TableCell>{entry.mismatch_count + entry.partial_match_count + entry.missing_in_books_count + entry.missing_in_portal_count}</TableCell>
                    <TableCell>Rs. {formatMoney(entry.total_itc_at_risk)}</TableCell>
                    <TableCell>{formatDateTime(entry.processed_at || entry.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelectedRunId(entry.id)}>
                        <ActionLabel kind="view" label="View run" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState title="No reconciliation runs yet" description="Run GSTR-2B reconciliation once purchase and 2B data are available for this period." />
        )}
      </SectionCard>

      <SectionCard title="Reconciliation issues" description="Work through supplier follow-ups, books corrections, timing differences, and value reviews from one place.">
        {!activeRunId ? (
          <EmptyState title="Select a reconciliation run" description="Choose a run from history to inspect matched, partial, missing, and duplicate items." />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Select value={issueBucket} onValueChange={setIssueBucket}>
                <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Issue bucket" /></SelectTrigger>
                <SelectContent>{issueBucketOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={itcStatus} onValueChange={setItcStatus}>
                <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="ITC decision" /></SelectTrigger>
                <SelectContent>{itcStatusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={matchStatus} onValueChange={setMatchStatus}>
                <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Match status" /></SelectTrigger>
                <SelectContent>{matchStatusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={actionStatus} onValueChange={setActionStatus}>
                <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Action status" /></SelectTrigger>
                <SelectContent>{actionStatusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={mismatchReason} onValueChange={setMismatchReason}>
                <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Reason" /></SelectTrigger>
                <SelectContent>{mismatchReasonOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search vendor, GSTIN, invoice" />

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Vendor follow-up" value={String(issueBucketSummary.vendor_follow_up)} detail="Books rows missing from GSTR-2B." tone="danger" variant="soft" icon={AlertTriangle} />
              <StatCard label="Books correction" value={String(issueBucketSummary.books_correction)} detail="GSTR-2B rows missing from books." tone="primary" variant="soft" icon={Database} />
              <StatCard label="Timing difference" value={String(issueBucketSummary.timing_difference)} detail="Cross-period or date-driven review cases." tone="warning" variant="soft" icon={GitCompareArrows} />
              <StatCard label="Value review" value={String(issueBucketSummary.value_review + issueBucketSummary.document_review + issueBucketSummary.duplicate_cleanup)} detail="Rows needing amount, document, or duplicate review." tone="warning" variant="soft" icon={CircleAlert} />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Auto decisions" value={String(reviewDecisionSummary.auto)} detail="Rows still following raw reconciliation logic." tone="primary" variant="soft" icon={SearchCheck} />
              <StatCard label="Claim now" value={String(reviewDecisionSummary.claim_now)} detail="Manual CA overrides to include ITC now." tone="success" variant="soft" icon={SearchCheck} />
              <StatCard label="Defer" value={String(reviewDecisionSummary.defer)} detail="Rows intentionally held back from this month." tone="warning" variant="soft" icon={CircleAlert} />
              <StatCard label="Blocked" value={String(reviewDecisionSummary.blocked)} detail="Rows intentionally kept out of claim." tone="danger" variant="soft" icon={AlertTriangle} />
              <StatCard label="Vendor follow-up" value={String(reviewDecisionSummary.vendor_follow_up)} detail="Rows parked for supplier clarification." tone="danger" variant="soft" icon={AlertTriangle} />
            </div>

            {itemsQuery.isLoading ? (
              <LoadingState message="Loading reconciliation items..." />
            ) : itemsQuery.isError ? (
              <ErrorState title="We couldn’t load reconciliation items" description={getErrorMessage(itemsQuery.error)} />
            ) : items.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Vendor</TableHead>
                      <TableHead>GSTIN</TableHead>
                      <TableHead>Books Invoice</TableHead>
                      <TableHead>2B Invoice</TableHead>
                      <TableHead>Books Tax</TableHead>
                      <TableHead>2B Tax</TableHead>
                      <TableHead>Difference</TableHead>
                      <TableHead>Issue Bucket</TableHead>
                      <TableHead>ITC Decision</TableHead>
                      <TableHead>Recommended Next Step</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const issue = getIssueBucket(item);
                      const itc = getItcDecision(item);
                      const reviewDecision = getReviewDecision(item);
                      return (
                      <TableRow key={item.id}>
                        <TableCell>{item.counterparty_name || "Unknown vendor"}</TableCell>
                        <TableCell>{item.counterparty_gstin || "Unavailable"}</TableCell>
                        <TableCell>{item.books_invoice || "-"}</TableCell>
                        <TableCell>{item.portal_invoice || "-"}</TableCell>
                        <TableCell>{item.books_tax ? `Rs. ${formatMoney(item.books_tax)}` : "-"}</TableCell>
                        <TableCell>{item.portal_tax ? `Rs. ${formatMoney(item.portal_tax)}` : "-"}</TableCell>
                        <TableCell>Rs. {formatMoney(item.tax_difference)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <StatusBadge label={issue.label} variant={issue.variant} />
                            <p className="text-xs text-slate-500">{issue.detail}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <StatusBadge label={itc.label} variant={itc.variant} />
                            <p className="text-xs text-slate-500">{itc.detail}</p>
                            <StatusBadge label={reviewDecision.label} variant={reviewDecision.variant} />
                          </div>
                        </TableCell>
                        <TableCell>{issue.nextAction}</TableCell>
                        <TableCell><StatusBadge label={item.action_status} variant={actionStatusVariant(item.action_status)} /></TableCell>
                        <TableCell>{item.assigned_to_name ?? "Unassigned"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleOpenItem(item)}>
                            <ActionLabel kind="review" label="Review" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )})}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState title="No items match the current filters" description="Try a broader search or a different run to inspect reconciliation output." />
            )}
          </div>
        )}
      </SectionCard>

      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <AppModalContent size="lg">
          <AppModalHeader
            title="Reconciliation issue action"
            description="Assign ownership, record remarks, and move this issue toward resolution."
          />

          <AppModalBody className="space-y-6">
            {selectedItem ? (
              <>
                <SectionCard title="Issue summary" description={selectedItem.counterparty_name || "Reconciliation item"}>
                  <div className="grid gap-4 md:grid-cols-2 text-sm">
                    <div className="space-y-3">
                      <div><span className="text-slate-500">Books invoice:</span> <span className="font-medium text-slate-900">{selectedItem.books_invoice || "-"}</span></div>
                      <div><span className="text-slate-500">2B invoice:</span> <span className="font-medium text-slate-900">{selectedItem.portal_invoice || "-"}</span></div>
                      <div><span className="text-slate-500">Issue bucket:</span> <span className="font-medium text-slate-900">{getIssueBucket(selectedItem).label}</span></div>
                      <div><span className="text-slate-500">ITC decision:</span> <span className="font-medium text-slate-900">{getItcDecision(selectedItem).label}</span></div>
                      <div><span className="text-slate-500">CA review decision:</span> <span className="font-medium text-slate-900">{getReviewDecision(selectedItem).label}</span></div>
                      <div><span className="text-slate-500">Reason:</span> <span className="font-medium text-slate-900">{selectedItem.mismatch_reason ? selectedItem.mismatch_reason.replace(/_/g, " ") : "—"}</span></div>
                    </div>
                    <div className="space-y-3">
                      <div><span className="text-slate-500">Tax difference:</span> <span className="font-medium text-slate-900">Rs. {formatMoney(selectedItem.tax_difference)}</span></div>
                      <div><span className="text-slate-500">Taxable difference:</span> <span className="font-medium text-slate-900">Rs. {formatMoney(selectedItem.taxable_difference)}</span></div>
                      <div><span className="text-slate-500">Total difference:</span> <span className="font-medium text-slate-900">Rs. {formatMoney(selectedItem.total_difference)}</span></div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">Recommended next step</p>
                    <p className="mt-1">{getIssueBucket(selectedItem).nextAction}</p>
                    <p className="mt-2 text-slate-500">{getIssueBucket(selectedItem).detail}</p>
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="font-medium text-slate-900">Current ITC position</p>
                      <p className="mt-1">{getItcDecision(selectedItem).label}</p>
                      <p className="mt-2 text-slate-500">{getItcDecision(selectedItem).detail}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusBadge label={getReviewDecision(selectedItem).label} variant={getReviewDecision(selectedItem).variant} />
                        <p className="text-xs text-slate-500">{getReviewDecision(selectedItem).detail}</p>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Correct books entry"
                  description={
                    selectedItem.books_transaction_snapshot
                      ? "Apply a controlled books-side correction, capture the reason, and rerun reconciliation from the same working context."
                      : "This row does not yet have a books transaction. Phase 1 supports correction only for existing books entries."
                  }
                >
                  {selectedItem.books_transaction_snapshot ? (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
                        <p className="font-medium">Audit-first correction flow</p>
                        <p className="mt-1">
                          The original imported values stay preserved. Your changes create an immutable correction record with before and after snapshots, then rerun reconciliation for this period.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Reason code</Label>
                          <Select value={correctionForm.reason_code} onValueChange={(value) => setCorrectionForm((current) => ({ ...current, reason_code: value }))}>
                            <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Reason code" /></SelectTrigger>
                            <SelectContent>
                              {correctionReasonOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Transaction date</Label>
                          <Input
                            type="date"
                            value={correctionForm.transaction_date}
                            onChange={(event) => setCorrectionForm((current) => ({ ...current, transaction_date: event.target.value }))}
                            className="bg-slate-50"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Reason note</Label>
                        <Textarea
                          value={correctionForm.reason_note}
                          onChange={(event) => setCorrectionForm((current) => ({ ...current, reason_note: event.target.value }))}
                          placeholder="Explain why this books-side value is being corrected and what evidence was used."
                          className="min-h-24 bg-slate-50"
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Books invoice number</Label>
                          <Input
                            value={correctionForm.reference_number}
                            onChange={(event) => setCorrectionForm((current) => ({ ...current, reference_number: event.target.value }))}
                            className="bg-slate-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Place of supply</Label>
                          <Input
                            value={correctionForm.place_of_supply}
                            onChange={(event) => setCorrectionForm((current) => ({ ...current, place_of_supply: event.target.value }))}
                            className="bg-slate-50"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Counterparty GSTIN</Label>
                          <Input
                            value={correctionForm.counterparty_gstin}
                            onChange={(event) => setCorrectionForm((current) => ({ ...current, counterparty_gstin: event.target.value.toUpperCase() }))}
                            className="bg-slate-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Counterparty name</Label>
                          <Input
                            value={correctionForm.counterparty_name}
                            onChange={(event) => setCorrectionForm((current) => ({ ...current, counterparty_name: event.target.value }))}
                            className="bg-slate-50"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Taxable value</Label>
                          <Input value={correctionForm.taxable_value} onChange={(event) => setCorrectionForm((current) => ({ ...current, taxable_value: event.target.value }))} className="bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                          <Label>CGST</Label>
                          <Input value={correctionForm.cgst_amount} onChange={(event) => setCorrectionForm((current) => ({ ...current, cgst_amount: event.target.value }))} className="bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                          <Label>SGST</Label>
                          <Input value={correctionForm.sgst_amount} onChange={(event) => setCorrectionForm((current) => ({ ...current, sgst_amount: event.target.value }))} className="bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                          <Label>IGST</Label>
                          <Input value={correctionForm.igst_amount} onChange={(event) => setCorrectionForm((current) => ({ ...current, igst_amount: event.target.value }))} className="bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                          <Label>CESS</Label>
                          <Input value={correctionForm.cess_amount} onChange={(event) => setCorrectionForm((current) => ({ ...current, cess_amount: event.target.value }))} className="bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                          <Label>Total amount</Label>
                          <Input value={correctionForm.total_amount} onChange={(event) => setCorrectionForm((current) => ({ ...current, total_amount: event.target.value }))} className="bg-slate-50" />
                        </div>
                      </div>

                      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={correctionForm.reverse_charge}
                          onChange={(event) => setCorrectionForm((current) => ({ ...current, reverse_charge: event.target.checked }))}
                        />
                        Reverse charge applies to this books row
                      </label>

                      <div className="flex justify-end">
                        <Button onClick={handleSaveBooksCorrection} disabled={correctItemMutation.isPending}>
                          {correctItemMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save books correction"}
                        </Button>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">Correction history</p>
                            <p className="mt-1 text-sm text-slate-500">The newest correction for this books transaction appears first.</p>
                          </div>
                          <StatusBadge label={`${selectedItem.corrections_count} recorded`} variant="neutral" />
                        </div>
                        <div className="mt-4 space-y-3">
                          {itemCorrectionsQuery.isLoading ? (
                            <p className="text-sm text-slate-500">Loading corrections...</p>
                          ) : itemCorrectionsQuery.data?.items.length ? (
                            itemCorrectionsQuery.data.items.slice(0, 3).map((correction) => (
                              <div key={correction.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusBadge label={formatCorrectionReason(correction.reason_code)} variant="primary" />
                                  <span className="text-slate-500">{correction.applied_by_name ?? "Unknown user"}</span>
                                  <span className="text-slate-400">•</span>
                                  <span className="text-slate-500">{formatDateTime(correction.applied_at)}</span>
                                </div>
                                <p className="mt-2 text-slate-700">{correction.reason_note}</p>
                                <p className="mt-2 text-xs text-slate-500">
                                  Changed fields: {correction.changed_fields.length ? correction.changed_fields.join(", ") : "No field list recorded"}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">No books corrections recorded for this transaction yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                        <p className="font-medium">Create books entry from portal evidence</p>
                        <p className="mt-1">
                          This row exists in GSTR-2B but is missing in books. Use the portal details as your starting point, explain why the books entry is being created, and rerun reconciliation immediately after save.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Reason code</Label>
                          <Select value={correctionForm.reason_code} onValueChange={(value) => setCorrectionForm((current) => ({ ...current, reason_code: value }))}>
                            <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Reason code" /></SelectTrigger>
                            <SelectContent>
                              {creationReasonOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Transaction date</Label>
                          <Input
                            type="date"
                            value={correctionForm.transaction_date}
                            onChange={(event) => setCorrectionForm((current) => ({ ...current, transaction_date: event.target.value }))}
                            className="bg-slate-50"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Reason note</Label>
                        <Textarea
                          value={correctionForm.reason_note}
                          onChange={(event) => setCorrectionForm((current) => ({ ...current, reason_note: event.target.value }))}
                          placeholder="Explain why the books entry is being created and what evidence was checked."
                          className="min-h-24 bg-slate-50"
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Books invoice number</Label>
                          <Input
                            value={correctionForm.reference_number}
                            onChange={(event) => setCorrectionForm((current) => ({ ...current, reference_number: event.target.value }))}
                            className="bg-slate-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Place of supply</Label>
                          <Input
                            value={correctionForm.place_of_supply}
                            onChange={(event) => setCorrectionForm((current) => ({ ...current, place_of_supply: event.target.value }))}
                            className="bg-slate-50"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Counterparty GSTIN</Label>
                          <Input
                            value={correctionForm.counterparty_gstin}
                            onChange={(event) => setCorrectionForm((current) => ({ ...current, counterparty_gstin: event.target.value.toUpperCase() }))}
                            className="bg-slate-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Counterparty name</Label>
                          <Input
                            value={correctionForm.counterparty_name}
                            onChange={(event) => setCorrectionForm((current) => ({ ...current, counterparty_name: event.target.value }))}
                            className="bg-slate-50"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Taxable value</Label>
                          <Input value={correctionForm.taxable_value} onChange={(event) => setCorrectionForm((current) => ({ ...current, taxable_value: event.target.value }))} className="bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                          <Label>CGST</Label>
                          <Input value={correctionForm.cgst_amount} onChange={(event) => setCorrectionForm((current) => ({ ...current, cgst_amount: event.target.value }))} className="bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                          <Label>SGST</Label>
                          <Input value={correctionForm.sgst_amount} onChange={(event) => setCorrectionForm((current) => ({ ...current, sgst_amount: event.target.value }))} className="bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                          <Label>IGST</Label>
                          <Input value={correctionForm.igst_amount} onChange={(event) => setCorrectionForm((current) => ({ ...current, igst_amount: event.target.value }))} className="bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                          <Label>CESS</Label>
                          <Input value={correctionForm.cess_amount} onChange={(event) => setCorrectionForm((current) => ({ ...current, cess_amount: event.target.value }))} className="bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                          <Label>Total amount</Label>
                          <Input value={correctionForm.total_amount} onChange={(event) => setCorrectionForm((current) => ({ ...current, total_amount: event.target.value }))} className="bg-slate-50" />
                        </div>
                      </div>

                      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={correctionForm.reverse_charge}
                          onChange={(event) => setCorrectionForm((current) => ({ ...current, reverse_charge: event.target.checked }))}
                        />
                        Reverse charge applies to this books row
                      </label>

                      <div className="flex justify-end">
                        <Button onClick={handleCreateBooksEntry} disabled={createBooksEntryMutation.isPending}>
                          {createBooksEntryMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Create books entry"}
                        </Button>
                      </div>
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Update action" description="Assignee selection is currently limited to the signed-in user for this build.">
                  <div className="space-y-4">
                    <Select
                      value={actionForm.review_decision}
                      onValueChange={(value) =>
                        setActionForm((current) => ({ ...current, review_decision: value as ReconciliationItemRecord["review_decision"] }))
                      }
                    >
                      <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="CA review decision" /></SelectTrigger>
                      <SelectContent>
                        {reviewDecisionOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    <Select value={actionForm.assigned_to} onValueChange={(value) => setActionForm((current) => ({ ...current, assigned_to: value }))}>
                      <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Assigned to" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {user ? <SelectItem value={String(user.id)}>{user.full_name}</SelectItem> : null}
                      </SelectContent>
                    </Select>

                    <Select
                      value={actionForm.action_status}
                      onValueChange={(value) =>
                        setActionForm((current) => ({ ...current, action_status: value as ReconciliationItemRecord["action_status"] }))
                      }
                    >
                      <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Action status" /></SelectTrigger>
                      <SelectContent>
                        {actionStatusOptions
                          .filter((option) => option.value !== "all")
                          .map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    <Textarea
                      value={actionForm.remarks}
                      onChange={(event) => setActionForm((current) => ({ ...current, remarks: event.target.value }))}
                      placeholder="Add follow-up notes, vendor comments, or resolution detail..."
                      className="min-h-28 bg-slate-50"
                    />

                    <div className="flex justify-end">
                      <Button onClick={handleSaveItemAction} disabled={updateItemMutation.isPending}>
                        {updateItemMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save action"}
                      </Button>
                    </div>
                  </div>
                </SectionCard>
              </>
            ) : null}
          </AppModalBody>
        </AppModalContent>
      </Dialog>

      <Dialog
        open={isFetch2BAuthModalOpen}
        onOpenChange={(open) => {
          setIsFetch2BAuthModalOpen(open);
          if (!open) {
            setPendingFetchAfterOtp(false);
            setFetch2BOtp("");
          }
        }}
      >
        <AppModalContent size="md">
          <AppModalHeader
            title="Verification needed to fetch GSTR-2B"
            description={`Use OTP for ${selectedClient?.legal_name ?? "the selected client"}${selectedGstin?.gstin ? ` • ${selectedGstin.gstin}` : ""}. This session is saved only for the selected workspace, client, GSTIN, and provider.`}
          />

          <AppModalBody className="space-y-5">
            <div
              className={`rounded-2xl border px-4 py-4 text-sm ${
                fetch2BLatestMessage.tone === "danger"
                  ? "border-rose-200 bg-rose-50 text-rose-900"
                  : fetch2BLatestMessage.tone === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : fetch2BLatestMessage.tone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-sky-200 bg-sky-50 text-sky-900"
              }`}
            >
              <p className="font-medium">{fetch2BLatestMessage.title}</p>
              <p className="mt-1">{fetch2BLatestMessage.description}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className={`rounded-2xl border px-4 py-3 text-sm ${activeProviderAuthSession?.last_requested_at ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                <p className="font-medium">1. Request OTP</p>
                <p className="mt-1">{activeProviderAuthSession?.last_requested_at ? "OTP requested for this GSTIN." : "Send OTP to the configured WhiteBooks contact email."}</p>
              </div>
              <div className={`rounded-2xl border px-4 py-3 text-sm ${activeProviderAuthSession?.verified_at ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                <p className="font-medium">2. Verify OTP</p>
                <p className="mt-1">{activeProviderAuthSession?.verified_at ? "OTP verified for this GSTIN." : "Enter the OTP exactly as received."}</p>
              </div>
              <div className={`rounded-2xl border px-4 py-3 text-sm ${activeProviderAuthReady ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                <p className="font-medium">3. Fetch GSTR-2B</p>
                <p className="mt-1">{activeProviderAuthReady ? "Verification complete. GSTR-2B can be fetched now." : "Fetch continues automatically after verification succeeds."}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fetch2b-whitebooks-txn">Session reference</Label>
                <Input
                  id="fetch2b-whitebooks-txn"
                  readOnly
                  value={activeProviderAuthSession?.txn || ""}
                  placeholder="Auto-captured when returned by the gateway"
                  className="h-11 bg-slate-50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fetch2b-whitebooks-otp">OTP</Label>
                <Input
                  id="fetch2b-whitebooks-otp"
                  value={fetch2BOtp}
                  onChange={(event) => setFetch2BOtp(event.target.value)}
                  placeholder="Enter OTP"
                  className="h-11 bg-slate-50"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Session reference</p>
                <p className="mt-2 font-semibold text-slate-900">{activeProviderAuthSession?.txn || "Pending"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Last OTP request</p>
                <p className="mt-2 font-semibold text-slate-900">{formatDateTime(activeProviderAuthSession?.last_requested_at)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Session status</p>
                <p className="mt-2 font-semibold text-slate-900">
                  {activeProviderAuthReady
                    ? "Active for this GSTIN"
                    : activeProviderAuthFreshness?.is_stale
                      ? "Expired"
                      : activeProviderAuthPending
                        ? "Needs OTP verification"
                        : "Not started"}
                </p>
              </div>
            </div>
          </AppModalBody>

          <AppModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsFetch2BAuthModalOpen(false);
                setPendingFetchAfterOtp(false);
                setFetch2BOtp("");
              }}
            >
              Close
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleRequestFetch2BOtp} disabled={!canRequestFetch2BOtp}>
                {requestProviderOTPMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Request OTP"}
              </Button>
              <Button onClick={handleVerifyFetch2BOtp} disabled={!canVerifyFetch2BOtp}>
                {verifyProviderOTPMutation.isPending || fetchGstr2bMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Verify OTP and continue"}
              </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>
    </div>
  );
}
