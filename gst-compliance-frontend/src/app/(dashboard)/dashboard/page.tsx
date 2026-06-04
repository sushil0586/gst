"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowRight,
  BadgeIndianRupee,
  CircleAlert,
  FileUp,
  GitCompareArrows,
  Lock,
  ListChecks,
  Siren,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { AuditTimeline } from "@/components/common/audit-timeline";
import { ActionLabel } from "@/components/common/action-label";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { QuickActionButton } from "@/components/common/quick-action-button";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { ComplianceStatusBadge } from "@/components/status/compliance-status-badge";
import { StatusBadge } from "@/components/status/status-badge";
import { WorkflowTimeline } from "@/components/status/workflow-timeline";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { Button } from "@/components/ui/button";
import { recentActivities as mockActivities } from "@/data/activities";
import { dashboardMetrics, periodSummary as mockPeriodSummary, workflowSteps as mockWorkflowSteps } from "@/data/dashboard";
import { useCloseManagerReportQuery, useDashboardSummaryQuery } from "@/features/dashboard";
import { useFilingOperationsQuery } from "@/features/filings";
import {
  useAcknowledgeTransactionRemediationDigestMutation,
  useCreateTransactionRemediationDigestMutation,
  useDispatchTransactionRemediationDigestMutation,
  useTransactionRemediationDigestsQuery,
} from "@/features/imports";
import { mismatchBreakdown as mockMismatchBreakdown, topMismatchVendors as mockTopMismatchVendors } from "@/data/reconciliationIssues";
import { getErrorMessage } from "@/lib/api/error-handler";
import { downloadFile } from "@/lib/api/download";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { DashboardMetric, WorkflowStep } from "@/types";
import type { DashboardSummaryRecord } from "@/types/api";
import { toast } from "sonner";

const MismatchDonutChart = dynamic(
  () =>
    import("@/components/charts/mismatch-donut-chart").then((module) => module.MismatchDonutChart),
  {
    ssr: false,
    loading: () => <div className="h-[280px] rounded-2xl bg-slate-50" />,
  },
);

function formatMoney(value?: string | number | null) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCountStatus(filedCount: number, totalExpected: number) {
  if (!totalExpected) {
    return "Not started";
  }
  return `${filedCount}/${totalExpected} Filed`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Not scheduled";
  }
  return format(new Date(value), "dd MMM yyyy");
}

function getFilingStatusVariant(status: string) {
  if (status === "filed" || status === "arn_received") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "needs_retry" || status === "submitted" || status === "queued_for_filing") return "warning" as const;
  return "primary" as const;
}

function getWorkflowSteps(summary?: DashboardSummaryRecord | null): WorkflowStep[] {
  if (!summary) {
    return mockWorkflowSteps;
  }

  const importsReady =
    (summary.import_summary.by_type.sales ?? 0) > 0 &&
    (summary.import_summary.by_type.purchase ?? 0) > 0 &&
    (summary.import_summary.by_type.gstr_2b ?? 0) > 0;
  const reconciliationReady = Boolean(summary.reconciliation_summary.latest_run);
  const gstr1Status = String(summary.return_summary.gstr1.status ?? "not_prepared");
  const gstr3bStatus = String(summary.return_summary.gstr3b.status ?? "not_prepared");
  const approvalPending = summary.approval_summary.pending_count > 0;
  const allFiled = summary.filing_status.all_filed;

  return [
    { label: "Import", status: importsReady ? "complete" : "current" },
    { label: "Reconciliation", status: reconciliationReady ? "complete" : importsReady ? "current" : "upcoming" },
    { label: "GSTR-1", status: gstr1Status === "filed" ? "complete" : reconciliationReady ? "current" : "upcoming" },
    { label: "GSTR-3B", status: gstr3bStatus === "filed" ? "complete" : gstr1Status !== "not_prepared" ? "current" : "upcoming" },
    { label: "Approval", status: !approvalPending && summary.approval_summary.approved_count > 0 ? "complete" : gstr3bStatus !== "not_prepared" ? "current" : "upcoming" },
    { label: "Filing", status: allFiled ? "complete" : summary.approval_summary.approved_count > 0 ? "current" : "upcoming" },
  ];
}

function getDashboardMetrics(summary?: DashboardSummaryRecord | null): DashboardMetric[] {
  if (!summary) {
    return dashboardMetrics;
  }

  return [
    {
      label: "Compliance Health",
      value: `${summary.compliance_health_score}%`,
      tone: summary.compliance_health_score >= 80 ? "success" : summary.compliance_health_score >= 60 ? "warning" : "danger",
      detail: summary.lock_status.is_locked ? "Current period is locked and controlled." : "Health score updates as imports, returns, and controls progress.",
    },
    {
      label: "Mismatches",
      value: String(summary.reconciliation_summary.mismatch_count + summary.reconciliation_summary.partial_match_count),
      tone: summary.reconciliation_summary.open_issue_count > 0 ? "warning" : "success",
      detail: `${summary.reconciliation_summary.open_issue_count} open reconciliation issue(s) across the latest run.`,
    },
    {
      label: "Open Issues",
      value: String(summary.open_issues),
      tone: summary.open_issues > 0 ? "danger" : "success",
      detail: "Includes reconciliation exceptions, pending approvals, and unfinished return steps.",
    },
    {
      label: "Return Status",
      value: formatCountStatus(summary.return_summary.filed_count, summary.return_summary.total_expected),
      tone: summary.filing_status.all_filed ? "success" : "primary",
      detail: `GSTR-1: ${summary.filing_status.gstr1_status.replace(/_/g, " ")} • GSTR-3B: ${summary.filing_status.gstr3b_status.replace(/_/g, " ")}`,
    },
  ];
}

function getPeriodSummary(summary?: DashboardSummaryRecord | null) {
  if (!summary?.selected_context.compliance_period) {
    return mockPeriodSummary;
  }

  return {
    client: summary.selected_context.client?.name ?? "Not selected",
    gstin: summary.selected_context.gstin?.value ?? "Not selected",
    period: summary.selected_context.compliance_period.period,
    filingFrequency: summary.selected_context.compliance_period.return_type,
    dueDate: formatDate(summary.selected_context.compliance_period.due_date),
    currentStatus: summary.lock_status.is_locked ? "Locked" : summary.selected_context.compliance_period.status,
  };
}

function getFocusItems(summary?: DashboardSummaryRecord | null) {
  if (!summary) {
    return [
      "Bring in sales, purchase, and GSTR-2B data to activate the monthly cycle.",
      "Use the dashboard filters to focus one client-period at a time.",
      "Once imports land, review mismatches and approval queues before filing.",
    ];
  }

  const items: string[] = [];

  if (summary.import_summary.total_batches === 0) {
    items.push("Upload source files to begin the active compliance cycle.");
  }

  if (!summary.reconciliation_summary.latest_run) {
    items.push("Run reconciliation after both purchase books and GSTR-2B are available.");
  }

  if (summary.reconciliation_summary.open_issue_count > 0) {
    items.push(`${summary.reconciliation_summary.open_issue_count} reconciliation issue(s) still need action.`);
  }

  if (summary.approval_summary.pending_count > 0) {
    items.push(`${summary.approval_summary.pending_count} approval item(s) are waiting on reviewer sign-off.`);
  }

  if (!summary.filing_status.all_filed) {
    items.push("Keep the return sequence moving until both GSTR-1 and GSTR-3B are filed.");
  }

  return items.slice(0, 3);
}

function getNextAction(summary?: DashboardSummaryRecord | null) {
  if (!summary) {
    return {
      label: "Start with imports",
      detail: "Load source data so the rest of the monthly workflow can come alive.",
      href: "/imports",
    };
  }

  const hasSales = (summary.import_summary.by_type.sales ?? 0) > 0;
  const hasPurchase = (summary.import_summary.by_type.purchase ?? 0) > 0;
  const has2B = (summary.import_summary.by_type.gstr_2b ?? 0) > 0;

  if (!hasSales || !hasPurchase || !has2B) {
    return {
      label: "Complete data intake",
      detail: "Sales, purchase, and GSTR-2B imports should all be present before close review begins.",
      href: "/imports",
    };
  }

  if (!summary.reconciliation_summary.latest_run) {
    return {
      label: "Run reconciliation",
      detail: "Your inputs are ready. Match books against 2B and surface the exception queue.",
      href: "/reconciliation",
    };
  }

  if (summary.approval_summary.pending_count > 0) {
    return {
      label: "Clear approvals",
      detail: "Reviewer decisions are now the main bottleneck before filing can finish.",
      href: "/approvals",
    };
  }

  if (!summary.filing_status.all_filed) {
    return {
      label: "Push filing forward",
      detail: "Returns are in motion, but the filing sequence is not yet complete.",
      href: "/returns",
    };
  }

  return {
    label: "Review audit and close notes",
    detail: "Core filing work is complete. Wrap up controls, audit evidence, and stakeholder updates.",
    href: "/audit-trail",
  };
}

export default function DashboardPage() {
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
    requiresOnboarding,
  } = useWorkspaceContext();

  const summaryFilters = {
    workspace: selectedWorkspaceId,
    client: selectedClientId,
    gstin: selectedGstinId,
    compliance_period: selectedPeriodId,
  };
  const summaryQuery = useDashboardSummaryQuery(summaryFilters);
  const closeManagerReportQuery = useCloseManagerReportQuery({ workspace: selectedWorkspaceId, days: "7" });
  const filingOperationsQuery = useFilingOperationsQuery({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    compliance_period: selectedPeriodId ?? undefined,
    page_size: "5",
  });
  const remediationDigestsQuery = useTransactionRemediationDigestsQuery({ workspace: selectedWorkspaceId ?? undefined });
  const createDigestMutation = useCreateTransactionRemediationDigestMutation({ workspace: selectedWorkspaceId ?? undefined });
  const acknowledgeDigestMutation = useAcknowledgeTransactionRemediationDigestMutation({ workspace: selectedWorkspaceId ?? undefined });
  const dispatchDigestMutation = useDispatchTransactionRemediationDigestMutation({ workspace: selectedWorkspaceId ?? undefined });
  const summary = summaryQuery.data;
  const closeManagerWorkspaceSummary = summary?.workspace_close_manager_summary ?? null;
  const closeManagerReport = closeManagerReportQuery.data;
  const metrics = getDashboardMetrics(summary);
  const workflowSteps = getWorkflowSteps(summary);
  const periodSummary = getPeriodSummary(summary);
  const recentActivity = summary?.recent_activity?.length ? summary.recent_activity : [];
  const mismatchBreakdown = summary?.reconciliation_summary.mismatch_breakdown?.length
    ? summary.reconciliation_summary.mismatch_breakdown
    : mockMismatchBreakdown;
  const topMismatchVendors = summary?.reconciliation_summary.top_vendors?.length
    ? summary.reconciliation_summary.top_vendors.map((entry) => ({
        vendor: entry.vendor,
        gstin: entry.gstin,
        issue: entry.issue,
        taxDifference: entry.tax_difference,
        status: entry.status,
        assignedTo: entry.assigned_to,
      }))
    : mockTopMismatchVendors;
  const closeManagerSummary = summary?.close_management_summary ?? null;
  const remediationDigests = remediationDigestsQuery.data?.items ?? [];
  const focusItems = getFocusItems(summary);
  const nextAction = getNextAction(summary);

  const hasLiveData = Boolean(
    summary &&
      (
        summary.import_summary.total_batches > 0 ||
        summary.transaction_summary.total_transactions > 0 ||
        summary.reconciliation_summary.latest_run ||
        summary.return_summary.filed_count > 0 ||
        summary.recent_activity.length > 0
      ),
  );
  const showGuidedEmptyState =
    Boolean(summary) &&
    !hasLiveData &&
    !requiresOnboarding;

  const handleGenerateDigest = async (deliveryChannel: "in_app" | "email_preview" | "email") => {
    if (!selectedWorkspaceId) {
      toast.error("Select a workspace before generating a close digest.");
      return;
    }
    try {
      const titlePrefix =
        deliveryChannel === "email"
          ? "Close manager email digest"
          : deliveryChannel === "email_preview"
            ? "Close manager email preview"
            : "Close manager digest";
      await createDigestMutation.mutateAsync({
        workspace: selectedWorkspaceId,
        generated_for: deliveryChannel === "email" || deliveryChannel === "email_preview" ? user?.id ?? null : null,
        title: `${titlePrefix} • ${format(new Date(), "dd MMM yyyy, h:mm a")}`,
        delivery_channel: deliveryChannel,
      });
      toast.success(
        deliveryChannel === "email"
          ? "Email digest sent."
          : deliveryChannel === "email_preview"
            ? "Email preview generated."
            : "Close manager digest generated.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleAcknowledgeDigest = async (digestId: string) => {
    try {
      await acknowledgeDigestMutation.mutateAsync(digestId);
      toast.success("Digest acknowledged.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDispatchDigest = async (digestId: string) => {
    try {
      await dispatchDigestMutation.mutateAsync(digestId);
      toast.success("Digest dispatched.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleExportCloseReport = async () => {
    if (!selectedWorkspaceId) {
      toast.error("Select a workspace before exporting the close report.");
      return;
    }
    try {
      await downloadFile(
        "/exports/close-manager-report/",
        {
          workspace: selectedWorkspaceId,
          days: "7",
        },
        `close-manager-report-${selectedWorkspaceId}.xlsx`,
      );
      toast.success("Close operations report exported.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome to GST Compliance Workspace${selectedWorkspace ? `, ${selectedWorkspace.name}` : ""}`}
        description="Monitor imports, reconciliation, returns, approvals, and filing status in one place. The dashboard now keeps the welcome layer in the page body while the top bar stays compact for daily execution."
        actions={[
          { label: "Open reports", href: "/reports" },
          { label: "Open operations", href: "/operations" },
        ]}
      />

      {requiresOnboarding ? (
        <EmptyState
          title="Complete your workspace setup"
          description="Before future modules become useful, create at least one workspace, client, GSTIN, and compliance period."
          action={
            <Button asChild>
              <Link href="/onboarding">Finish onboarding</Link>
            </Button>
          }
        />
      ) : null}

      {!selectedWorkspaceId && !requiresOnboarding ? (
        <EmptyState
          title="Select a workspace to load live metrics"
          description="Choose a workspace from the topbar so the dashboard can summarize imports, reconciliation, returns, approvals, and audit activity."
        />
      ) : null}

      {selectedWorkspaceId && summaryQuery.isLoading ? <LoadingState message="Loading dashboard summary..." /> : null}
      {selectedWorkspaceId && summaryQuery.isError ? (
        <ErrorState description="We couldn't load the live dashboard summary, so fallback workspace visuals remain available." />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="panel-card-hero overflow-hidden px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100">
                <Sparkles className="size-3.5" />
                Monthly control center
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                {selectedClient?.legal_name ?? "Choose a client context"}{selectedPeriod ? ` for ${selectedPeriod.period}` : ""}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-indigo-100/95">
                {nextAction.detail}
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Next best move</p>
              <p className="mt-2 text-lg font-semibold">{nextAction.label}</p>
              <Button asChild className="mt-4 bg-white text-slate-950 hover:bg-slate-100">
                <Link href={nextAction.href}>
                  Open
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Current period</p>
              <p className="mt-2 text-lg font-semibold">{selectedPeriod?.period ?? "Not selected"}</p>
              <p className="mt-1 text-sm text-indigo-100/90">
                {selectedPeriod?.due_date ? `Due ${formatDate(selectedPeriod.due_date)}` : "Select a period"}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Exposure at risk</p>
              <p className="mt-2 text-lg font-semibold">
                {summary ? formatMoney(summary.reconciliation_summary.total_itc_at_risk) : "Rs. 0.00"}
              </p>
              <p className="mt-1 text-sm text-indigo-100/90">Input tax exposure based on current mismatch state.</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Period state</p>
              <div className="mt-2 flex items-center gap-2">
                {selectedPeriod?.is_locked ? <Lock className="size-4" /> : <ShieldCheck className="size-4" />}
                <p className="text-lg font-semibold">{selectedPeriod?.is_locked ? "Locked" : "Open for changes"}</p>
              </div>
              <p className="mt-1 text-sm text-indigo-100/90">
                {selectedPeriod?.return_type ?? "Return type unavailable"}
              </p>
            </div>
          </div>
        </div>

        <SectionCard
          title="What needs attention now"
          description="Keep this list tight so operators know what to do next without scanning the whole dashboard."
          variant="soft"
        >
          <div className="space-y-3">
            {focusItems.map((item, index) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                  {index + 1}
                </div>
                <p className="text-sm leading-6 text-slate-700">{item}</p>
              </div>
            ))}
            {selectedPeriod?.is_locked ? (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-4">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />
                <p className="text-sm leading-6 text-rose-700">
                  This period is locked. Only review and audit actions should continue until it is reopened.
                </p>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <div className="panel-card-hero overflow-hidden p-6">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-lg font-semibold tracking-tight">Quick Actions</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-indigo-100/90">
              Streamline your compliance workflow from the same workspace context without hopping across disconnected views.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <QuickActionButton
                href="/imports"
                icon={FileUp}
                label="Import Data"
                description="Upload and process files"
                variant="tile"
              />
              <QuickActionButton
                href="/reconciliation"
                icon={GitCompareArrows}
                label="Run Reconciliation"
                description="Match and verify data"
                variant="tile"
              />
              <QuickActionButton
                href="/returns"
                icon={ListChecks}
                label="Prepare Return"
                description="Generate return draft"
                variant="tile"
              />
              <QuickActionButton
                href="/operations"
                icon={ShieldCheck}
                label="Filing Ops"
                description="Track returns and status"
                variant="tile"
              />
            </div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-indigo-100">Compliance health</p>
                <p className="mt-3 text-5xl font-semibold tracking-tight">
                  {summary ? `${summary.compliance_health_score}%` : "85%"}
                </p>
                <p className="mt-2 text-sm text-indigo-100/90">
                  {summary?.lock_status.is_locked
                    ? "Current period is locked and under controlled review."
                    : "Current workspace remains open for monthly execution."}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3">
                <BadgeIndianRupee className="size-5" />
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {metrics.slice(0, 3).map((metric) => (
                <div key={metric.label} className="flex items-center justify-between rounded-2xl bg-white/8 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">{metric.label}</p>
                    <p className="mt-1 text-xs text-indigo-100/85">{metric.detail}</p>
                  </div>
                  <p className="text-lg font-semibold text-white">{metric.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedWorkspaceId ? (
        <SectionCard
          title="Workspace close manager"
          description="Cross-client month-close control for overdue queues, escalations, and reminder follow-ups across the whole workspace."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleExportCloseReport}>
                Export close report
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleGenerateDigest("in_app")} disabled={createDigestMutation.isPending}>
                {createDigestMutation.isPending ? "Generating..." : "Generate digest"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleGenerateDigest("email_preview")} disabled={createDigestMutation.isPending}>
                Email preview
              </Button>
              <Button size="sm" onClick={() => handleGenerateDigest("email")} disabled={createDigestMutation.isPending}>
                Send email digest
              </Button>
            </div>
          }
        >
          {summaryQuery.isLoading ? (
            <LoadingState message="Loading close manager workspace summary..." />
          ) : summaryQuery.isError ? (
            <ErrorState description="We couldn't load the workspace-wide close manager view right now." />
          ) : closeManagerWorkspaceSummary ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <StatCard
                  label="Open Queues"
                  value={String(closeManagerWorkspaceSummary.open_assignment_count)}
                  detail="Open or in-progress remediation assignments across all clients."
                  tone={closeManagerWorkspaceSummary.open_assignment_count > 0 ? "warning" : "success"}
                />
                <StatCard
                  label="Escalated"
                  value={String(closeManagerWorkspaceSummary.escalated_assignment_count)}
                  detail="Assignments currently escalated for management attention."
                  tone={closeManagerWorkspaceSummary.escalated_assignment_count > 0 ? "danger" : "success"}
                />
                <StatCard
                  label="Overdue"
                  value={String(closeManagerWorkspaceSummary.overdue_assignment_count)}
                  detail="Open queues past due across the workspace."
                  tone={closeManagerWorkspaceSummary.overdue_assignment_count > 0 ? "danger" : "success"}
                />
                <StatCard
                  label="Follow-ups Due"
                  value={String(closeManagerWorkspaceSummary.follow_ups_due_today_count)}
                  detail="Reminder actions due today or already overdue."
                  tone={closeManagerWorkspaceSummary.follow_ups_due_today_count > 0 ? "warning" : "success"}
                />
                <StatCard
                  label="Stale Queues"
                  value={String(closeManagerWorkspaceSummary.stale_assignment_count)}
                  detail="Queues with no recent movement that likely need follow-up."
                  tone={closeManagerWorkspaceSummary.stale_assignment_count > 0 ? "warning" : "success"}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900">Top client-period queues</p>
                  {closeManagerWorkspaceSummary.queues.length > 0 ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                      <DataTableShell
                        columns={[
                          { key: "client", label: "Client" },
                          { key: "period", label: "Period" },
                          { key: "open", label: "Open" },
                          { key: "escalated", label: "Escalated" },
                          { key: "overdue", label: "Overdue" },
                          { key: "followUps", label: "Follow-ups Due" },
                        ]}
                        rows={closeManagerWorkspaceSummary.queues.map((queue) => ({
                          client: queue.client_name,
                          period: `${queue.period}${queue.gstin_value ? ` • ${queue.gstin_value}` : ""}`,
                          open: String(queue.open_assignments + queue.in_progress_assignments),
                          escalated: String(queue.escalated_assignments),
                          overdue: String(queue.overdue_assignments),
                          followUps: String(queue.follow_ups_due),
                        }))}
                      />
                    </div>
                  ) : (
                    <EmptyState
                      title="No shared close queues yet"
                      description="Once remediation assignments are created across clients, the most at-risk queues will show up here."
                    />
                  )}
                </div>

                <div className="space-y-4">
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-900">Recent digests</p>
                    {remediationDigests.length > 0 ? (
                      remediationDigests.slice(0, 4).map((digest) => (
                        <div key={digest.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{digest.title}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {digest.generated_by_name ?? "System"} • {format(new Date(digest.created_at), "dd MMM, h:mm a")}
                              </p>
                              {digest.delivery_channel !== "in_app" ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  {digest.delivery_channel === "email" ? "Email sent to" : "Preview for"}{" "}
                                  {digest.rendered_payload?.recipient_email ?? digest.generated_for_name ?? "workspace user"}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              <ComplianceStatusBadge status={digest.status} />
                              {(digest.status === "failed" || digest.status === "generated") ? (
                                <Button size="sm" variant="outline" onClick={() => handleDispatchDigest(digest.id)}>
                                  Retry dispatch
                                </Button>
                              ) : null}
                              {digest.status !== "acknowledged" ? (
                                <Button size="sm" variant="outline" onClick={() => handleAcknowledgeDigest(digest.id)}>
                                  Acknowledge
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">
                            {(digest.summary.highlights as string[] | undefined)?.join(" • ") || "No summary highlights available."}
                          </p>
                          {digest.dispatch_error ? (
                            <p className="mt-2 text-xs text-rose-600">Dispatch error: {digest.dispatch_error}</p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        title="No digests generated yet"
                        description="Generate a close-manager digest to snapshot current queue pressure for shared review."
                      />
                    )}
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-900">Manager attention</p>
                    {closeManagerWorkspaceSummary.attention_items.length > 0 ? (
                      closeManagerWorkspaceSummary.attention_items.slice(0, 5).map((item) => (
                        <div key={item.assignment_id} className="rounded-2xl border border-slate-200 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{item.title}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {item.client_name} • {item.period} • {item.assigned_to_name}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {item.is_escalated ? <ComplianceStatusBadge status="escalated" /> : null}
                              <ComplianceStatusBadge status={item.is_overdue ? "overdue" : item.status} />
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">
                            Age {item.age_days}d • updated {item.updated_days}d ago
                          </p>
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        title="No urgent manager items"
                        description="Overdue or escalated remediation queues will be surfaced here as the workspace close process evolves."
                      />
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Siren className="size-4 text-amber-500" />
                      <p className="text-sm font-semibold text-slate-900">Upcoming follow-ups</p>
                    </div>
                    {closeManagerWorkspaceSummary.next_follow_ups.length > 0 ? (
                      closeManagerWorkspaceSummary.next_follow_ups.slice(0, 5).map((followUp) => (
                        <div key={followUp.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                          <p className="text-sm font-medium text-slate-900">{followUp.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {followUp.client_name} • {followUp.period} • {followUp.assignment_title}
                          </p>
                          <p className="mt-2 text-sm text-slate-600">
                            {followUp.follow_up_type.replace(/_/g, " ")} • due {formatDate(followUp.remind_at)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        title="No follow-ups scheduled"
                        description="Reminder and manager-review follow-ups created in Transaction Review will appear here."
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900">Automation performance (7 days)</p>
                  {closeManagerReport ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard label="Digests sent" value={String(closeManagerReport.summary.digests_dispatched)} detail="Close-manager digests dispatched in the last 7 days." tone={closeManagerReport.summary.digests_dispatched > 0 ? "success" : "primary"} />
                        <StatCard label="Reminders sent" value={String(closeManagerReport.summary.reminders_sent)} detail="Manual and scheduled follow-up nudges delivered." tone={closeManagerReport.summary.reminders_sent > 0 ? "success" : "primary"} />
                        <StatCard label="Auto escalations" value={String(closeManagerReport.summary.auto_escalations)} detail="Assignments escalated automatically after overdue follow-ups." tone={closeManagerReport.summary.auto_escalations > 0 ? "warning" : "success"} />
                        <StatCard label="Dispatch failures" value={String(closeManagerReport.summary.digest_failures)} detail="Digest sends that failed and need operator review." tone={closeManagerReport.summary.digest_failures > 0 ? "danger" : "success"} />
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-slate-200">
                        <DataTableShell
                          columns={[
                            { key: "date", label: "Date" },
                            { key: "digests", label: "Digests" },
                            { key: "reminders", label: "Reminders" },
                            { key: "completions", label: "Completed" },
                            { key: "escalations", label: "Escalations" },
                          ]}
                          rows={closeManagerReport.daily.map((entry) => ({
                            date: format(new Date(entry.date), "dd MMM"),
                            digests: String(entry.digests_dispatched),
                            reminders: String(entry.reminders_sent),
                            completions: String(entry.follow_ups_completed),
                            escalations: String(entry.auto_escalations),
                          }))}
                        />
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      title="No automation report yet"
                      description="Once digests and reminders start running, automation performance will show up here."
                    />
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900">Recent automation activity</p>
                  {closeManagerReport?.recent_activity?.length ? (
                    closeManagerReport.recent_activity.slice(0, 8).map((activity) => (
                      <div key={activity.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{activity.action.replace(/_/g, " ")}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {activity.actor_name} • {format(new Date(activity.created_at), "dd MMM, h:mm a")}
                            </p>
                          </div>
                          <ComplianceStatusBadge
                            status={
                              activity.action.includes("failed")
                                ? "failed"
                                : activity.action.includes("auto_escalated")
                                  ? "escalated"
                                  : activity.action.includes("completed")
                                    ? "completed"
                                    : "processed"
                            }
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="No automation events yet"
                      description="Digest dispatches, reminder sends, and auto-escalations will be surfaced here."
                    />
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {selectedWorkspaceId ? (
        <SectionCard
          title="Filing operations queue"
          description="Support-facing queue of unresolved filing states, recommended next actions, and evidence coverage."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/operations">
                <ActionLabel kind="open" label="Open operations workspace" />
              </Link>
            </Button>
          }
        >
          {filingOperationsQuery.isLoading ? (
            <LoadingState message="Loading filing operations queue..." />
          ) : filingOperationsQuery.isError ? (
            <ErrorState description={getErrorMessage(filingOperationsQuery.error)} />
          ) : filingOperationsQuery.data?.items.length ? (
            <div className="space-y-3">
              {filingOperationsQuery.data.items.map((filing) => (
                <div key={filing.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {filing.client_name} • {filing.return_type.toUpperCase()}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {filing.gstin_value} • {filing.compliance_period_label}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={filing.status.replace(/_/g, " ")} variant={getFilingStatusVariant(filing.status)} />
                      <StatusBadge
                        label={filing.support_status_summary.recommended_action.replace(/_/g, " ")}
                        variant={
                          filing.support_status_summary.has_provider_failure
                            ? "danger"
                            : filing.support_status_summary.recommended_action === "resync_status"
                              ? "warning"
                              : "primary"
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Provider stage</p>
                      <p className="mt-2 font-medium text-slate-900">{filing.support_status_summary.provider_stage || "Pending"}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Interventions</p>
                      <p className="mt-2 font-medium text-slate-900">{filing.support_status_summary.intervention_count}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Evidence</p>
                      <p className="mt-2 font-medium text-slate-900">
                        {[
                          filing.support_status_summary.evidence_flags.save_response ? "save" : null,
                          filing.support_status_summary.evidence_flags.proceed_response ? "proceed" : null,
                          filing.support_status_summary.evidence_flags.file_response ? "file" : null,
                          filing.support_status_summary.evidence_flags.status_response ? "status" : null,
                          filing.support_status_summary.evidence_flags.track_response ? "track" : null,
                        ]
                          .filter(Boolean)
                          .join(", ") || "None"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Last sync</p>
                      <p className="mt-2 font-medium text-slate-900">{formatDate(filing.last_status_sync_at)}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">{filing.support_status_summary.summary_reason || "No backend guidance recorded yet."}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No unresolved filing operations"
              description="Filed or cancelled items are hidden by default. Any filing needing support attention will appear here."
            />
          )}
        </SectionCard>
      ) : null}

      {showGuidedEmptyState ? (
        <EmptyState
          title="This monthly workspace is ready for its first cycle"
          description="Start by uploading sales, purchase, and GSTR-2B data. Once imports arrive, reconciliation, returns, and audit metrics will populate automatically."
          action={
            <Button asChild>
              <Link href="/imports">Go to Imports</Link>
            </Button>
          }
        />
      ) : null}

      <SectionCard
        title="Operational pulse"
        description="Core KPIs for this active context. These should tell you in under a minute whether the cycle is under control."
        variant="soft"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <StatCard
              key={metric.label}
              {...metric}
              variant="soft"
              icon={
                metric.label === "Compliance Health"
                  ? ShieldCheck
                  : metric.label === "Mismatches"
                    ? GitCompareArrows
                    : metric.label === "Open Issues"
                      ? Siren
                      : ListChecks
              }
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Monthly workflow timeline"
        description="Track the current filing motion from data intake to final submission."
      >
        <WorkflowTimeline steps={workflowSteps} />
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title="Period summary" description="Primary operating context for the current close cycle.">
          <dl className="grid gap-4 sm:grid-cols-2">
            {Object.entries(periodSummary).map(([key, value]) => (
              <div key={key} className="surface-muted px-4 py-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {key.replace(/([A-Z])/g, " $1")}
                </dt>
                <dd className="mt-2 text-sm font-medium text-slate-900">
                  {key === "client" ? selectedClient?.legal_name ?? value : null}
                  {key === "gstin" ? selectedGstin?.gstin ?? value : null}
                  {key === "period" ? selectedPeriod?.period ?? value : null}
                  {key === "currentStatus" ? <ComplianceStatusBadge status={String(value)} /> : null}
                  {key === "filingFrequency" ? selectedPeriod?.return_type ?? value : null}
                  {key === "dueDate" ? (selectedPeriod?.due_date ? formatDate(selectedPeriod.due_date) : String(value)) : null}
                  {!["client", "gstin", "period", "currentStatus", "filingFrequency", "dueDate"].includes(key) ? String(value) : null}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title="Recent activities" description="Latest operational actions across the workspace.">
          <div className="space-y-4">
            {(recentActivity.length ? recentActivity : mockActivities).map((activity) => {
              const isMockActivity = "title" in activity;

              return (
              <div key={activity.id} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {isMockActivity ? activity.title : activity.action.replace(/_/g, " ")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {activity.description}
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  {isMockActivity ? activity.timestamp : format(new Date(activity.timestamp), "dd MMM, h:mm a")}
                </span>
              </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Mismatch category mix" description="Distribution snapshot of the current 2B reconciliation run.">
          <MismatchDonutChart data={mismatchBreakdown} />
          <div className="mt-4 grid gap-2">
            {mismatchBreakdown.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-sm text-slate-700">{entry.name}</span>
                </div>
                <span className="text-sm font-semibold text-slate-950">{entry.value}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Top mismatch vendors" description="High-value vendor exceptions requiring immediate review.">
          <DataTableShell
            columns={[
              { key: "vendor", label: "Vendor" },
              { key: "gstin", label: "GSTIN" },
              { key: "issue", label: "Issue" },
              { key: "taxDifference", label: "Tax Difference" },
              { key: "status", label: "Status" },
              { key: "assignedTo", label: "Assigned To" },
            ]}
            rows={topMismatchVendors}
          />
        </SectionCard>
      </div>

      {closeManagerSummary ? (
        <SectionCard
          title="Close manager dashboard"
          description="Shared follow-up and remediation workload across the active close scope."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Open Assignments"
              value={String(closeManagerSummary.open_assignment_count)}
              detail="Assignments still needing active remediation work."
              tone={closeManagerSummary.open_assignment_count > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Escalated"
              value={String(closeManagerSummary.escalated_assignment_count)}
              detail="Queues already escalated for manager attention."
              tone={closeManagerSummary.escalated_assignment_count > 0 ? "danger" : "success"}
            />
            <StatCard
              label="Overdue"
              value={String(closeManagerSummary.overdue_assignment_count)}
              detail="Open assignments that have crossed the expected close boundary."
              tone={closeManagerSummary.overdue_assignment_count > 0 ? "danger" : "success"}
            />
            <StatCard
              label="Follow-ups Due"
              value={String(closeManagerSummary.follow_ups_due_today_count)}
              detail="Reminder or review actions due today or already past due."
              tone={closeManagerSummary.follow_ups_due_today_count > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Open Follow-ups"
              value={String(closeManagerSummary.open_follow_up_count)}
              detail="Shared follow-up tasks still waiting for closure."
              tone={closeManagerSummary.open_follow_up_count > 0 ? "primary" : "success"}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">Owner workload</p>
              {closeManagerSummary.owner_workload.length > 0 ? (
                closeManagerSummary.owner_workload.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{entry.name}</p>
                      <p className="text-xs text-slate-500">{entry.escalated} escalated</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-950">{entry.count} open</span>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No active ownership load"
                  description="Once remediation assignments are created, assignee workload will show up here for managers."
                />
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Siren className="size-4 text-amber-500" />
                <p className="text-sm font-semibold text-slate-900">Upcoming follow-ups</p>
              </div>
              {closeManagerSummary.next_follow_ups.length > 0 ? (
                closeManagerSummary.next_follow_ups.map((followUp) => (
                  <div key={followUp.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{followUp.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {followUp.assignment_title} • {followUp.assigned_to_name ?? "Unassigned"}
                        </p>
                      </div>
                      <ComplianceStatusBadge status={followUp.status} />
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {followUp.follow_up_type.replace(/_/g, " ")} • due {formatDate(followUp.remind_at)}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No follow-ups scheduled"
                  description="Create follow-up reminders from Transaction Review to keep month-close work moving."
                />
              )}
            </div>
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Audit timeline" description="Recent system and user actions captured across the workspace.">
          <AuditTimeline events={summary?.recent_activity} />
        </SectionCard>

        <SectionCard title="Executive note" description="A premium snapshot panel for stakeholder-ready updates.">
          <div className="rounded-3xl bg-[linear-gradient(135deg,#1e293b_0%,#312e81_55%,#4338ca_100%)] p-6 text-white shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-indigo-100">Current exposure</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight">
                  {summary ? formatMoney(summary.reconciliation_summary.total_itc_at_risk) : "Rs. 2.63L"}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3">
                <BadgeIndianRupee className="size-5" />
              </div>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-indigo-100">
              {summary
                ? `Open issues are currently at ${summary.open_issues}, with the next recommended move being: ${summary.lock_status.is_locked ? "review the locked period and supporting audit trail." : "continue the monthly workflow from the active workspace summary."}`
                : "Primary attention remains on unresolved 2B mismatches and approval sequencing for one pending return package."}
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Imports</p>
                <p className="mt-2 text-lg font-semibold">
                  {summary ? `${summary.import_summary.total_batches} batch${summary.import_summary.total_batches === 1 ? "" : "es"}` : "Completed"}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Approval</p>
                <p className="mt-2 text-lg font-semibold">
                  {summary ? `${summary.approval_summary.pending_count} pending` : "Pending reviewer"}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-indigo-100">Lock</p>
                <p className="mt-2 text-lg font-semibold">
                  {summary?.lock_status.is_locked ? "Locked" : "Open for changes"}
                </p>
              </div>
            </div>
            {summary?.selected_context.compliance_period ? (
              <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm text-indigo-50">
                <ShieldCheck className="size-4" />
                <span>
                  Active period {summary.selected_context.compliance_period.period} is due on {formatDate(summary.selected_context.compliance_period.due_date)}.
                </span>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
