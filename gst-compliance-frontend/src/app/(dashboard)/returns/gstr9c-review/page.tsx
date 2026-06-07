"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, BookOpenText, ShieldAlert, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/status/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useReturnQuery, useReturnReadinessQuery, useReturnsQuery } from "@/features/returns";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { ReturnPreparationRecord, ReturnReadinessIssue } from "@/types/api";

const REVIEW_TABS = ["overview", "books", "gstr9-base", "comparison", "exceptions"] as const;
type ReviewTab = (typeof REVIEW_TABS)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

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
  if (tab === "gstr9-base") return "GSTR-9 Base";
  return tab.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function issueMatchesTab(issue: ReturnReadinessIssue, tab: ReviewTab) {
  const combined = `${issue.code} ${issue.title} ${issue.detail}`.toLowerCase();
  if (tab === "overview") return true;
  if (tab === "books") return combined.includes("books") || combined.includes("transaction");
  if (tab === "gstr9-base") return combined.includes("gstr-9") || combined.includes("anchor") || combined.includes("annual");
  if (tab === "comparison") return combined.includes("variance") || combined.includes("comparison") || combined.includes("itc");
  if (tab === "exceptions") return combined.includes("blocked") || combined.includes("warning") || combined.includes("period");
  return false;
}

function WarningList({ issues }: { issues: ReturnReadinessIssue[] }) {
  if (issues.length === 0) {
    return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">No warnings or blockers are scoped to this section right now.</div>;
  }

  return (
    <div className="space-y-3">
      {issues.map((issue) => (
        <div
          key={issue.code}
          className={`rounded-2xl border px-4 py-4 text-sm ${
            issue.severity === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"
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

export default function Gstr9cReviewPage() {
  const searchParams = useSearchParams();
  const { selectedWorkspaceId, selectedClient, selectedClientId, selectedGstinId, selectedPeriodId } = useWorkspaceContext();

  const returnId = searchParams.get("returnId");
  const requestedTab = normalizeReviewTab(searchParams.get("tab"));

  const currentPeriodFilters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      period: selectedPeriodId ?? undefined,
      return_type: "gstr9c",
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId],
  );

  const returnsQuery = useReturnsQuery(currentPeriodFilters);
  const detailQuery = useReturnQuery(returnId ?? undefined);
  const readinessQuery = useReturnReadinessQuery({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
  });

  const activeReturn = useMemo(() => {
    if (detailQuery.data?.return_type === "gstr9c") {
      return detailQuery.data;
    }
    return returnsQuery.data?.items.find((item) => item.return_type === "gstr9c") ?? null;
  }, [detailQuery.data, returnsQuery.data?.items]);

  const readiness = readinessQuery.data?.gstr9c ?? null;
  const allIssues = readiness?.issues ?? [];
  const summary = asRecord(activeReturn?.summary_snapshot) ?? {};
  const booksSummary = asRecord(summary.books_summary) ?? {};
  const gstr9Summary = asRecord(summary.gstr9_summary) ?? {};
  const comparisonSummary = asRecord(summary.comparison_summary) ?? {};
  const sourceTrace = asRecord(summary.source_trace) ?? {};
  const warningsSummary = asRecord(summary.warnings_summary) ?? {};
  const sourceMonths = asRecord(summary.source_months) ?? {};

  const reviewHref = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedWorkspaceId) params.set("workspace", selectedWorkspaceId);
    if (selectedClientId) params.set("client", selectedClientId);
    if (selectedGstinId) params.set("gstin", selectedGstinId);
    if (selectedPeriodId) params.set("period", selectedPeriodId);
    if (activeReturn?.id) params.set("returnId", activeReturn.id);
    return `/returns?${params.toString()}`;
  }, [activeReturn, selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId]);

  const isLoading = returnsQuery.isLoading || (Boolean(returnId) && detailQuery.isLoading);
  const isError = returnsQuery.isError || detailQuery.isError;

  if (!selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
    return <EmptyState title="Choose a full workspace context" description="Select workspace, client, GSTIN, and period before reviewing a GSTR-9C draft." />;
  }

  if (isLoading) {
    return <LoadingState message="Loading GSTR-9C review workspace..." />;
  }

  if (isError) {
    return <ErrorState title="We couldn’t load the GSTR-9C review workspace" description="Refresh the page or return to the returns workspace and try again." />;
  }

  if (!activeReturn) {
    return <EmptyState title="No GSTR-9C draft found" description="Prepare a GSTR-9C return for the selected context before opening the review workspace." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="GSTR-9C Review"
        description="Review the annual comparison between books and the prepared GSTR-9 base before moving into fuller annual certification workflows."
        actions={[{ label: "Back to Returns", href: reviewHref }]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title={`${selectedClient?.legal_name ?? activeReturn.client_name ?? "Client"} · FY ${String(summary.financial_year ?? "Annual view")}`}
          description="This first version focuses on books vs GSTR-9 comparison signals, not the full eventual certification workflow."
          variant="soft"
          action={<StatusBadge label={activeReturn.status.replace(/_/g, " ")} variant={getStatusVariant(activeReturn.status)} />}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Books outward taxable" value={`Rs. ${formatMoney(String(booksSummary.outward_taxable_value ?? "0.00"))}`} detail="Annual outward taxable value from books." tone="warning" variant="soft" />
            <StatCard label="GSTR-9 outward taxable" value={`Rs. ${formatMoney(String(gstr9Summary.annual_taxable_value ?? "0.00"))}`} detail="Annual outward taxable value from the anchor GSTR-9." tone="primary" variant="soft" />
            <StatCard label="Books ITC" value={`Rs. ${formatMoney(String(booksSummary.books_itc ?? "0.00"))}`} detail="Annual purchase-tax view from books." tone="success" variant="soft" />
            <StatCard label="Warning count" value={String(warningsSummary.warning_count ?? 0)} detail="Comparison or dependency warnings on this annual draft." tone="danger" variant="soft" />
          </div>
        </SectionCard>

        <SectionCard title="Comparison posture" description="Use this as the first annual comparison desk before the deeper 9C workflow matures." variant="soft">
          <div className="space-y-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-indigo-600" />
                <div>
                  <p className="font-semibold text-slate-900">Comparison-first annual review</p>
                  <p className="mt-1 leading-6">GSTR-9C starts from a practical question: do annual books and the prepared GSTR-9 base materially align?</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <BookOpenText className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-slate-900">Books remain visible</p>
                  <p className="mt-1 leading-6">This workspace keeps books-side annual totals visible so reviewers can decide whether a deeper auditor-style adjustment pass is needed.</p>
                </div>
              </div>
            </div>
            {requestedTab !== "overview" ? (
              <div className="rounded-2xl bg-indigo-50 px-4 py-4 text-sm text-indigo-900">
                Focused review entry: you opened this draft directly on <span className="font-semibold">{formatTabLabel(requestedTab)}</span>.
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <Tabs defaultValue={requestedTab} className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
          {REVIEW_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="rounded-xl px-4 py-2 text-sm">
              {formatTabLabel(tab)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <SectionCard title="Annual comparison summary" description="Top-line comparison between books and the prepared GSTR-9 base.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Outward taxable variance" value={`Rs. ${formatMoney(String(comparisonSummary.outward_taxable_variance ?? "0.00"))}`} detail="Books outward taxable minus GSTR-9 outward taxable." tone="warning" variant="soft" />
              <StatCard label="Outward tax variance" value={`Rs. ${formatMoney(String(comparisonSummary.outward_tax_variance ?? "0.00"))}`} detail="Books outward tax minus GSTR-9 liability." tone="danger" variant="soft" />
              <StatCard label="Books ITC variance" value={`Rs. ${formatMoney(String(comparisonSummary.books_itc_variance ?? "0.00"))}`} detail="Books ITC minus GSTR-9 books ITC." tone="success" variant="soft" />
              <StatCard label="Claim-ready ITC variance" value={`Rs. ${formatMoney(String(comparisonSummary.claim_ready_itc_variance ?? "0.00"))}`} detail="Books ITC minus GSTR-9 claim-ready ITC." tone="primary" variant="soft" />
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="books" className="space-y-4">
          <SectionCard title="Books annual summary" description="Annual books-side totals feeding the first GSTR-9C comparison.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Outward taxable value</p><p className="mt-2 text-lg font-semibold text-slate-900">Rs. {formatMoney(String(booksSummary.outward_taxable_value ?? "0.00"))}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Outward tax amount</p><p className="mt-2 text-lg font-semibold text-slate-900">Rs. {formatMoney(String(booksSummary.outward_tax_amount ?? "0.00"))}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Books ITC</p><p className="mt-2 text-lg font-semibold text-slate-900">Rs. {formatMoney(String(booksSummary.books_itc ?? "0.00"))}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Source months counted</p><p className="mt-2 text-lg font-semibold text-slate-900">{String(sourceMonths.annual_month_count ?? 0)}</p></div>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="gstr9-base" className="space-y-4">
          <SectionCard title="Anchor GSTR-9 base" description="The prepared GSTR-9 draft used as the annual comparison anchor.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Anchor return id</p><p className="mt-2 break-all text-lg font-semibold text-slate-900">{String(sourceTrace.gstr9_return_id ?? "Not linked")}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Annual taxable value</p><p className="mt-2 text-lg font-semibold text-slate-900">Rs. {formatMoney(String(gstr9Summary.annual_taxable_value ?? "0.00"))}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Annual tax liability</p><p className="mt-2 text-lg font-semibold text-slate-900">Rs. {formatMoney(String(gstr9Summary.annual_tax_liability ?? "0.00"))}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Claim-ready ITC</p><p className="mt-2 text-lg font-semibold text-slate-900">Rs. {formatMoney(String(gstr9Summary.claim_ready_itc ?? "0.00"))}</p></div>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4">
          <SectionCard title="Comparison details" description="Direct variance view for the first 9C pass.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Books</TableHead>
                  <TableHead>GSTR-9</TableHead>
                  <TableHead>Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Outward taxable value</TableCell>
                  <TableCell>Rs. {formatMoney(String(booksSummary.outward_taxable_value ?? "0.00"))}</TableCell>
                  <TableCell>Rs. {formatMoney(String(gstr9Summary.annual_taxable_value ?? "0.00"))}</TableCell>
                  <TableCell>Rs. {formatMoney(String(comparisonSummary.outward_taxable_variance ?? "0.00"))}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Outward tax amount</TableCell>
                  <TableCell>Rs. {formatMoney(String(booksSummary.outward_tax_amount ?? "0.00"))}</TableCell>
                  <TableCell>Rs. {formatMoney(String(gstr9Summary.annual_tax_liability ?? "0.00"))}</TableCell>
                  <TableCell>Rs. {formatMoney(String(comparisonSummary.outward_tax_variance ?? "0.00"))}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Books ITC</TableCell>
                  <TableCell>Rs. {formatMoney(String(booksSummary.books_itc ?? "0.00"))}</TableCell>
                  <TableCell>Rs. {formatMoney(String(gstr9Summary.books_itc ?? "0.00"))}</TableCell>
                  <TableCell>Rs. {formatMoney(String(comparisonSummary.books_itc_variance ?? "0.00"))}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Claim-ready ITC</TableCell>
                  <TableCell>Rs. {formatMoney(String(booksSummary.books_itc ?? "0.00"))}</TableCell>
                  <TableCell>Rs. {formatMoney(String(gstr9Summary.claim_ready_itc ?? "0.00"))}</TableCell>
                  <TableCell>Rs. {formatMoney(String(comparisonSummary.claim_ready_itc_variance ?? "0.00"))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SectionCard>
        </TabsContent>

        <TabsContent value="exceptions" className="space-y-4">
          <SectionCard title="Warnings and blockers" description="Annual dependency and variance issues that still need reviewer attention.">
            <WarningList issues={allIssues.filter((issue) => issueMatchesTab(issue, requestedTab))} />
          </SectionCard>

          <SectionCard title="Source dependencies" description="The first GSTR-9C slice depends on annual books plus a prepared anchor GSTR-9.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Anchor GSTR-9 present</p><p className="mt-2 text-lg font-semibold text-slate-900">{sourceTrace.gstr9_return_id ? "Yes" : "No"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Missing source periods</p><p className="mt-2 text-lg font-semibold text-slate-900">{asStringArray(sourceMonths.missing_periods).length}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Blocked source periods</p><p className="mt-2 text-lg font-semibold text-slate-900">{asStringArray(sourceMonths.blocked_source_periods).length}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Linked source returns</p><p className="mt-2 text-lg font-semibold text-slate-900">{asStringArray(sourceTrace.gstr1_return_ids).length + asStringArray(sourceTrace.gstr3b_return_ids).length}</p></div>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
