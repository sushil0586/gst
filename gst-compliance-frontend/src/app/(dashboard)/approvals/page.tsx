"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useApproveApprovalMutation,
  useCreateApprovalMutation,
  useApprovalsQuery,
  useCancelApprovalMutation,
  useRejectApprovalMutation,
} from "@/features/approvals";
import { useReturnQuery, useReturnsQuery } from "@/features/returns";
import { getErrorMessage } from "@/lib/api/error-handler";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { ApprovalRequestRecord, ReturnPreparationRecord } from "@/types/api";

const statusOptions = ["all", "pending", "approved", "rejected", "cancelled"] as const;
const entityOptions = ["all", "import_batch", "reconciliation_run", "return_preparation", "compliance_period"] as const;

function formatDateTime(value?: string | null) {
  if (!value) return "Pending";
  return format(new Date(value), "dd MMM yyyy, h:mm a");
}

function statusVariant(status: ApprovalRequestRecord["status"]) {
  if (status === "approved") return "success" as const;
  if (status === "pending") return "warning" as const;
  if (status === "rejected") return "danger" as const;
  return "neutral" as const;
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

function buildApprovalRequestComments(preparedReturn: ReturnPreparationRecord) {
  const periodExceptionCount = getPeriodExceptionCountFromSummary(preparedReturn.summary_snapshot);
  const notes = [`Please review this ${preparedReturn.return_type.toUpperCase()} draft.`];
  if (periodExceptionCount > 0) {
    notes.push(`Source period exceptions: ${periodExceptionCount} row(s).`);
  }
  return notes.join(" ");
}

function formatMoney(value?: string | number | null) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getPrimaryTaxableValue(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = preparedReturn?.summary_snapshot ?? {};
  const outwardSupplies = (summary.outward_supplies as Record<string, unknown> | undefined) ?? {};
  return String(outwardSupplies.total_taxable_value ?? outwardSupplies.outward_taxable_value ?? "0.00");
}

function getPrimaryTaxAmount(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = preparedReturn?.summary_snapshot ?? {};
  const outwardSupplies = (summary.outward_supplies as Record<string, unknown> | undefined) ?? {};
  return String(outwardSupplies.total_tax_amount ?? outwardSupplies.outward_tax_liability ?? "0.00");
}

function getItcAmount(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = preparedReturn?.summary_snapshot ?? {};
  const itcSummary = (summary.itc_summary as Record<string, unknown> | undefined) ?? {};
  return String(itcSummary.claim_ready_itc ?? itcSummary.eligible_itc ?? "0.00");
}

function getNetPayable(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = preparedReturn?.summary_snapshot ?? {};
  const itcSummary = (summary.itc_summary as Record<string, unknown> | undefined) ?? {};
  return String(itcSummary.net_tax_payable ?? "0.00");
}

function getSectionMetric(summary: Record<string, unknown> | null | undefined, sectionKey: string) {
  const sections = asRecord(summary?.sections);
  const section = asRecord(sections?.[sectionKey]);
  const value =
    section?.document_count ??
    section?.row_count ??
    section?.count ??
    section?.taxable_value ??
    section?.tax_amount ??
    0;
  return Number(value || 0);
}

function hasHsnDocumentReviewSignal(summary: Record<string, unknown> | null | undefined) {
  const sections = asRecord(summary?.sections);
  const hsnSection = asRecord(sections?.hsn_summary);
  const hsnRows = asArray(hsnSection?.rows).filter((row): row is Record<string, unknown> => Boolean(asRecord(row)));
  return hsnRows.some((row) => {
    const hsnCode = String(row.hsn_code ?? "").toUpperCase();
    const uqc = String(row.uqc ?? "").trim();
    return hsnCode === "UNSPECIFIED" || uqc.length === 0;
  });
}

function chooseGstr1ReviewTab(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = preparedReturn?.summary_snapshot;
  if (getPeriodExceptionCountFromSummary(summary) > 0) return "overview";
  if (getSectionMetric(summary, "amendments") > 0) return "amendments";
  if (getSectionMetric(summary, "exports") > 0) return "exports";
  if (getSectionMetric(summary, "advances_received") > 0 || getSectionMetric(summary, "advances_adjusted") > 0) return "advances";
  if (getSectionMetric(summary, "ecommerce") > 0) return "ecommerce";
  if (hasHsnDocumentReviewSignal(summary)) return "hsn-docs";
  return "overview";
}

function buildGstr1ReviewHref(options: {
  workspaceId?: string | null;
  clientId?: string | null;
  gstinId?: string | null;
  periodId?: string | null;
  returnId?: string | null;
  returnType?: string | null;
  tab?: string | null;
}) {
  if (
    options.returnType !== "gstr1" ||
    !options.workspaceId ||
    !options.clientId ||
    !options.gstinId ||
    !options.periodId ||
    !options.returnId
  ) {
    return null;
  }

  const params = new URLSearchParams({
    workspace: options.workspaceId,
    client: options.clientId,
    gstin: options.gstinId,
    period: options.periodId,
    returnId: options.returnId,
  });
  if (options.tab) {
    params.set("tab", options.tab);
  }
  return `/returns/gstr1-review?${params.toString()}`;
}

function buildGstr3bReviewHref(options: {
  workspaceId?: string | null;
  clientId?: string | null;
  gstinId?: string | null;
  periodId?: string | null;
  returnId?: string | null;
  returnType?: string | null;
  tab?: string | null;
}) {
  if (
    options.returnType !== "gstr3b" ||
    !options.workspaceId ||
    !options.clientId ||
    !options.gstinId ||
    !options.periodId ||
    !options.returnId
  ) {
    return null;
  }

  const params = new URLSearchParams({
    workspace: options.workspaceId,
    client: options.clientId,
    gstin: options.gstinId,
    period: options.periodId,
    returnId: options.returnId,
  });
  if (options.tab) {
    params.set("tab", options.tab);
  }
  return `/returns/gstr3b-review?${params.toString()}`;
}

function buildGstr7ReviewHref(options: {
  workspaceId?: string | null;
  clientId?: string | null;
  gstinId?: string | null;
  periodId?: string | null;
  returnId?: string | null;
  returnType?: string | null;
  tab?: string | null;
}) {
  if (
    options.returnType !== "gstr7" ||
    !options.workspaceId ||
    !options.clientId ||
    !options.gstinId ||
    !options.periodId ||
    !options.returnId
  ) {
    return null;
  }

  const params = new URLSearchParams({
    workspace: options.workspaceId,
    client: options.clientId,
    gstin: options.gstinId,
    period: options.periodId,
    returnId: options.returnId,
  });
  if (options.tab) {
    params.set("tab", options.tab);
  }
  return `/returns/gstr7-review?${params.toString()}`;
}

function buildGstr9ReviewHref(options: {
  workspaceId?: string | null;
  clientId?: string | null;
  gstinId?: string | null;
  periodId?: string | null;
  returnId?: string | null;
  returnType?: string | null;
  tab?: string | null;
}) {
  if (
    (options.returnType !== "gstr9" && options.returnType !== "gstr9c") ||
    !options.workspaceId ||
    !options.clientId ||
    !options.gstinId ||
    !options.periodId ||
    !options.returnId
  ) {
    return null;
  }

  const params = new URLSearchParams({
    workspace: options.workspaceId,
    client: options.clientId,
    gstin: options.gstinId,
    period: options.periodId,
    returnId: options.returnId,
  });
  if (options.tab) {
    params.set("tab", options.tab);
  }
  return options.returnType === "gstr9c" ? `/returns/gstr9c-review?${params.toString()}` : `/returns/gstr9-review?${params.toString()}`;
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
  const summary = asRecord(preparedReturn?.summary_snapshot);
  const deducteeRows = asArray(asRecord(summary?.deductees)?.rows);
  const paymentAmount = Number(asRecord(summary?.tds_summary)?.payment_amount ?? 0);
  const tdsAmount = Number(asRecord(summary?.tds_summary)?.tds_amount ?? 0);

  if (getPeriodExceptionCountFromSummary(summary) > 0) return "warnings";
  if (paymentAmount <= 0 || tdsAmount <= 0) return "tax-summary";
  if (deducteeRows.length > 0) return "deductees";
  return "overview";
}

function chooseGstr9ReviewTab(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = (preparedReturn?.summary_snapshot as Record<string, unknown> | undefined) ?? {};
  const sourceMonths = (summary.source_months as Record<string, unknown> | undefined) ?? {};
  const warningsSummary = (summary.warnings_summary as Record<string, unknown> | undefined) ?? {};

  if (preparedReturn?.is_blocked_by_stale_reconciliation) return "exceptions";
  if (Array.isArray(sourceMonths.blocked_source_periods) && sourceMonths.blocked_source_periods.length > 0) return "exceptions";
  if (Number(warningsSummary.warning_count ?? 0) > 0) return "source-months";
  return "overview";
}

export default function ApprovalsPage() {
  const searchParams = useSearchParams();
  const { user } = useSession();
  const {
    workspaces,
    clients,
    gstins,
    periods,
    selectedWorkspaceId,
    selectedClientId,
    selectedGstinId,
    selectedPeriodId,
    setSelectedWorkspaceId,
    setSelectedClientId,
    setSelectedGstinId,
    setSelectedPeriodId,
  } = useWorkspaceContext();
  const [status, setStatus] = useState<string>("pending");
  const [entityType, setEntityType] = useState<string>("all");
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequestRecord | null>(null);
  const [previewReturnId, setPreviewReturnId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [comments, setComments] = useState("");
  const queryWorkspaceId = searchParams.get("workspace");
  const queryClientId = searchParams.get("client");
  const queryGstinId = searchParams.get("gstin");
  const queryPeriodId = searchParams.get("period") ?? searchParams.get("compliance_period");

  const filters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      period: selectedPeriodId ?? undefined,
      status: status !== "all" ? status : undefined,
      entity_type: entityType !== "all" ? entityType : undefined,
    }),
    [selectedWorkspaceId, selectedClientId, selectedPeriodId, status, entityType],
  );

  const approvalsQuery = useApprovalsQuery(filters);
  const returnsQuery = useReturnsQuery({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
  });
  const previewReturnQuery = useReturnQuery(previewReturnId ?? undefined);
  const approveMutation = useApproveApprovalMutation(filters);
  const rejectMutation = useRejectApprovalMutation(filters);
  const cancelMutation = useCancelApprovalMutation(filters);
  const createApprovalMutation = useCreateApprovalMutation(filters);
  const approvals = useMemo(() => approvalsQuery.data?.items ?? [], [approvalsQuery.data?.items]);
  const pendingApprovals = useMemo(() => approvals.filter((item) => item.status === "pending"), [approvals]);
  const existingApprovalEntityIds = useMemo(
    () => new Set(approvals.map((item) => item.entity_id)),
    [approvals],
  );
  const returns = useMemo(() => returnsQuery.data?.items ?? [], [returnsQuery.data?.items]);
  const returnsById = useMemo(
    () => new Map(returns.map((item) => [item.id, item])),
    [returns],
  );
  const approvalRequestCandidates = useMemo(() => {
    if (!(status === "all" || status === "pending")) {
      return [];
    }
    if (!(entityType === "all" || entityType === "return_preparation")) {
      return [];
    }
    return returns.filter(
      (item) => item.status === "ready_for_review" && !existingApprovalEntityIds.has(item.id),
    );
  }, [entityType, existingApprovalEntityIds, returns, status]);
  const approvalPeriodExceptionCount = useMemo(
    () =>
      approvals.reduce((total, approval) => {
        if (approval.entity_type !== "return_preparation") {
          return total;
        }
        return total + getPeriodExceptionCountFromSummary(returnsById.get(approval.entity_id)?.summary_snapshot);
      }, 0) +
      approvalRequestCandidates.reduce(
        (total, preparedReturn) => total + getPeriodExceptionCountFromSummary(preparedReturn.summary_snapshot),
        0,
      ),
    [approvalRequestCandidates, approvals, returnsById],
  );
  const queueCount = approvals.length + approvalRequestCandidates.length;
  const previewReturn = previewReturnQuery.data ?? (previewReturnId ? returnsById.get(previewReturnId) ?? null : null);
  const previewReviewHref = useMemo(() => {
    return (
      buildGstr1ReviewHref({
        workspaceId: selectedWorkspaceId,
        clientId: selectedClientId,
        gstinId: selectedGstinId,
        periodId: selectedPeriodId,
        returnId: previewReturn?.id,
        returnType: previewReturn?.return_type,
        tab: chooseGstr1ReviewTab(previewReturn),
      }) ||
      buildGstr3bReviewHref({
        workspaceId: selectedWorkspaceId,
        clientId: selectedClientId,
        gstinId: selectedGstinId,
        periodId: selectedPeriodId,
        returnId: previewReturn?.id,
        returnType: previewReturn?.return_type,
        tab: chooseGstr3bReviewTab(previewReturn),
      }) ||
      buildGstr7ReviewHref({
        workspaceId: selectedWorkspaceId,
        clientId: selectedClientId,
        gstinId: selectedGstinId,
        periodId: selectedPeriodId,
        returnId: previewReturn?.id,
        returnType: previewReturn?.return_type,
        tab: chooseGstr7ReviewTab(previewReturn),
      }) ||
      buildGstr9ReviewHref({
        workspaceId: selectedWorkspaceId,
        clientId: selectedClientId,
        gstinId: selectedGstinId,
        periodId: selectedPeriodId,
        returnId: previewReturn?.id,
        returnType: previewReturn?.return_type,
        tab: chooseGstr9ReviewTab(previewReturn),
      })
    );
  }, [
    previewReturn,
    selectedClientId,
    selectedGstinId,
    selectedPeriodId,
    selectedWorkspaceId,
  ]);

  const handleCreateApproval = async (preparedReturn: ReturnPreparationRecord) => {
    try {
      await createApprovalMutation.mutateAsync({
        workspace: preparedReturn.workspace,
        client: preparedReturn.client,
        gstin: preparedReturn.gstin,
        compliance_period: preparedReturn.compliance_period,
        entity_type: "return_preparation",
        entity_id: preparedReturn.id,
        requested_to: user?.id ?? null,
        status: "pending",
        comments: buildApprovalRequestComments(preparedReturn),
      });
      toast.success("Approval request created.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

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

  const handleAction = async () => {
    if (!selectedApproval || !actionType) return;
    try {
      if (actionType === "approve") {
        await approveMutation.mutateAsync({ approvalId: selectedApproval.id, comments });
      } else if (actionType === "reject") {
        await rejectMutation.mutateAsync({ approvalId: selectedApproval.id, comments });
      } else {
        await cancelMutation.mutateAsync({ approvalId: selectedApproval.id, comments });
      }
      toast.success(`Approval request ${actionType}d.`);
      setSelectedApproval(null);
      setActionType(null);
      setComments("");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Manage reviewer sign-off, decision history, and controlled monthly approvals before filing."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Pending"
          value={String(pendingApprovals.length + approvalRequestCandidates.length)}
          detail="Open approval requests plus ready-for-review drafts awaiting queueing."
          tone="warning"
        />
        <StatCard label="Approved" value={String(approvals.filter((item) => item.status === "approved").length)} detail="Requests cleared through the control workflow." tone="success" />
        <StatCard
          label="Period exceptions"
          value={String(approvalPeriodExceptionCount)}
          detail="Out-of-period source exceptions linked to return approvals in this queue."
          tone="danger"
        />
      </div>

      <SectionCard title="Approval filters" description="Filter the queue by workflow state and work item type.">
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => <SelectItem key={option} value={option}>{option.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Work item type" /></SelectTrigger>
            <SelectContent>
              {entityOptions.map((option) => <SelectItem key={option} value={option}>{option.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard title="Approval queue" description="Pending approvals and decision history for the selected monthly workspace context.">
        {!selectedWorkspaceId ? (
          <EmptyState title="Select a workspace first" description="Choose a workspace from the topbar to load approval requests." />
        ) : approvalsQuery.isLoading ? (
          <LoadingState message="Loading approval queue..." />
        ) : approvalsQuery.isError ? (
          <ErrorState description={getErrorMessage(approvalsQuery.error)} />
        ) : queueCount > 0 ? (
          <div className="space-y-4">
            {approvalPeriodExceptionCount > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                {approvalPeriodExceptionCount} period exception{approvalPeriodExceptionCount === 1 ? "" : "s"} {approvalPeriodExceptionCount === 1 ? "is" : "are"} linked to return approvals in this queue. Review those justifications before approving the filing pack.
              </div>
            ) : null}
            <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Work Item</TableHead>
                  <TableHead>Client / Period</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Resolved</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvalRequestCandidates.map((preparedReturn) => {
                  const periodExceptionCount = getPeriodExceptionCountFromSummary(preparedReturn.summary_snapshot);
                  const directReviewHref = buildGstr1ReviewHref({
                    workspaceId: selectedWorkspaceId,
                    clientId: selectedClientId,
                    gstinId: selectedGstinId,
                    periodId: selectedPeriodId,
                    returnId: preparedReturn.id,
                    returnType: preparedReturn.return_type,
                    tab: chooseGstr1ReviewTab(preparedReturn),
                  }) || buildGstr3bReviewHref({
                    workspaceId: selectedWorkspaceId,
                    clientId: selectedClientId,
                    gstinId: selectedGstinId,
                    periodId: selectedPeriodId,
                    returnId: preparedReturn.id,
                    returnType: preparedReturn.return_type,
                    tab: chooseGstr3bReviewTab(preparedReturn),
                  }) || buildGstr7ReviewHref({
                    workspaceId: selectedWorkspaceId,
                    clientId: selectedClientId,
                    gstinId: selectedGstinId,
                    periodId: selectedPeriodId,
                    returnId: preparedReturn.id,
                    returnType: preparedReturn.return_type,
                    tab: chooseGstr7ReviewTab(preparedReturn),
                  }) || buildGstr9ReviewHref({
                    workspaceId: selectedWorkspaceId,
                    clientId: selectedClientId,
                    gstinId: selectedGstinId,
                    periodId: selectedPeriodId,
                    returnId: preparedReturn.id,
                    returnType: preparedReturn.return_type,
                    tab: chooseGstr9ReviewTab(preparedReturn),
                  });
                  return (
                    <TableRow key={`requestable-${preparedReturn.id}`}>
                      <TableCell>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{preparedReturn.return_type.toUpperCase()} return draft</p>
                            {periodExceptionCount > 0 ? (
                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                                {periodExceptionCount} period exception{periodExceptionCount === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">{preparedReturn.id.slice(0, 8)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm text-slate-900">{preparedReturn.client_name ?? "Unknown client"}</p>
                          <p className="text-xs text-slate-500">{preparedReturn.compliance_period_label ?? "No period"}</p>
                        </div>
                      </TableCell>
                      <TableCell>{user?.full_name ?? user?.email ?? "Current user"}</TableCell>
                      <TableCell><StatusBadge label="ready for request" variant="warning" /></TableCell>
                      <TableCell>{formatDateTime(preparedReturn.created_at)}</TableCell>
                      <TableCell>Pending queue</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {directReviewHref ? (
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={directReviewHref}>
                                <ActionLabel kind="view" label="View return" />
                              </Link>
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setPreviewReturnId(preparedReturn.id)}>
                              <ActionLabel kind="view" label="View return" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCreateApproval(preparedReturn)}
                            disabled={createApprovalMutation.isPending}
                          >
                            Request approval
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {approvals.map((approval) => {
                  const preparedReturn = approval.entity_type === "return_preparation" ? returnsById.get(approval.entity_id) : null;
                  const periodExceptionCount = getPeriodExceptionCountFromSummary(preparedReturn?.summary_snapshot);
                  const directReviewHref = buildGstr1ReviewHref({
                    workspaceId: selectedWorkspaceId,
                    clientId: selectedClientId,
                    gstinId: selectedGstinId,
                    periodId: selectedPeriodId,
                    returnId: preparedReturn?.id,
                    returnType: preparedReturn?.return_type,
                    tab: chooseGstr1ReviewTab(preparedReturn),
                  }) || buildGstr3bReviewHref({
                    workspaceId: selectedWorkspaceId,
                    clientId: selectedClientId,
                    gstinId: selectedGstinId,
                    periodId: selectedPeriodId,
                    returnId: preparedReturn?.id,
                    returnType: preparedReturn?.return_type,
                    tab: chooseGstr3bReviewTab(preparedReturn),
                  }) || buildGstr7ReviewHref({
                    workspaceId: selectedWorkspaceId,
                    clientId: selectedClientId,
                    gstinId: selectedGstinId,
                    periodId: selectedPeriodId,
                    returnId: preparedReturn?.id,
                    returnType: preparedReturn?.return_type,
                    tab: chooseGstr7ReviewTab(preparedReturn),
                  }) || buildGstr9ReviewHref({
                    workspaceId: selectedWorkspaceId,
                    clientId: selectedClientId,
                    gstinId: selectedGstinId,
                    periodId: selectedPeriodId,
                    returnId: preparedReturn?.id,
                    returnType: preparedReturn?.return_type,
                    tab: chooseGstr9ReviewTab(preparedReturn),
                  });
                  return (
                    <TableRow key={approval.id}>
                      <TableCell>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{approval.entity_type.replace(/_/g, " ")}</p>
                            {periodExceptionCount > 0 ? (
                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                                {periodExceptionCount} period exception{periodExceptionCount === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">{approval.entity_id.slice(0, 8)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm text-slate-900">{approval.client_name ?? "Unknown client"}</p>
                          <p className="text-xs text-slate-500">{approval.compliance_period_label ?? "No period"}</p>
                        </div>
                      </TableCell>
                      <TableCell>{approval.requested_to_name ?? "Unassigned"}</TableCell>
                      <TableCell><StatusBadge label={approval.status} variant={statusVariant(approval.status)} /></TableCell>
                      <TableCell>{formatDateTime(approval.created_at)}</TableCell>
                      <TableCell>{formatDateTime(approval.resolved_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {preparedReturn ? (
                            directReviewHref ? (
                              <Button size="sm" variant="ghost" asChild>
                                <Link href={directReviewHref}>
                                  <ActionLabel kind="view" label="View return" />
                                </Link>
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => setPreviewReturnId(preparedReturn.id)}>
                                <ActionLabel kind="view" label="View return" />
                              </Button>
                            )
                          ) : null}
                          <Button size="sm" variant="outline" onClick={() => { setSelectedApproval(approval); setActionType("approve"); }} disabled={approval.status !== "pending"}>
                            <ActionLabel kind="approve" label="Approve" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setSelectedApproval(approval); setActionType("reject"); }} disabled={approval.status !== "pending"}>
                            <ActionLabel kind="reject" label="Reject" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedApproval(approval); setActionType("cancel"); }} disabled={approval.status !== "pending"}>
                            <ActionLabel kind="cancel" label="Cancel" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </div>
        ) : (
          <EmptyState title="No approvals found" description="Approval requests will appear here when returns or other entities are sent for review." />
        )}
      </SectionCard>

      <Dialog open={Boolean(previewReturnId)} onOpenChange={(open) => !open && setPreviewReturnId(null)}>
        <AppModalContent size="lg">
          <AppModalHeader
            title={previewReturn ? `${previewReturn.return_type.toUpperCase()} return preview` : "Return preview"}
            description={
              previewReturn
                ? `${previewReturn.client_name ?? "Client"} • ${previewReturn.gstin_value ?? ""} • ${previewReturn.compliance_period_label ?? ""}`
                : "Review the prepared return summary without leaving approvals."
            }
          />
          <AppModalBody className="space-y-6">
            {previewReturnQuery.isLoading ? (
              <LoadingState message="Loading return preview..." />
            ) : previewReturnQuery.isError ? (
              <ErrorState description={getErrorMessage(previewReturnQuery.error)} />
            ) : previewReturn ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Status</p>
                    <div className="mt-2">
                      <StatusBadge label={previewReturn.status.replace(/_/g, " ")} variant={previewReturn.status === "approved" || previewReturn.status === "filed" ? "success" : previewReturn.status === "ready_for_review" ? "warning" : "primary"} />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Taxable value</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">Rs. {formatMoney(getPrimaryTaxableValue(previewReturn))}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Tax amount</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">Rs. {formatMoney(getPrimaryTaxAmount(previewReturn))}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">{previewReturn.return_type === "gstr3b" ? "Net payable" : previewReturn.return_type === "gstr9" || previewReturn.return_type === "gstr9c" ? "Annual net payable" : "ITC impact"}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      Rs. {formatMoney(previewReturn.return_type === "gstr3b" ? getNetPayable(previewReturn) : previewReturn.return_type === "gstr9" || previewReturn.return_type === "gstr9c" ? getNetPayable(previewReturn) : getItcAmount(previewReturn))}
                    </p>
                  </div>
                </div>

                <SectionCard title="Review context" description="Key ownership, timing, and exception indicators for this draft.">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Prepared by</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{previewReturn.prepared_by_name ?? "System"}</p>
                      <p className="mt-1 text-sm text-slate-600">{formatDateTime(previewReturn.updated_at)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Period exceptions</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{getPeriodExceptionCountFromSummary(previewReturn.summary_snapshot)} linked row(s)</p>
                      <p className="mt-1 text-sm text-slate-600">Review accepted out-of-period source items before approval.</p>
                    </div>
                    {previewReturn.is_blocked_by_stale_reconciliation ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 md:col-span-2">
                        <p className="text-sm font-semibold text-rose-900">Blocked by stale reconciliation</p>
                        <p className="mt-1 text-sm leading-6 text-rose-800">
                          {previewReturn.blocking_reason || "Source imports changed after the last reconciliation run."}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </SectionCard>

                <ReturnSectionSummary
                  returnType={previewReturn.return_type}
                  summarySnapshot={previewReturn.summary_snapshot}
                  variant="compact"
                />

                {previewReviewHref ? (
                  <SectionCard
                    title={
                      previewReturn?.return_type === "gstr3b"
                        ? "Full GSTR-3B review"
                        : previewReturn?.return_type === "gstr9" || previewReturn?.return_type === "gstr9c"
                          ? "Full GSTR-9 review"
                          : "Full GSTR-1 review"
                    }
                    description="Open the complete tabbed review workspace for section-wise validation, warnings, and exceptions."
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Continue review in the dedicated workspace</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {previewReturn?.return_type === "gstr3b"
                            ? "Use the in-app GSTR-3B tabs to inspect output tax, ITC posture, reconciliation rows, CA decisions, and source purchase / 2B details."
                            : previewReturn?.return_type === "gstr9" || previewReturn?.return_type === "gstr9c"
                              ? "Use the annual review tabs to inspect totals, linked annual source context, comparison posture, and warning signals."
                              : "Use the in-app GSTR-1 tabs to inspect B2B, B2CL, B2CS, exports, advances, amendments, e-commerce, and HSN details."}
                        </p>
                      </div>
                      <Button asChild variant="outline">
                        <Link href={previewReviewHref}>
                          {previewReturn?.return_type === "gstr3b" ? "Open GSTR-3B review" : previewReturn?.return_type === "gstr9c" ? "Open GSTR-9C review" : previewReturn?.return_type === "gstr9" ? "Open GSTR-9 review" : "Open GSTR-1 review"}
                        </Link>
                      </Button>
                    </div>
                  </SectionCard>
                ) : null}

                <SectionCard title="Raw summary snapshot" description="The prepared return summary payload captured for review.">
                  <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                    {JSON.stringify(previewReturn.summary_snapshot ?? {}, null, 2)}
                  </pre>
                </SectionCard>
              </>
            ) : (
              <EmptyState title="Return preview unavailable" description="We couldn't find the selected return draft." />
            )}
          </AppModalBody>
        </AppModalContent>
      </Dialog>

      <Dialog open={Boolean(selectedApproval && actionType)} onOpenChange={(open) => !open && (setSelectedApproval(null), setActionType(null), setComments(""))}>
        <AppModalContent size="md">
          <AppModalHeader
            title={actionType ? `${actionType[0].toUpperCase()}${actionType.slice(1)} approval request` : "Approval action"}
            description="Add remarks for the review trail before you confirm this approval action."
          />
          <AppModalBody>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Work item type</Label>
                <Input value={selectedApproval?.entity_type.replace(/_/g, " ") ?? ""} disabled className="h-11 bg-slate-50" />
              </div>
              {selectedApproval?.entity_type === "return_preparation" && getPeriodExceptionCountFromSummary(returnsById.get(selectedApproval.entity_id)?.summary_snapshot) > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                  This return includes {getPeriodExceptionCountFromSummary(returnsById.get(selectedApproval.entity_id)?.summary_snapshot)} source transaction(s) accepted under a period exception. Review the justification before confirming this approval action.
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="approval-comments">Review remarks</Label>
                <Textarea
                  id="approval-comments"
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                  placeholder="Add review remarks, filing comments, or rejection reason..."
                  className="min-h-32 bg-slate-50"
                />
              </div>
            </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">
              {selectedApproval?.client_name ?? "Selected client"}{selectedApproval?.compliance_period_label ? ` • ${selectedApproval.compliance_period_label}` : ""}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => { setSelectedApproval(null); setActionType(null); setComments(""); }}>
                <ActionLabel kind="cancel" label="Cancel" />
              </Button>
              <Button onClick={handleAction} disabled={approveMutation.isPending || rejectMutation.isPending || cancelMutation.isPending}>
              {approveMutation.isPending || rejectMutation.isPending || cancelMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ActionLabel kind="confirm" label="Confirm" />}
              </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>
    </div>
  );
}
