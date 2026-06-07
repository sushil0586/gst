"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileSpreadsheet, ShieldAlert, Sparkles, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGstTransactionsQuery } from "@/features/imports";
import { useReconciliationRunItemsQuery, useReconciliationRunsQuery } from "@/features/reconciliation";
import { useReturnQuery, useReturnReadinessQuery, useReturnsQuery } from "@/features/returns";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { GSTTransactionRecord, ReconciliationItemRecord, ReturnPreparationRecord, ReturnReadinessIssue } from "@/types/api";

const REVIEW_TABS = [
  "overview",
  "output-tax",
  "itc",
  "reconciliation",
  "decisions",
  "purchase-books",
  "portal-2b",
  "exceptions",
] as const;

type ReviewTab = (typeof REVIEW_TABS)[number];

function formatMoney(value?: string | number | null) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getStatusVariant(status: ReturnPreparationRecord["status"]) {
  if (status === "filed" || status === "approved") return "success" as const;
  if (status === "blocked_by_stale_reconciliation") return "danger" as const;
  if (status === "ready_for_review" || status === "validating") return "warning" as const;
  if (status === "failed") return "danger" as const;
  return "primary" as const;
}

function normalizeReviewTab(value: string | null): ReviewTab {
  return REVIEW_TABS.includes((value ?? "") as ReviewTab) ? ((value ?? "overview") as ReviewTab) : "overview";
}

function formatTabLabel(tab: ReviewTab) {
  if (tab === "output-tax") return "Output Tax";
  if (tab === "portal-2b") return "Portal 2B";
  if (tab === "purchase-books") return "Purchase Books";
  return tab.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
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

function sectionIssueMatch(issue: ReturnReadinessIssue, tab: ReviewTab) {
  const combined = `${issue.code} ${issue.title} ${issue.detail}`.toLowerCase();
  if (tab === "overview") return true;
  if (tab === "output-tax") return combined.includes("outward") || combined.includes("liability") || combined.includes("sales");
  if (tab === "itc") return combined.includes("itc") || combined.includes("2b") || combined.includes("purchase");
  if (tab === "reconciliation") return combined.includes("reconciliation") || combined.includes("mismatch") || combined.includes("portal");
  if (tab === "decisions") return combined.includes("claim") || combined.includes("defer") || combined.includes("blocked") || combined.includes("follow");
  if (tab === "purchase-books") return combined.includes("purchase") || combined.includes("books");
  if (tab === "portal-2b") return combined.includes("2b") || combined.includes("portal");
  if (tab === "exceptions") return combined.includes("period") || combined.includes("exception");
  return false;
}

function WarningList({ issues }: { issues: ReturnReadinessIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
        No warnings or blockers are scoped to this section right now.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {issues.map((issue) => (
        <div
          key={issue.code}
          className={`rounded-2xl border px-4 py-4 text-sm ${
            issue.severity === "error"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <div className="flex items-start gap-3">
            {issue.severity === "error" ? (
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            )}
            <div>
              <p className="font-semibold">{issue.title}</p>
              <p className="mt-1 leading-6">{issue.detail}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SourceTransactionTable({
  title,
  description,
  transactions,
}: {
  title: string;
  description: string;
  transactions: GSTTransactionRecord[];
}) {
  return (
    <SectionCard title={title} description={description}>
      {transactions.length === 0 ? (
        <EmptyState title="No rows in this section" description="Nothing from the current prepared return landed in this source bucket." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>POS</TableHead>
                <TableHead>Taxable value</TableHead>
                <TableHead>Tax amount</TableHead>
                <TableHead>Total amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900">{transaction.document_number}</p>
                      <p className="text-xs text-slate-500">{transaction.document_date || "No date"}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-slate-900">{transaction.counterparty_name || "Unknown vendor"}</p>
                      <p className="text-xs text-slate-500">{transaction.counterparty_gstin || "No GSTIN"}</p>
                    </div>
                  </TableCell>
                  <TableCell>{transaction.place_of_supply || "—"}</TableCell>
                  <TableCell>Rs. {formatMoney(transaction.taxable_value)}</TableCell>
                  <TableCell>Rs. {formatMoney(transaction.tax_amount)}</TableCell>
                  <TableCell>Rs. {formatMoney(transaction.total_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}

function ReconciliationTable({
  title,
  description,
  items,
  showDecision = false,
}: {
  title: string;
  description: string;
  items: ReconciliationItemRecord[];
  showDecision?: boolean;
}) {
  return (
    <SectionCard title={title} description={description}>
      {items.length === 0 ? (
        <EmptyState title="No rows in this section" description="Nothing from the latest reconciliation run landed in this bucket." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="hover:bg-transparent">
                <TableHead>Books invoice</TableHead>
                <TableHead>2B invoice</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Issue bucket</TableHead>
                <TableHead>ITC status</TableHead>
                {showDecision ? <TableHead>CA decision</TableHead> : null}
                <TableHead>Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.books_invoice || "—"}</TableCell>
                  <TableCell>{item.portal_invoice || "—"}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-slate-900">{item.counterparty_name || "Unknown vendor"}</p>
                      <p className="text-xs text-slate-500">{item.counterparty_gstin || "No GSTIN"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{item.issue_bucket.replace(/_/g, " ")}</TableCell>
                  <TableCell className="capitalize">{item.itc_status.replace(/_/g, " ")}</TableCell>
                  {showDecision ? <TableCell className="capitalize">{item.review_decision.replace(/_/g, " ")}</TableCell> : null}
                  <TableCell>Rs. {formatMoney(item.tax_difference)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}

function SummaryGrid({
  entries,
}: {
  entries: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <div key={entry.label} className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">{entry.label}</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{entry.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function Gstr3BReviewPage() {
  const searchParams = useSearchParams();
  const {
    selectedWorkspaceId,
    selectedClient,
    selectedClientId,
    selectedGstinId,
    selectedPeriod,
    selectedPeriodId,
  } = useWorkspaceContext();

  const returnId = searchParams.get("returnId");
  const requestedTab = normalizeReviewTab(searchParams.get("tab"));
  const filters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      period: selectedPeriodId ?? undefined,
      return_type: "gstr3b",
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId],
  );

  const returnsQuery = useReturnsQuery(filters);
  const detailQuery = useReturnQuery(returnId ?? undefined);
  const readinessQuery = useReturnReadinessQuery({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
  });
  const reconciliationRunsQuery = useReconciliationRunsQuery({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    compliance_period: selectedPeriodId ?? undefined,
  });
  const purchaseQuery = useGstTransactionsQuery({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    transaction_type: "purchase",
  });
  const gstr2bQuery = useGstTransactionsQuery({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    transaction_type: "gstr_2b",
  });

  const activeReturn = useMemo(() => {
    if (detailQuery.data?.return_type === "gstr3b") {
      return detailQuery.data;
    }
    return returnsQuery.data?.items.find((item) => item.return_type === "gstr3b") ?? null;
  }, [detailQuery.data, returnsQuery.data?.items]);

  const latestRun = reconciliationRunsQuery.data?.items[0] ?? null;
  const reconciliationItemsQuery = useReconciliationRunItemsQuery(latestRun?.id);
  const readiness = readinessQuery.data?.gstr3b ?? null;
  const allIssues = readiness?.issues ?? [];

  const purchaseTransactions = purchaseQuery.data?.items ?? [];
  const gstr2bTransactions = gstr2bQuery.data?.items ?? [];
  const reconciliationItems = reconciliationItemsQuery.data?.items ?? [];
  const manualDecisionItems = reconciliationItems.filter((item) => item.review_decision !== "auto");
  const unresolvedItems = reconciliationItems.filter((item) => item.match_status !== "matched" || item.action_status !== "resolved");

  const summary = (activeReturn?.summary_snapshot ?? {}) as Record<string, unknown>;
  const outwardSupplies = (summary.outward_supplies as Record<string, unknown> | undefined) ?? {};
  const itcSummary = (summary.itc_summary as Record<string, unknown> | undefined) ?? {};
  const reconciliationSummary = (summary.reconciliation as Record<string, unknown> | undefined) ?? {};
  const reviewHref = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedWorkspaceId) params.set("workspace", selectedWorkspaceId);
    if (selectedClientId) params.set("client", selectedClientId);
    if (selectedGstinId) params.set("gstin", selectedGstinId);
    if (selectedPeriodId) params.set("period", selectedPeriodId);
    if (activeReturn?.id) params.set("returnId", activeReturn.id);
    return `/returns?${params.toString()}`;
  }, [activeReturn, selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId]);

  const isLoading =
    returnsQuery.isLoading ||
    (Boolean(returnId) && detailQuery.isLoading) ||
    reconciliationRunsQuery.isLoading ||
    purchaseQuery.isLoading ||
    gstr2bQuery.isLoading ||
    reconciliationItemsQuery.isLoading;

  const isError =
    returnsQuery.isError ||
    detailQuery.isError ||
    reconciliationRunsQuery.isError ||
    purchaseQuery.isError ||
    gstr2bQuery.isError ||
    reconciliationItemsQuery.isError;

  if (!selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
    return <EmptyState title="Choose a full workspace context" description="Select workspace, client, GSTIN, and period before reviewing a GSTR-3B draft." />;
  }

  if (isLoading) {
    return <LoadingState message="Loading GSTR-3B review workspace..." />;
  }

  if (isError) {
    return <ErrorState title="We couldn’t load the GSTR-3B review workspace" description="Refresh the page or return to the returns workspace and try again." />;
  }

  if (!activeReturn) {
    return <EmptyState title="No GSTR-3B draft found" description="Prepare a GSTR-3B return for the selected context before opening the review workspace." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="GSTR-3B Review"
        description="Review output tax, ITC posture, reconciliation impact, and CA decisions in-app before approving or filing the prepared return."
        actions={[{ label: "Back to Returns", href: reviewHref }]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title={`${selectedClient?.legal_name ?? activeReturn.client_name ?? "Client"} · ${selectedPeriod?.period ?? activeReturn.compliance_period_label ?? ""}`}
          description="This workspace turns the prepared GSTR-3B snapshot and latest reconciliation run into an in-app review surface so export is secondary."
          variant="soft"
          action={<StatusBadge label={activeReturn.status.replace(/_/g, " ")} variant={getStatusVariant(activeReturn.status)} />}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Output tax" value={`Rs. ${formatMoney(String(outwardSupplies.outward_tax_liability ?? "0.00"))}`} detail="Prepared outward tax liability." tone="warning" variant="soft" />
            <StatCard label="Claim-ready ITC" value={`Rs. ${formatMoney(String(itcSummary.claim_ready_itc ?? itcSummary.eligible_itc ?? "0.00"))}`} detail="ITC currently considered safe to claim." tone="success" variant="soft" />
            <StatCard label="Net tax payable" value={`Rs. ${formatMoney(String(itcSummary.net_tax_payable ?? "0.00"))}`} detail="Net tax payable after claim-ready ITC." tone="danger" variant="soft" />
            <StatCard label="Period Exceptions" value={String(getPeriodExceptionCountFromSummary(summary))} detail="Source rows accepted with period exception handling." tone="danger" variant="soft" />
          </div>
        </SectionCard>

        <SectionCard title="Review posture" description="Use this as the working surface before export, approval, or filing." variant="soft">
          <div className="space-y-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-indigo-600" />
                <div>
                  <p className="font-semibold text-slate-900">CA review in context</p>
                  <p className="mt-1 leading-6">See claim-ready ITC, at-risk ITC, and review decisions in the same place instead of jumping between reconciliation and final return prep.</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-slate-900">Reconciliation remains visible</p>
                  <p className="mt-1 leading-6">The page keeps unresolved rows and manual decisions visible so filing never hides the mismatch story underneath.</p>
                </div>
              </div>
            </div>
            {requestedTab !== "overview" ? (
              <div className="rounded-2xl bg-indigo-50 px-4 py-4 text-sm text-indigo-900">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-indigo-600" />
                  <div>
                    <p className="font-semibold text-slate-900">Focused review entry</p>
                    <p className="mt-1 leading-6">
                      You landed directly on <span className="font-semibold">{formatTabLabel(requestedTab)}</span> so the highest-signal section is ready first.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <Button asChild variant="outline" className="w-full">
              <Link href={reviewHref}>
                <ArrowLeft className="size-4" />
                <span className="ml-2">Return to returns workspace</span>
              </Link>
            </Button>
          </div>
        </SectionCard>
      </div>

      <Tabs key={requestedTab} defaultValue={requestedTab} className="gap-5">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto rounded-none border-b border-slate-200 bg-transparent p-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="output-tax">Output Tax</TabsTrigger>
          <TabsTrigger value="itc">ITC</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="purchase-books">Purchase Books</TabsTrigger>
          <TabsTrigger value="portal-2b">Portal 2B</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <SectionCard title="Prepared GSTR-3B snapshot" description="High-level tax and ITC truth from the prepared return.">
            <SummaryGrid
              entries={[
                { label: "Output taxable value", value: `Rs. ${formatMoney(String(outwardSupplies.outward_taxable_value ?? "0.00"))}` },
                { label: "Output tax liability", value: `Rs. ${formatMoney(String(outwardSupplies.outward_tax_liability ?? "0.00"))}` },
                { label: "Books ITC", value: `Rs. ${formatMoney(String(itcSummary.books_itc ?? "0.00"))}` },
                { label: "2B reflected ITC", value: `Rs. ${formatMoney(String(itcSummary.reflected_itc ?? "0.00"))}` },
                { label: "Claim-ready ITC", value: `Rs. ${formatMoney(String(itcSummary.claim_ready_itc ?? itcSummary.eligible_itc ?? "0.00"))}` },
                { label: "ITC at risk", value: `Rs. ${formatMoney(String(itcSummary.itc_at_risk ?? "0.00"))}` },
                { label: "Net tax payable", value: `Rs. ${formatMoney(String(itcSummary.net_tax_payable ?? "0.00"))}` },
                { label: "Unresolved mismatches", value: String(itcSummary.unresolved_mismatch_count ?? 0) },
              ]}
            />
          </SectionCard>
          <SectionCard title="Current review risks" description="Warnings, blockers, and exception signals for this prepared return.">
            <WarningList issues={allIssues} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="output-tax" className="space-y-6">
          <SectionCard title="Output tax summary" description="Outward tax position carried into this GSTR-3B draft.">
            <SummaryGrid
              entries={[
                { label: "Outward taxable value", value: `Rs. ${formatMoney(String(outwardSupplies.outward_taxable_value ?? "0.00"))}` },
                { label: "Outward tax liability", value: `Rs. ${formatMoney(String(outwardSupplies.outward_tax_liability ?? "0.00"))}` },
                { label: "Net tax payable", value: `Rs. ${formatMoney(String(itcSummary.net_tax_payable ?? "0.00"))}` },
              ]}
            />
          </SectionCard>
          <SectionCard title="Output tax warnings" description="Warnings relevant to the outward side of this GSTR-3B.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "output-tax"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="itc" className="space-y-6">
          <SectionCard title="ITC posture" description="How the latest reconciliation run shaped claim-ready and at-risk ITC.">
            <SummaryGrid
              entries={[
                { label: "Books ITC", value: `Rs. ${formatMoney(String(itcSummary.books_itc ?? "0.00"))}` },
                { label: "2B reflected ITC", value: `Rs. ${formatMoney(String(itcSummary.reflected_itc ?? "0.00"))}` },
                { label: "Claim-ready ITC", value: `Rs. ${formatMoney(String(itcSummary.claim_ready_itc ?? itcSummary.eligible_itc ?? "0.00"))}` },
                { label: "Pending in 2B ITC", value: `Rs. ${formatMoney(String(itcSummary.pending_2b_itc ?? "0.00"))}` },
                { label: "Pending review ITC", value: `Rs. ${formatMoney(String(itcSummary.pending_review_itc ?? "0.00"))}` },
                { label: "Blocked ITC", value: `Rs. ${formatMoney(String(itcSummary.blocked_itc ?? "0.00"))}` },
                { label: "Timing-difference ITC", value: `Rs. ${formatMoney(String(itcSummary.timing_difference_itc ?? "0.00"))}` },
                { label: "Vendor follow-up ITC", value: `Rs. ${formatMoney(String(itcSummary.vendor_followup_required_itc ?? "0.00"))}` },
              ]}
            />
          </SectionCard>
          <SectionCard title="ITC warnings" description="Warnings most relevant to purchase-side claim quality and portal alignment.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "itc"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="reconciliation" className="space-y-6">
          <SectionCard title="Latest reconciliation run" description="Most recent GSTR-2B purchase reconciliation driving this prepared GSTR-3B.">
            <SummaryGrid
              entries={[
                { label: "Matched rows", value: String(latestRun?.matched_count ?? 0) },
                { label: "Partial match rows", value: String(latestRun?.partial_match_count ?? 0) },
                { label: "Missing in books", value: String(latestRun?.missing_in_books_count ?? 0) },
                { label: "Missing in 2B", value: String(latestRun?.missing_in_portal_count ?? 0) },
                { label: "Duplicate rows", value: String(latestRun?.duplicate_count ?? 0) },
                { label: "Total ITC at risk", value: `Rs. ${formatMoney(String(latestRun?.total_itc_at_risk ?? "0.00"))}` },
              ]}
            />
          </SectionCard>
          <ReconciliationTable
            title="Unresolved reconciliation rows"
            description="Rows that still need correction, deferral, blocking, or vendor follow-up before you treat them as clean ITC."
            items={unresolvedItems}
          />
          <SectionCard title="Reconciliation warnings" description="Warnings tied to mismatches and unresolved purchase-vs-2B issues.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "reconciliation"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="decisions" className="space-y-6">
          <SectionCard title="Manual review decisions" description="Explicit CA overrides applied on reconciliation rows before this GSTR-3B was prepared.">
            <SummaryGrid
              entries={[
                { label: "Manual decisions", value: String(reconciliationSummary.manual_review_decision_count ?? 0) },
                { label: "Claim now", value: String(reconciliationSummary.manual_claim_now_count ?? 0) },
                { label: "Defer", value: String(reconciliationSummary.manual_defer_count ?? 0) },
                { label: "Blocked", value: String(reconciliationSummary.manual_blocked_count ?? 0) },
                { label: "Vendor follow-up", value: String(reconciliationSummary.manual_vendor_followup_count ?? 0) },
              ]}
            />
          </SectionCard>
          <ReconciliationTable
            title="Rows with CA decisions"
            description="These rows no longer rely purely on the raw system ITC status because a reviewer set an explicit treatment."
            items={manualDecisionItems}
            showDecision
          />
          {(reconciliationSummary.prior_period_deferred_count as number | undefined) ? (
            <SectionCard title="Deferred from prior review" description="Items intentionally held back in the previous period so this month’s reviewer can recheck them.">
              <SummaryGrid
                entries={[
                  { label: "Prior period", value: String(reconciliationSummary.prior_period_deferred_period ?? "Earlier period") },
                  { label: "Deferred rows", value: String(reconciliationSummary.prior_period_deferred_count ?? 0) },
                  { label: "Deferred ITC", value: `Rs. ${formatMoney(String(reconciliationSummary.prior_period_deferred_itc ?? "0.00"))}` },
                ]}
              />
            </SectionCard>
          ) : null}
        </TabsContent>

        <TabsContent value="purchase-books" className="space-y-6">
          <SourceTransactionTable
            title="Purchase books rows"
            description="Books-side inward purchase rows available for this GSTR-3B context."
            transactions={purchaseTransactions}
          />
          <SectionCard title="Books-side warnings" description="Warnings most relevant to purchase-book completeness and correction quality.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "purchase-books"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="portal-2b" className="space-y-6">
          <SourceTransactionTable
            title="Portal 2B rows"
            description="Portal-side GSTR-2B rows imported into the current compliance period."
            transactions={gstr2bTransactions}
          />
          <SectionCard title="2B-side warnings" description="Warnings most relevant to portal reflection, import completeness, and cross-source alignment.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "portal-2b"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="exceptions" className="space-y-6">
          <SectionCard title="Period exceptions and context risks" description="Source-level exceptions that may still matter before you finalize this GSTR-3B.">
            <SummaryGrid
              entries={[
                { label: "Source period exceptions", value: String(getPeriodExceptionCountFromSummary(summary)) },
                { label: "Reconciliation run stale", value: latestRun?.is_stale ? "Yes" : "No" },
                { label: "Return blocked by stale run", value: activeReturn.is_blocked_by_stale_reconciliation ? "Yes" : "No" },
              ]}
            />
          </SectionCard>
          <SectionCard title="Exception-focused warnings" description="Warnings tied to source exceptions, stale reconciliation, or contextual review concerns.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "exceptions"))} />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href={reviewHref}>
            <ArrowLeft className="size-4" />
            <span className="ml-2">Back to returns</span>
          </Link>
        </Button>
        <Button asChild>
          <Link href={reviewHref}>
            <FileSpreadsheet className="size-4" />
            <span className="ml-2">Use export and filing actions in Returns</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
