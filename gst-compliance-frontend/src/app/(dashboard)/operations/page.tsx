"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Loader2, RefreshCcw, ShieldAlert, Siren, TimerReset, Waypoints } from "lucide-react";
import { toast } from "sonner";

import { AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from "@/components/common/app-modal";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ActionLabel } from "@/components/common/action-label";
import { ReturnSectionSummary } from "@/components/common/return-section-summary";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useEscalateFilingAlertsMutation, useFilingOperationsQuery, useRequeueAfterReviewMutation, useResyncFilingMutation, useRetryFilingMutation } from "@/features/filings";
import { useReturnQuery } from "@/features/returns";
import { getErrorMessage } from "@/lib/api/error-handler";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { ReturnFilingOperationsRecord, ReturnPreparationRecord } from "@/types/api";

const statusOptions = ["all", "submitted", "needs_retry", "failed", "queued_for_filing"] as const;
const returnTypeOptions = ["all", "gstr1", "gstr3b"] as const;
const scopeOptions = ["workspace_open", "include_resolved"] as const;

function formatDateTime(value?: string | null) {
  if (!value) return "Pending";
  return format(new Date(value), "dd MMM yyyy, h:mm a");
}

function getFilingStatusVariant(status: string) {
  if (status === "filed" || status === "arn_received") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "needs_retry" || status === "submitted" || status === "queued_for_filing") return "warning" as const;
  return "primary" as const;
}

function getRecommendedActionVariant(action: string, hasProviderFailure: boolean) {
  if (hasProviderFailure) return "danger" as const;
  if (action === "resync_status" || action === "retry_filing" || action === "review_rollout_controls") return "warning" as const;
  return "primary" as const;
}

function getProviderStageLabel(stage: string, returnType: ReturnFilingOperationsRecord["return_type"]) {
  if (stage === "draft_saved") {
    return returnType === "gstr3b" ? "draft saved, awaiting offset" : "draft saved";
  }
  if (stage === "offset_applied") return "offset applied";
  if (stage === "proceeded_to_file") return "proceeded to file";
  if (stage === "file_requested") return returnType === "gstr3b" ? "final filing requested, awaiting ARN" : "file requested";
  if (stage === "sandbox_submitted") return "sandbox submitted";
  if (stage === "submitted") return "submitted";
  return "pending";
}

function getEvidenceLabels(filing: ReturnFilingOperationsRecord) {
  return [
    filing.support_status_summary.evidence_flags.save_response ? "save" : null,
    filing.support_status_summary.evidence_flags.offset_response ? "offset" : null,
    filing.support_status_summary.evidence_flags.proceed_response ? "proceed" : null,
    filing.support_status_summary.evidence_flags.file_response ? "file" : null,
    filing.support_status_summary.evidence_flags.status_response ? "status" : null,
    filing.support_status_summary.evidence_flags.track_response ? "track" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function formatMoney(value?: string | number | null) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function chooseGstr9ReviewTab(preparedReturn?: ReturnPreparationRecord | null) {
  const summary = (preparedReturn?.summary_snapshot as Record<string, unknown> | undefined) ?? {};
  const sourceMonths = (summary.source_months as Record<string, unknown> | undefined) ?? {};
  const warningsSummary = (summary.warnings_summary as Record<string, unknown> | undefined) ?? {};

  if (preparedReturn?.is_blocked_by_stale_reconciliation) return "exceptions";
  if (Array.isArray(sourceMonths.blocked_source_periods) && sourceMonths.blocked_source_periods.length > 0) return "exceptions";
  if (Number(warningsSummary.warning_count ?? 0) > 0) return "source-months";
  return "overview";
}

export default function OperationsPage() {
  const { selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId } = useWorkspaceContext();
  const [status, setStatus] = useState<string>("all");
  const [returnType, setReturnType] = useState<string>("all");
  const [scope, setScope] = useState<string>("workspace_open");
  const [selectedRequeueFiling, setSelectedRequeueFiling] = useState<ReturnFilingOperationsRecord | null>(null);
  const [requeueComments, setRequeueComments] = useState("");
  const [expandedFilingId, setExpandedFilingId] = useState<string | null>(null);
  const [previewReturnId, setPreviewReturnId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      compliance_period: selectedPeriodId ?? undefined,
      status: status !== "all" ? status : undefined,
      return_type: returnType !== "all" ? returnType : undefined,
      include_resolved: scope === "include_resolved" ? "true" : undefined,
      page_size: "20",
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId, scope, status, returnType],
  );

  const operationsQuery = useFilingOperationsQuery(filters);
  const previewReturnQuery = useReturnQuery(previewReturnId ?? undefined);
  const retryFilingMutation = useRetryFilingMutation(filters);
  const resyncFilingMutation = useResyncFilingMutation(filters);
  const requeueAfterReviewMutation = useRequeueAfterReviewMutation(filters);
  const escalateFilingAlertsMutation = useEscalateFilingAlertsMutation(filters);
  const operations = useMemo(
    () => operationsQuery.data?.items ?? [],
    [operationsQuery.data?.items],
  );
  const previewReviewHref = useMemo(() => {
    return (
      buildGstr1ReviewHref({
        workspaceId: selectedWorkspaceId,
        clientId: selectedClientId,
        gstinId: selectedGstinId,
        periodId: selectedPeriodId,
        returnId: previewReturnQuery.data?.id,
        returnType: previewReturnQuery.data?.return_type,
        tab: "overview",
      }) ||
      buildGstr3bReviewHref({
        workspaceId: selectedWorkspaceId,
        clientId: selectedClientId,
        gstinId: selectedGstinId,
        periodId: selectedPeriodId,
        returnId: previewReturnQuery.data?.id,
        returnType: previewReturnQuery.data?.return_type,
        tab: chooseGstr3bReviewTab(previewReturnQuery.data),
      }) ||
      buildGstr9ReviewHref({
        workspaceId: selectedWorkspaceId,
        clientId: selectedClientId,
        gstinId: selectedGstinId,
        periodId: selectedPeriodId,
        returnId: previewReturnQuery.data?.id,
        returnType: previewReturnQuery.data?.return_type,
        tab: chooseGstr9ReviewTab(previewReturnQuery.data),
      })
    );
  }, [
    previewReturnQuery.data,
    selectedClientId,
    selectedGstinId,
    selectedPeriodId,
    selectedWorkspaceId,
  ]);

  const stats = useMemo(() => {
    const needsRetry = operations.filter((item) => item.support_status_summary.recommended_action === "retry_filing").length;
    const resync = operations.filter((item) => item.support_status_summary.recommended_action === "resync_status").length;
    const review = operations.filter((item) => ["review_provider_error", "review_rollout_controls"].includes(item.support_status_summary.recommended_action)).length;
    return { needsRetry, resync, review };
  }, [operations]);

  const handleRetryFiling = async (filing: ReturnFilingOperationsRecord) => {
    try {
      await retryFilingMutation.mutateAsync({
        filingId: filing.id,
        comments: "Retry requested from filing operations workspace.",
      });
      toast.success("Filing retry started.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleResyncFiling = async (filing: ReturnFilingOperationsRecord) => {
    try {
      await resyncFilingMutation.mutateAsync(filing.id);
      toast.success("Filing status resynced.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleEscalateAlerts = async (filing: ReturnFilingOperationsRecord) => {
    try {
      await escalateFilingAlertsMutation.mutateAsync({
        filingId: filing.id,
        comments: "Escalated from operations workspace for routed support follow-up.",
      });
      toast.success("Operational alerts escalated.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleRequeueAfterReview = async () => {
    if (!selectedRequeueFiling) return;
    try {
      await requeueAfterReviewMutation.mutateAsync({
        filingId: selectedRequeueFiling.id,
        comments: requeueComments.trim() || "Requeued after support review from filing operations workspace.",
      });
      toast.success("Filing requeued after review.");
      setSelectedRequeueFiling(null);
      setRequeueComments("");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Filing Operations"
        description="Operator filing queue for unresolved filing states, intervention depth, proof coverage, and recommended next actions."
        actions={[{ label: "Open Follow-ups", href: "/operations/follow-ups" }]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel-card-hero overflow-hidden px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100">Operations command desk</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">Unresolved filing states in one queue</h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-indigo-100/95">
                This workspace is for operational intervention only: retrying safe failures, refreshing filing status, and escalating filing issues with preserved proof.
              </p>
            </div>
            <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Active queue</p>
              <p className="mt-2 text-lg font-semibold">{operations.length} filing(s)</p>
              <p className="mt-2 text-sm text-indigo-100/90">
                {scope === "include_resolved" ? "Resolved items included in view." : "Open queue only."}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Retry path</p>
              <p className="mt-2 text-lg font-semibold">{stats.needsRetry}</p>
              <p className="mt-1 text-sm text-indigo-100/90">Safe retry candidates after review.</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Status refresh</p>
              <p className="mt-2 text-lg font-semibold">{stats.resync}</p>
              <p className="mt-1 text-sm text-indigo-100/90">Filings waiting on confirmation.</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Manual review</p>
              <p className="mt-2 text-lg font-semibold">{stats.review}</p>
              <p className="mt-1 text-sm text-indigo-100/90">Failures that need operator judgment before replay.</p>
            </div>
          </div>
        </div>

        <SectionCard
          title="Operations workflow"
          description="Keep actions disciplined so proof and incident history stay clean."
          variant="soft"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <div className="metric-icon-wrap bg-indigo-50 text-indigo-600 ring-indigo-100">
                <RefreshCcw className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Retry only safe failures</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Use retry only when the system explicitly marks the run as safe to replay.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <div className="metric-icon-wrap bg-amber-50 text-amber-600 ring-amber-100">
                <Waypoints className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Refresh before escalating</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">If the filing may already be processing, refresh status before duplicating actions.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <div className="metric-icon-wrap bg-rose-50 text-rose-600 ring-rose-100">
                <ShieldAlert className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Preserve the review trail</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Requeue and incident notes should explain what was checked and why the next action is safe.</p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Retry Recommended" value={String(stats.needsRetry)} detail="Filings marked as safe to retry after operational review." tone="warning" variant="soft" icon={RefreshCcw} />
        <StatCard label="Refresh Recommended" value={String(stats.resync)} detail="Filings awaiting ARN or status confirmation before another action." tone="primary" variant="soft" icon={TimerReset} />
        <StatCard label="Review Required" value={String(stats.review)} detail="Filing issues that need operator review before any replay or requeue." tone="danger" variant="soft" icon={Siren} />
      </div>

      <SectionCard title="Operations filters" description="Focus the operations queue by filing state, return type, and whether resolved items should remain visible." variant="soft">
        <div className="grid gap-3 md:grid-cols-3">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Filing status" /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => <SelectItem key={option} value={option}>{option.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={returnType} onValueChange={setReturnType}>
            <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Return type" /></SelectTrigger>
            <SelectContent>
              {returnTypeOptions.map((option) => <SelectItem key={option} value={option}>{option.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Scope" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={scopeOptions[0]}>Open queue only</SelectItem>
              <SelectItem value={scopeOptions[1]}>Include resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard
        title="Operations queue"
        description="Curated filing operations feed with recommended next steps and proof coverage."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/returns">
              <ActionLabel kind="open" label="Open Returns workspace" />
            </Link>
          </Button>
        }
      >
        {!selectedWorkspaceId ? (
          <EmptyState title="Select a workspace first" description="Choose a workspace from the topbar to load unresolved filing operations." />
        ) : operationsQuery.isLoading ? (
          <LoadingState message="Loading filing operations..." />
        ) : operationsQuery.isError ? (
          <ErrorState description={getErrorMessage(operationsQuery.error)} />
        ) : operations.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Client / Return</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Filing Stage</TableHead>
                  <TableHead>Recommended</TableHead>
                  <TableHead>Interventions</TableHead>
                  <TableHead>Proof</TableHead>
                  <TableHead>Last Refresh</TableHead>
                  <TableHead>Inspect</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operations.map((filing) => {
                  const directReviewHref = buildGstr1ReviewHref({
                    workspaceId: selectedWorkspaceId,
                    clientId: selectedClientId,
                    gstinId: selectedGstinId,
                    periodId: selectedPeriodId,
                    returnId: filing.prepared_return,
                    returnType: filing.return_type,
                    tab: "overview",
                  }) || buildGstr3bReviewHref({
                    workspaceId: selectedWorkspaceId,
                    clientId: selectedClientId,
                    gstinId: selectedGstinId,
                    periodId: selectedPeriodId,
                    returnId: filing.prepared_return,
                    returnType: filing.return_type,
                    tab: "overview",
                  }) || buildGstr9ReviewHref({
                    workspaceId: selectedWorkspaceId,
                    clientId: selectedClientId,
                    gstinId: selectedGstinId,
                    periodId: selectedPeriodId,
                    returnId: filing.prepared_return,
                    returnType: filing.return_type,
                    tab: "overview",
                  });

                  return (
                  <Fragment key={filing.id}>
                    <TableRow>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{filing.client_name ?? "Unknown client"} • {filing.return_type.toUpperCase()}</p>
                          <p className="text-xs text-slate-500">{filing.gstin_value ?? "No GSTIN"} • {filing.compliance_period_label ?? "No period"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={filing.status.replace(/_/g, " ")} variant={getFilingStatusVariant(filing.status)} />
                      </TableCell>
                      <TableCell>{getProviderStageLabel(filing.support_status_summary.provider_stage || "", filing.return_type)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={filing.support_status_summary.recommended_action.replace(/_/g, " ")}
                          variant={getRecommendedActionVariant(
                            filing.support_status_summary.recommended_action,
                            filing.support_status_summary.has_provider_failure,
                          )}
                        />
                      </TableCell>
                      <TableCell>{filing.support_status_summary.intervention_count}</TableCell>
                      <TableCell>{getEvidenceLabels(filing) || "None"}</TableCell>
                      <TableCell>{formatDateTime(filing.last_status_sync_at)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedFilingId((current) => (current === filing.id ? null : filing.id))}
                        >
                          {expandedFilingId === filing.id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetryFiling(filing)}
                            disabled={
                              !filing.support_actions_summary.actions.find((action) => action.action === "retry")?.allowed ||
                              retryFilingMutation.isPending
                            }
                          >
                            {retryFilingMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResyncFiling(filing)}
                            disabled={
                              !filing.support_actions_summary.actions.find((action) => action.action === "resync")?.allowed ||
                              resyncFilingMutation.isPending
                            }
                          >
                            {resyncFilingMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Resync"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedRequeueFiling(filing);
                              setRequeueComments("");
                            }}
                            disabled={
                              !filing.support_actions_summary.actions.find((action) => action.action === "requeue_after_review")?.allowed ||
                              requeueAfterReviewMutation.isPending
                            }
                          >
                            {requeueAfterReviewMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Requeue"}
                          </Button>
                          {directReviewHref ? (
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={directReviewHref}>
                                <ActionLabel kind="view" label="View return" />
                              </Link>
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setPreviewReturnId(filing.prepared_return)}>
                              <ActionLabel kind="view" label="View return" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedFilingId === filing.id ? (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-slate-50">
                          <div className="grid gap-4 p-4 xl:grid-cols-[1.05fr_0.95fr]">
                            <div className="space-y-4">
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-sm font-semibold text-slate-900">Operator status summary</p>
                                <p className="mt-2 text-sm text-slate-700">{filing.support_status_summary.summary_reason || "No workflow guidance recorded yet."}</p>
                                {filing.support_status_summary.latest_message ? (
                                  <p className="mt-2 text-sm text-slate-600">{filing.support_status_summary.latest_message}</p>
                                ) : null}
                                {filing.return_type === "gstr3b" && filing.support_status_summary.provider_stage === "draft_saved" ? (
                                  <p className="mt-2 text-sm text-slate-600">
                                    This GSTR-3B is saved at draft stage only. Liability offset and final filing are still pending.
                                  </p>
                                ) : null}
                                {filing.return_type === "gstr3b" && filing.support_status_summary.provider_stage === "offset_applied" ? (
                                  <p className="mt-2 text-sm text-slate-600">
                                    This GSTR-3B has completed offset. Final filing is still pending.
                                  </p>
                                ) : null}
                                {filing.return_type === "gstr3b" && filing.support_status_summary.provider_stage === "file_requested" ? (
                                  <p className="mt-2 text-sm text-slate-600">
                                    This GSTR-3B has sent the final filing request. Keep it in confirmation-pending state until ARN or a terminal rejection is refreshed back.
                                  </p>
                                ) : null}
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-sm font-semibold text-slate-900">Filing activity snapshot</p>
                                <p className="mt-2 text-sm text-slate-600">
                                  Stage: {getProviderStageLabel(filing.provider_evidence_summary.provider_stage || "", filing.return_type)}
                                </p>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  <div className="rounded-2xl bg-slate-50 p-3">
                                      <p className="text-xs uppercase tracking-wide text-slate-500">Steps completed</p>
                                    <p className="mt-2 text-sm font-medium text-slate-900">
                                      {filing.provider_evidence_summary.operations_completed.join(", ") || "None"}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl bg-slate-50 p-3">
                                      <p className="text-xs uppercase tracking-wide text-slate-500">Steps failed</p>
                                    <p className="mt-2 text-sm font-medium text-slate-900">
                                      {filing.provider_evidence_summary.operations_failed.join(", ") || "None"}
                                    </p>
                                  </div>
                                </div>
                                {filing.provider_evidence_summary.latest_failure?.message ? (
                                  <p className="mt-3 text-sm text-rose-700">
                                    Issue: {filing.provider_evidence_summary.latest_failure.message}
                                    {filing.provider_evidence_summary.latest_failure.code ? ` (${filing.provider_evidence_summary.latest_failure.code})` : ""}
                                  </p>
                                ) : null}
                              </div>
                              {filing.operational_alerts.length ? (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-amber-950">Operational alerts</p>
                                      {filing.alert_routing_summary?.recipients?.length ? (
                                        <p className="mt-1 text-xs text-amber-800">
                                          {filing.alert_routing_summary.routing_mode === "default" ? "Default routing policy" : "Explicit routing rules"}:
                                          {" "}
                                          {filing.alert_routing_summary.recipients.map((recipient) => `${recipient.name} (${recipient.role})`).join(", ")}
                                        </p>
                                      ) : null}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                                      onClick={() => handleEscalateAlerts(filing)}
                                      disabled={escalateFilingAlertsMutation.isPending}
                                    >
                                      {escalateFilingAlertsMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Escalate alerts"}
                                    </Button>
                                  </div>
                                  <div className="mt-3 space-y-3">
                                    {filing.operational_alerts.map((alert) => (
                                      <div
                                        key={`${alert.code}-${alert.title}`}
                                        className={`rounded-2xl px-3 py-3 ${
                                          alert.severity === "critical" ? "border border-rose-200 bg-rose-50 text-rose-900" : "border border-amber-200 bg-white text-amber-900"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-sm font-medium">{alert.title}</p>
                                          <StatusBadge label={alert.severity} variant={alert.severity === "critical" ? "danger" : "warning"} />
                                        </div>
                                        <p className="mt-2 text-xs">{alert.message}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-sm font-semibold text-slate-900">Live rollout</p>
                                <p className="mt-2 text-sm text-slate-700">
                                  {filing.rollout_policy_summary.enforced
                                    ? filing.rollout_policy_summary.policy_present
                                      ? "Live filing is controlled by an active rollout policy for this context."
                                      : "Rollout enforcement is on, but no active rollout policy matches this filing context."
                                    : "Rollout enforcement is currently off. Global live-filing controls still apply."}
                                </p>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  <div className="rounded-2xl bg-slate-50 p-3">
                                    <p className="text-xs uppercase tracking-wide text-slate-500">Submission</p>
                                    <p className="mt-2 text-sm font-medium text-slate-900">
                                      {filing.rollout_policy_summary.live_submission_allowed ? "allowed" : "blocked"}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl bg-slate-50 p-3">
                                    <p className="text-xs uppercase tracking-wide text-slate-500">Status refresh</p>
                                    <p className="mt-2 text-sm font-medium text-slate-900">
                                      {filing.rollout_policy_summary.live_status_sync_allowed ? "allowed" : "blocked"}
                                    </p>
                                  </div>
                                </div>
                                {filing.rollout_policy_summary.policy_scope.length ? (
                                  <p className="mt-3 text-xs text-slate-600">
                                    Scope: {filing.rollout_policy_summary.policy_scope.join(", ")}
                                  </p>
                                ) : null}
                                {filing.rollout_policy_summary.submission_reason ? (
                                  <p className="mt-2 text-xs text-slate-600">{filing.rollout_policy_summary.submission_reason}</p>
                                ) : null}
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-sm font-semibold text-slate-900">Available actions</p>
                                <div className="mt-3 space-y-3">
                                  {filing.support_actions_summary.actions.map((action) => (
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
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-sm font-semibold text-slate-900">Recent interventions</p>
                                {filing.intervention_history.length ? (
                                  <div className="mt-3 space-y-3">
                                    {filing.intervention_history.map((event) => (
                                      <div key={event.id} className="rounded-2xl bg-slate-50 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-sm font-medium text-slate-900">{event.label}</p>
                                          <p className="text-xs text-slate-500">{formatDateTime(event.created_at)}</p>
                                        </div>
                                        <p className="mt-2 text-xs text-slate-600">
                                          {event.actor_name ? `${event.actor_name} • ` : ""}
                                          {event.note || "No note recorded"}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-3 text-sm text-slate-600">No interventions recorded yet.</p>
                                )}
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-sm font-semibold text-slate-900">Incident notes</p>
                                {filing.incident_notes.length ? (
                                  <div className="mt-3 space-y-3">
                                    {filing.incident_notes.map((note) => (
                                      <div key={note.id} className="rounded-2xl bg-slate-50 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-sm font-medium text-slate-900">{note.title}</p>
                                          <div className="flex items-center gap-2">
                                            <StatusBadge label={note.severity} variant={note.severity === "critical" ? "danger" : note.severity === "warning" ? "warning" : "primary"} />
                                            <StatusBadge label={note.status} variant={note.status === "resolved" ? "success" : "warning"} />
                                          </div>
                                        </div>
                                        <p className="mt-2 text-xs text-slate-600">{note.note}</p>
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
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-3 text-sm text-slate-600">No incident notes recorded yet.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            title="No filing operations match these filters"
            description="Try broadening the queue scope or clearing status filters to bring more filing states into view."
          />
          )}
      </SectionCard>

      <Dialog open={Boolean(previewReturnId)} onOpenChange={(open) => !open && setPreviewReturnId(null)}>
        <AppModalContent size="lg">
          <AppModalHeader
            title={previewReturnQuery.data ? `${previewReturnQuery.data.return_type.toUpperCase()} return preview` : "Return preview"}
            description={
              previewReturnQuery.data
                ? `${previewReturnQuery.data.client_name ?? "Client"} • ${previewReturnQuery.data.gstin_value ?? ""} • ${previewReturnQuery.data.compliance_period_label ?? ""}`
                : "Review the prepared return summary without leaving filing operations."
            }
          />
          <AppModalBody className="space-y-6">
            {previewReturnQuery.isLoading ? (
              <LoadingState message="Loading return preview..." />
            ) : previewReturnQuery.isError ? (
              <ErrorState description={getErrorMessage(previewReturnQuery.error)} />
            ) : previewReturnQuery.data ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Status</p>
                    <div className="mt-2">
                      <StatusBadge
                        label={previewReturnQuery.data.status.replace(/_/g, " ")}
                        variant={
                          previewReturnQuery.data.status === "approved" || previewReturnQuery.data.status === "filed"
                            ? "success"
                            : previewReturnQuery.data.status === "ready_for_review"
                              ? "warning"
                              : "primary"
                        }
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Taxable value</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">Rs. {formatMoney(getPrimaryTaxableValue(previewReturnQuery.data))}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Tax amount</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">Rs. {formatMoney(getPrimaryTaxAmount(previewReturnQuery.data))}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">{previewReturnQuery.data.return_type === "gstr3b" ? "Net payable" : previewReturnQuery.data.return_type === "gstr9" || previewReturnQuery.data.return_type === "gstr9c" ? "Annual net payable" : "ITC impact"}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      Rs. {formatMoney(previewReturnQuery.data.return_type === "gstr3b" ? getNetPayable(previewReturnQuery.data) : previewReturnQuery.data.return_type === "gstr9" || previewReturnQuery.data.return_type === "gstr9c" ? getNetPayable(previewReturnQuery.data) : getItcAmount(previewReturnQuery.data))}
                    </p>
                  </div>
                </div>

                <SectionCard title="Review context" description="Key ownership, timing, and exception indicators for this draft.">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Prepared by</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{previewReturnQuery.data.prepared_by_name ?? "System"}</p>
                      <p className="mt-1 text-sm text-slate-600">{formatDateTime(previewReturnQuery.data.updated_at)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Period exceptions</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{getPeriodExceptionCountFromSummary(previewReturnQuery.data.summary_snapshot)} linked row(s)</p>
                      <p className="mt-1 text-sm text-slate-600">Review accepted out-of-period source items before approval.</p>
                    </div>
                    {previewReturnQuery.data.is_blocked_by_stale_reconciliation ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 md:col-span-2">
                        <p className="text-sm font-semibold text-rose-900">Blocked by stale reconciliation</p>
                        <p className="mt-1 text-sm leading-6 text-rose-800">
                          {previewReturnQuery.data.blocking_reason || "Source imports changed after the last reconciliation run."}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </SectionCard>

                <ReturnSectionSummary
                  returnType={previewReturnQuery.data.return_type}
                  summarySnapshot={previewReturnQuery.data.summary_snapshot}
                  variant="compact"
                />

                {previewReviewHref ? (
                  <SectionCard
                    title={
                      previewReturnQuery.data?.return_type === "gstr3b"
                        ? "Full GSTR-3B review"
                        : previewReturnQuery.data?.return_type === "gstr9" || previewReturnQuery.data?.return_type === "gstr9c"
                          ? "Full GSTR-9 review"
                          : "Full GSTR-1 review"
                    }
                    description="Open the complete tabbed review workspace for section-wise validation, warnings, and exceptions."
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Continue review in the dedicated workspace</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {previewReturnQuery.data?.return_type === "gstr3b"
                            ? "Use the in-app GSTR-3B tabs to inspect output tax, ITC posture, reconciliation rows, CA decisions, and source purchase / 2B details."
                            : previewReturnQuery.data?.return_type === "gstr9" || previewReturnQuery.data?.return_type === "gstr9c"
                              ? "Use the annual review tabs to inspect totals, linked annual source context, comparison posture, and warning signals."
                              : "Use the in-app GSTR-1 tabs to inspect B2B, B2CL, B2CS, exports, advances, amendments, e-commerce, and HSN details."}
                        </p>
                      </div>
                      <Button asChild variant="outline">
                        <Link href={previewReviewHref}>
                          {previewReturnQuery.data?.return_type === "gstr3b" ? "Open GSTR-3B review" : previewReturnQuery.data?.return_type === "gstr9c" ? "Open GSTR-9C review" : previewReturnQuery.data?.return_type === "gstr9" ? "Open GSTR-9 review" : "Open GSTR-1 review"}
                        </Link>
                      </Button>
                    </div>
                  </SectionCard>
                ) : null}

                <SectionCard title="Raw summary snapshot" description="The prepared return summary payload captured for review.">
                  <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                    {JSON.stringify(previewReturnQuery.data.summary_snapshot ?? {}, null, 2)}
                  </pre>
                </SectionCard>
              </>
            ) : (
              <EmptyState title="Return preview unavailable" description="We couldn't find the selected return draft." />
            )}
          </AppModalBody>
        </AppModalContent>
      </Dialog>

      <Dialog open={Boolean(selectedRequeueFiling)} onOpenChange={(open) => !open && (setSelectedRequeueFiling(null), setRequeueComments(""))}>
        <AppModalContent size="md">
          <AppModalHeader
            title="Requeue after review"
            description="Record review comments before requeuing a failed filing from the operations workspace."
          />
          <AppModalBody>
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-medium text-slate-900">
                  {selectedRequeueFiling?.client_name ?? "Selected client"} • {selectedRequeueFiling?.return_type.toUpperCase()}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedRequeueFiling?.gstin_value ?? "No GSTIN"} • {selectedRequeueFiling?.compliance_period_label ?? "No period"}
                </p>
              </div>
              <Textarea
                value={requeueComments}
                onChange={(event) => setRequeueComments(event.target.value)}
                placeholder="Summarize the filing review, decision, and why this filing is being requeued..."
                className="min-h-32 bg-slate-50"
              />
            </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">This action will create a new filing attempt and preserve the review trail.</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => { setSelectedRequeueFiling(null); setRequeueComments(""); }}>
                <ActionLabel kind="cancel" label="Cancel" />
              </Button>
              <Button onClick={handleRequeueAfterReview} disabled={requeueAfterReviewMutation.isPending}>
                {requeueAfterReviewMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ActionLabel kind="confirm" label="Confirm requeue" />}
              </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>
    </div>
  );
}
