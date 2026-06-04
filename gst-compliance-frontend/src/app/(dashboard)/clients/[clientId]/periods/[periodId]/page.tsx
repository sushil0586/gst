"use client";

import { use } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowRight,
  CheckCircle2,
  FileClock,
  FileSearch2,
  GitCompareArrows,
  Lock,
  ShieldAlert,
} from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ActionLabel } from "@/components/common/action-label";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { ComplianceStatusBadge } from "@/components/status/compliance-status-badge";
import { WorkflowTimeline } from "@/components/status/workflow-timeline";
import { Button } from "@/components/ui/button";
import { clients as mockClients } from "@/data/clients";
import { compliancePeriods as mockPeriods } from "@/data/compliancePeriods";
import { useClientQuery } from "@/features/clients";
import { useCompliancePeriodQuery, useCompliancePeriodWorkspaceSummaryQuery } from "@/features/compliance-periods";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { WorkflowStep } from "@/types";

function formatDate(value?: string | null) {
  if (!value) {
    return "Not scheduled";
  }
  return format(new Date(value), "dd MMM yyyy");
}

function buildWorkflow(summary?: {
  imports_by_type_status: { by_type: Record<string, number> };
  latest_reconciliation_run: { status: string } | null;
  return_preparation_statuses: {
    gstr1: Record<string, unknown>;
    gstr3b: Record<string, unknown>;
  };
  approvals: { pending_count: number; approved_count: number };
  lock_state: { is_locked: boolean };
}): WorkflowStep[] {
  if (!summary) {
    return [
      { label: "Import", status: "current" },
      { label: "Reconciliation", status: "upcoming" },
      { label: "GSTR-1", status: "upcoming" },
      { label: "GSTR-3B", status: "upcoming" },
      { label: "Approval", status: "upcoming" },
      { label: "Filing", status: "upcoming" },
    ];
  }

  const importsReady =
    (summary.imports_by_type_status.by_type.sales ?? 0) > 0 &&
    (summary.imports_by_type_status.by_type.purchase ?? 0) > 0 &&
    (summary.imports_by_type_status.by_type.gstr_2b ?? 0) > 0;
  const reconciliationReady = Boolean(summary.latest_reconciliation_run);
  const gstr1Status = String(summary.return_preparation_statuses.gstr1.status ?? "not_prepared");
  const gstr3bStatus = String(summary.return_preparation_statuses.gstr3b.status ?? "not_prepared");
  const approved = summary.approvals.approved_count > 0;

  return [
    { label: "Import", status: importsReady ? "complete" : "current" },
    { label: "Reconciliation", status: reconciliationReady ? "complete" : importsReady ? "current" : "upcoming" },
    { label: "GSTR-1", status: gstr1Status === "filed" ? "complete" : reconciliationReady ? "current" : "upcoming" },
    { label: "GSTR-3B", status: gstr3bStatus === "filed" ? "complete" : gstr1Status !== "not_prepared" ? "current" : "upcoming" },
    { label: "Approval", status: approved ? "complete" : gstr3bStatus !== "not_prepared" ? "current" : "upcoming" },
    { label: "Filing", status: summary.lock_state.is_locked ? "complete" : approved ? "current" : "upcoming" },
  ];
}

export default function ClientPeriodPage({
  params,
}: {
  params: Promise<{ clientId: string; periodId: string }>;
}) {
  const { clientId, periodId } = use(params);
  const { selectedClient, selectedPeriod } = useWorkspaceContext();
  const clientQuery = useClientQuery(clientId);
  const periodQuery = useCompliancePeriodQuery(periodId);
  const workspaceSummaryQuery = useCompliancePeriodWorkspaceSummaryQuery(periodId);
  const clientFallback = mockClients.find((entry) => entry.id === clientId);
  const periodFallback = mockPeriods.find((entry) => entry.id === periodId && entry.clientId === clientId);
  const summary = workspaceSummaryQuery.data;

  const title = `${clientQuery.data?.legal_name ?? selectedClient?.legal_name ?? clientFallback?.name ?? "Client"} • ${periodQuery.data?.period ?? selectedPeriod?.period ?? periodFallback?.label ?? "Period"}`;
  const workflow = buildWorkflow(summary);
  const issueCount =
    (summary?.reconciliation_issue_counts.mismatches ?? 0) +
    (summary?.reconciliation_issue_counts.partial_matches ?? 0) +
    (summary?.reconciliation_issue_counts.missing_in_books ?? 0) +
    (summary?.reconciliation_issue_counts.missing_in_portal ?? 0) +
    (summary?.reconciliation_issue_counts.duplicates ?? 0);
  const latestReturnStatus = String(summary?.return_preparation_statuses.gstr3b.status ?? summary?.return_preparation_statuses.gstr1.status ?? periodQuery.data?.status ?? "not_prepared");

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description="A single-period operating view for imports, reconciliation, approvals, and filing readiness."
      />

      {clientQuery.isLoading || periodQuery.isLoading || workspaceSummaryQuery.isLoading ? (
        <LoadingState message="Loading monthly workspace summary..." />
      ) : null}

      {workspaceSummaryQuery.isError ? (
        <ErrorState description="We couldn't load the live monthly workspace summary for this period." />
      ) : null}

      {!summary && !workspaceSummaryQuery.isLoading && !workspaceSummaryQuery.isError ? (
        <EmptyState
          title="No monthly workspace data yet"
          description="Start with imports for this compliance period. Once data arrives, reconciliation, return, approval, and audit status will appear here."
          action={
            <Button asChild>
              <Link href="/imports">Go to Imports</Link>
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Import Status"
          value={String(summary?.imports_by_type_status.total_batches ?? 0)}
          detail="Import batches loaded for this compliance period."
          tone={(summary?.imports_by_type_status.total_batches ?? 0) > 0 ? "success" : "warning"}
        />
        <StatCard
          label="Reconciliation"
          value={String(issueCount)}
          detail="Outstanding mismatch and duplicate exceptions in the latest run."
          tone={issueCount > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Approval Queue"
          value={String(summary?.approvals.pending_count ?? 0)}
          detail="Pending approvals still blocking the period close."
          tone={(summary?.approvals.pending_count ?? 0) > 0 ? "danger" : "success"}
        />
        <StatCard
          label="Lock Status"
          value={summary?.lock_state.is_locked ? "Locked" : "Open"}
          detail={summary?.lock_state.is_locked ? "This period is protected from further changes." : "Operational changes are still allowed for this period."}
          tone={summary?.lock_state.is_locked ? "primary" : "warning"}
        />
      </div>

      <SectionCard title="Monthly workflow" description="Operational progress from import readiness through controlled closure.">
        <WorkflowTimeline steps={workflow} />
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard
          title="Period control summary"
          description="This is the live operating state for the selected monthly workspace."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="surface-muted px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Period</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{summary?.period_details?.period ?? periodQuery.data?.period ?? periodFallback?.label ?? "Not set"}</p>
            </div>
            <div className="surface-muted px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Due Date</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{formatDate(summary?.period_details?.due_date ?? periodQuery.data?.due_date ?? null)}</p>
            </div>
            <div className="surface-muted px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Return Status</p>
              <div className="mt-2">
                <ComplianceStatusBadge status={latestReturnStatus} />
              </div>
            </div>
            <div className="surface-muted px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Recommended Next Action</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{summary?.next_recommended_action ?? "Begin imports for this period."}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Button asChild size="sm" className="justify-start rounded-xl bg-primary shadow-lg shadow-indigo-500/20">
              <Link href="/imports"><FileSearch2 className="size-4" />Go to Imports</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="justify-start rounded-xl">
              <Link href="/reconciliation"><GitCompareArrows className="size-4" />Run Reconciliation</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="justify-start rounded-xl">
              <Link href="/returns"><CheckCircle2 className="size-4" />Prepare Returns</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="justify-start rounded-xl">
              <Link href="/approvals"><ActionLabel kind="view" label="View Approvals" icon={FileClock} /></Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="justify-start rounded-xl">
              <Link href="/audit-trail"><ActionLabel kind="view" label="View Audit Trail" icon={ArrowRight} /></Link>
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Workflow state by module" description="A compact module-by-module readout for this compliance period.">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Imports</p>
                <p className="mt-1 text-sm text-slate-600">Sales, purchase, and GSTR-2B ingestion for the selected period.</p>
              </div>
              <ComplianceStatusBadge status={(summary?.imports_by_type_status.total_batches ?? 0) > 0 ? "processed" : "pending"} />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Reconciliation</p>
                <p className="mt-1 text-sm text-slate-600">Latest GSTR-2B comparison and issue count.</p>
              </div>
              <ComplianceStatusBadge status={summary?.latest_reconciliation_run?.status ?? "pending"} />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">GSTR-1</p>
                <p className="mt-1 text-sm text-slate-600">Sales-side draft readiness for outward return review.</p>
              </div>
              <ComplianceStatusBadge status={String(summary?.return_preparation_statuses.gstr1.status ?? "not_prepared")} />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">GSTR-3B</p>
                <p className="mt-1 text-sm text-slate-600">Liability and ITC draft state after reconciliation.</p>
              </div>
              <ComplianceStatusBadge status={String(summary?.return_preparation_statuses.gstr3b.status ?? "not_prepared")} />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Approvals</p>
                <p className="mt-1 text-sm text-slate-600">Reviewer queue and monthly sign-off control status.</p>
              </div>
              <ComplianceStatusBadge status={(summary?.approvals.pending_count ?? 0) > 0 ? "pending" : "approved"} />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Lock state</p>
                <p className="mt-1 text-sm text-slate-600">Operational lock used to protect filed periods.</p>
              </div>
              <div className="flex items-center gap-2">
                {summary?.lock_state.is_locked ? <Lock className="size-4 text-rose-500" /> : <ShieldAlert className="size-4 text-amber-500" />}
                <ComplianceStatusBadge status={summary?.lock_state.is_locked ? "locked" : "open"} />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
