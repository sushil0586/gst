"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarRange, FileSpreadsheet, ShieldAlert, Sparkles, TriangleAlert } from "lucide-react";

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
import { useReturnQuery, useReturnReadinessQuery, useReturnsQuery } from "@/features/returns";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { ReturnPreparationRecord, ReturnReadinessIssue } from "@/types/api";

const REVIEW_TABS = ["overview", "outward", "itc", "source-months", "exceptions"] as const;
type ReviewTab = (typeof REVIEW_TABS)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
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
  if (tab === "source-months") return "Source Months";
  if (tab === "itc") return "ITC";
  return tab.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function sectionIssueMatch(issue: ReturnReadinessIssue, tab: ReviewTab) {
  const combined = `${issue.code} ${issue.title} ${issue.detail}`.toLowerCase();
  if (tab === "overview") return true;
  if (tab === "outward") return combined.includes("gstr-1") || combined.includes("annual") || combined.includes("outward");
  if (tab === "itc") return combined.includes("gstr-3b") || combined.includes("itc");
  if (tab === "source-months") return combined.includes("month") || combined.includes("source") || combined.includes("year-end");
  if (tab === "exceptions") return combined.includes("blocked") || combined.includes("failed") || combined.includes("period");
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

function SummaryGrid({ entries }: { entries: Array<{ label: string; value: string }> }) {
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

export default function Gstr9ReviewPage() {
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
      return_type: "gstr9",
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId],
  );
  const annualSourceFilters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId],
  );

  const returnsQuery = useReturnsQuery(currentPeriodFilters);
  const annualSourceReturnsQuery = useReturnsQuery(annualSourceFilters);
  const detailQuery = useReturnQuery(returnId ?? undefined);
  const readinessQuery = useReturnReadinessQuery({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
  });

  const activeReturn = useMemo(() => {
    if (detailQuery.data?.return_type === "gstr9") {
      return detailQuery.data;
    }
    return returnsQuery.data?.items.find((item) => item.return_type === "gstr9") ?? null;
  }, [detailQuery.data, returnsQuery.data?.items]);

  const readiness = readinessQuery.data?.gstr9 ?? null;
  const allIssues = readiness?.issues ?? [];
  const summary = asRecord(activeReturn?.summary_snapshot) ?? {};
  const outwardSummary = asRecord(summary.outward_summary) ?? {};
  const itcSummary = asRecord(summary.itc_summary) ?? {};
  const liabilitySummary = asRecord(summary.liability_summary) ?? {};
  const annualSections = asRecord(summary.annual_sections) ?? {};
  const sourceMonths = asRecord(summary.source_months) ?? {};
  const warningsSummary = asRecord(summary.warnings_summary) ?? {};
  const sourceTrace = asRecord(summary.source_trace) ?? {};

  const gstr1SourceIds = asStringArray(sourceTrace.gstr1_return_ids);
  const gstr3bSourceIds = asStringArray(sourceTrace.gstr3b_return_ids);
  const expectedPeriods = asStringArray(sourceMonths.expected_periods);
  const availablePeriods = asStringArray(sourceMonths.available_periods);
  const missingPeriods = asStringArray(sourceMonths.missing_periods);
  const blockedPeriods = asStringArray(sourceMonths.blocked_source_periods);
  const failedPeriods = asStringArray(sourceMonths.failed_source_periods);
  const filedPeriods = asStringArray(sourceMonths.filed_source_periods);

  const allSourceReturns = annualSourceReturnsQuery.data?.items ?? [];
  const linkedSourceReturns = allSourceReturns.filter((item) => [...gstr1SourceIds, ...gstr3bSourceIds].includes(item.id));

  const reviewHref = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedWorkspaceId) params.set("workspace", selectedWorkspaceId);
    if (selectedClientId) params.set("client", selectedClientId);
    if (selectedGstinId) params.set("gstin", selectedGstinId);
    if (selectedPeriodId) params.set("period", selectedPeriodId);
    if (activeReturn?.id) params.set("returnId", activeReturn.id);
    return `/returns?${params.toString()}`;
  }, [activeReturn, selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId]);

  const isLoading = returnsQuery.isLoading || annualSourceReturnsQuery.isLoading || (Boolean(returnId) && detailQuery.isLoading);
  const isError = returnsQuery.isError || annualSourceReturnsQuery.isError || detailQuery.isError;

  if (!selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
    return <EmptyState title="Choose a full workspace context" description="Select workspace, client, GSTIN, and period before reviewing a GSTR-9 draft." />;
  }

  if (isLoading) {
    return <LoadingState message="Loading GSTR-9 review workspace..." />;
  }

  if (isError) {
    return <ErrorState title="We couldn’t load the GSTR-9 review workspace" description="Refresh the page or return to the returns workspace and try again." />;
  }

  if (!activeReturn) {
    return <EmptyState title="No GSTR-9 draft found" description="Prepare a GSTR-9 return for the selected context before opening the review workspace." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="GSTR-9 Review"
        description="Review the annual rollup from monthly GSTR-1 and GSTR-3B drafts in-app before you move into later annual compliance workflows."
        actions={[{ label: "Back to Returns", href: reviewHref }]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title={`${selectedClient?.legal_name ?? activeReturn.client_name ?? "Client"} · FY ${String(summary.financial_year ?? "Annual view")}`}
          description="This workspace turns the first GSTR-9 annual snapshot into an in-app review surface so annual completeness is visible before exports or later audit-style work."
          variant="soft"
          action={<StatusBadge label={activeReturn.status.replace(/_/g, " ")} variant={getStatusVariant(activeReturn.status)} />}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Annual taxable value" value={`Rs. ${formatMoney(String(outwardSummary.annual_taxable_value ?? "0.00"))}`} detail="GSTR-1-led annual outward taxable value." tone="warning" variant="soft" />
            <StatCard label="Annual tax liability" value={`Rs. ${formatMoney(String(outwardSummary.annual_tax_liability ?? "0.00"))}`} detail="GSTR-3B-led annual tax liability." tone="danger" variant="soft" />
            <StatCard label="Claim-ready ITC" value={`Rs. ${formatMoney(String(itcSummary.claim_ready_itc ?? "0.00"))}`} detail="Annual claim-ready ITC from monthly GSTR-3B snapshots." tone="success" variant="soft" />
            <StatCard label="Source months available" value={`${availablePeriods.length}/${expectedPeriods.length}`} detail="Monthly source-return coverage in this financial year." tone="primary" variant="soft" />
          </div>
        </SectionCard>

        <SectionCard title="Annual review posture" description="Use this as the working surface for annual completeness before deeper GSTR-9 and GSTR-9C build-out." variant="soft">
          <div className="space-y-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-indigo-600" />
                <div>
                  <p className="font-semibold text-slate-900">Annual rollup first</p>
                  <p className="mt-1 leading-6">This first version focuses on monthly source coverage, annual totals, and annual warnings before we add deeper table-by-table GSTR-9 sections.</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <CalendarRange className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-slate-900">Source month completeness stays visible</p>
                  <p className="mt-1 leading-6">Missing, blocked, or failed source months remain front and center so annual review never hides monthly gaps underneath.</p>
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
                      You landed directly on <span className="font-semibold">{formatTabLabel(requestedTab)}</span> so the highest-signal annual section is ready first.
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
          <TabsTrigger value="outward">Outward</TabsTrigger>
          <TabsTrigger value="itc">ITC</TabsTrigger>
          <TabsTrigger value="source-months">Source Months</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <SectionCard title="Prepared GSTR-9 snapshot" description="Annual summary from the first GSTR-9 rollup contract.">
            <SummaryGrid
              entries={[
                { label: "Financial year", value: String(summary.financial_year ?? "—") },
                { label: "Anchor period", value: String(summary.anchor_period ?? "—") },
                { label: "Annual taxable value", value: `Rs. ${formatMoney(String(outwardSummary.annual_taxable_value ?? "0.00"))}` },
                { label: "Annual tax liability", value: `Rs. ${formatMoney(String(outwardSummary.annual_tax_liability ?? "0.00"))}` },
                { label: "Annual claim-ready ITC", value: `Rs. ${formatMoney(String(liabilitySummary.annual_claim_ready_itc ?? "0.00"))}` },
                { label: "Annual net tax payable", value: `Rs. ${formatMoney(String(liabilitySummary.net_tax_payable ?? "0.00"))}` },
                { label: "Warning count", value: String(warningsSummary.warning_count ?? 0) },
                { label: "Available source months", value: `${availablePeriods.length}/${expectedPeriods.length}` },
              ]}
            />
          </SectionCard>
          <SectionCard title="Current annual review risks" description="Warnings and blockers for this annual rollup.">
            <WarningList issues={allIssues} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="outward" className="space-y-6">
          <SectionCard title="Annual outward summary" description="Annual outward comparison between monthly GSTR-1 and GSTR-3B aggregates.">
            <SummaryGrid
              entries={[
                { label: "GSTR-1 taxable value", value: `Rs. ${formatMoney(String(outwardSummary.gstr1_taxable_value ?? "0.00"))}` },
                { label: "GSTR-1 tax amount", value: `Rs. ${formatMoney(String(outwardSummary.gstr1_tax_amount ?? "0.00"))}` },
                { label: "GSTR-3B outward taxable value", value: `Rs. ${formatMoney(String(outwardSummary.gstr3b_outward_taxable_value ?? "0.00"))}` },
                { label: "GSTR-3B tax liability", value: `Rs. ${formatMoney(String(outwardSummary.gstr3b_outward_tax_liability ?? "0.00"))}` },
                { label: "Amendment document count", value: String(asRecord(annualSections.notes_and_amendments)?.amendment_document_count ?? 0) },
              ]}
            />
          </SectionCard>
          <SectionCard title="Outward warnings" description="Warnings tied to annual outward completeness.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "outward"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="itc" className="space-y-6">
          <SectionCard title="Annual ITC summary" description="Annual ITC and liability position aggregated from monthly GSTR-3B drafts.">
            <SummaryGrid
              entries={[
                { label: "Books ITC", value: `Rs. ${formatMoney(String(itcSummary.books_itc ?? "0.00"))}` },
                { label: "2B reflected ITC", value: `Rs. ${formatMoney(String(itcSummary.reflected_itc ?? "0.00"))}` },
                { label: "Claim-ready ITC", value: `Rs. ${formatMoney(String(itcSummary.claim_ready_itc ?? "0.00"))}` },
                { label: "Pending in 2B ITC", value: `Rs. ${formatMoney(String(itcSummary.pending_2b_itc ?? "0.00"))}` },
                { label: "Pending review ITC", value: `Rs. ${formatMoney(String(itcSummary.pending_review_itc ?? "0.00"))}` },
                { label: "Blocked ITC", value: `Rs. ${formatMoney(String(itcSummary.blocked_itc ?? "0.00"))}` },
                { label: "ITC at risk", value: `Rs. ${formatMoney(String(itcSummary.itc_at_risk ?? "0.00"))}` },
                { label: "Net tax payable", value: `Rs. ${formatMoney(String(liabilitySummary.net_tax_payable ?? "0.00"))}` },
              ]}
            />
          </SectionCard>
          <SectionCard title="ITC warnings" description="Warnings tied to annual ITC confidence and source completeness.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "itc"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="source-months" className="space-y-6">
          <SectionCard title="Source month coverage" description="Expected and available source periods in this financial year.">
            <SummaryGrid
              entries={[
                { label: "Expected months", value: String(expectedPeriods.length) },
                { label: "Available months", value: String(availablePeriods.length) },
                { label: "Missing months", value: String(missingPeriods.length) },
                { label: "Blocked months", value: String(blockedPeriods.length) },
                { label: "Failed months", value: String(failedPeriods.length) },
                { label: "Filed months", value: String(filedPeriods.length) },
              ]}
            />
          </SectionCard>
          <SectionCard title="Linked source returns" description="Monthly GSTR-1 and GSTR-3B drafts currently feeding this annual rollup.">
            {linkedSourceReturns.length === 0 ? (
              <EmptyState title="No linked source returns found" description="Prepare monthly GSTR-1 and GSTR-3B returns before using the annual review surface." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Period</TableHead>
                      <TableHead>Return type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Return id</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedSourceReturns
                      .slice()
                      .sort((left, right) => left.compliance_period_label.localeCompare(right.compliance_period_label))
                      .map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.compliance_period_label}</TableCell>
                          <TableCell>{item.return_type.toUpperCase()}</TableCell>
                          <TableCell>
                            <StatusBadge label={item.status.replace(/_/g, " ")} variant={getStatusVariant(item.status)} />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-600">{item.id}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
          <SectionCard title="Source-month warnings" description="Warnings tied to annual source-month completeness.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "source-months"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="exceptions" className="space-y-6">
          <SectionCard title="Annual exception posture" description="Exception counts and source-risk posture behind this annual rollup.">
            <SummaryGrid
              entries={[
                { label: "Period exception count", value: String(asRecord(annualSections.source_exceptions)?.period_exception_count ?? 0) },
                { label: "Unresolved mismatch count", value: String(asRecord(annualSections.source_exceptions)?.unresolved_mismatch_count ?? 0) },
                { label: "Manual review decisions", value: String(asRecord(annualSections.source_exceptions)?.manual_review_decision_count ?? 0) },
                { label: "Blocked source months", value: blockedPeriods.join(", ") || "None" },
                { label: "Failed source months", value: failedPeriods.join(", ") || "None" },
                { label: "Missing source months", value: missingPeriods.slice(0, 4).join(", ") || "None" },
              ]}
            />
          </SectionCard>
          <SectionCard title="Exception-focused warnings" description="Warnings tied to annual blockers, failed sources, and incomplete month coverage.">
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
            <span className="ml-2">Use prepare and annual actions in Returns</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
