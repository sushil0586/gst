"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { FileSpreadsheet, ShieldAlert, TriangleAlert, UsersRound } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/status/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useImportBatchesQuery, useGstTransactionsQuery } from "@/features/imports";
import { useReturnQuery, useReturnReadinessQuery, useReturnsQuery } from "@/features/returns";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { ReturnPreparationRecord, ReturnReadinessIssue } from "@/types/api";

const REVIEW_TABS = ["overview", "deductees", "tax-summary", "warnings", "source-imports"] as const;
type ReviewTab = (typeof REVIEW_TABS)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray<T = Record<string, unknown>>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeReviewTab(value: string | null): ReviewTab {
  return REVIEW_TABS.includes((value ?? "") as ReviewTab) ? ((value ?? "overview") as ReviewTab) : "overview";
}

function formatTabLabel(tab: ReviewTab) {
  if (tab === "tax-summary") return "Tax Summary";
  if (tab === "source-imports") return "Source Imports";
  return tab.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
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

function sectionIssueMatch(issue: ReturnReadinessIssue, tab: ReviewTab) {
  const combined = `${issue.code} ${issue.title} ${issue.detail}`.toLowerCase();
  if (tab === "overview") return true;
  if (tab === "deductees") return combined.includes("deductee") || combined.includes("gstin");
  if (tab === "tax-summary") return combined.includes("tds") || combined.includes("payment") || combined.includes("tax");
  if (tab === "warnings") return true;
  if (tab === "source-imports") return combined.includes("import") || combined.includes("source");
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

export default function Gstr7ReviewPage() {
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
      return_type: "gstr7",
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
  const transactionsQuery = useGstTransactionsQuery(
    {
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      period: selectedPeriodId ?? undefined,
      transaction_type: "tds_deducted",
    },
    { enabled: Boolean(selectedClientId && selectedGstinId && selectedPeriodId) },
  );
  const importBatchesQuery = useImportBatchesQuery({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    compliance_period: selectedPeriodId ?? undefined,
  });

  const activeReturn = useMemo(() => {
    if (detailQuery.data?.return_type === "gstr7") return detailQuery.data;
    return returnsQuery.data?.items.find((item) => item.return_type === "gstr7") ?? null;
  }, [detailQuery.data, returnsQuery.data?.items]);

  const readiness = readinessQuery.data?.gstr7 ?? null;
  const allIssues = readiness?.issues ?? [];
  const summary = asRecord(activeReturn?.summary_snapshot) ?? {};
  const tdsSummary = asRecord(summary.tds_summary) ?? {};
  const deducteeRows = asArray<Record<string, unknown>>(asRecord(summary.deductees)?.rows);
  const sourceImports = (importBatchesQuery.data?.items ?? []).filter((item) => item.import_type === "tds_deducted");
  const transactions = transactionsQuery.data?.items ?? [];

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
    transactionsQuery.isLoading ||
    importBatchesQuery.isLoading;
  const isError = returnsQuery.isError || detailQuery.isError || transactionsQuery.isError || importBatchesQuery.isError;

  if (!selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
    return <EmptyState title="Choose a full workspace context" description="Select workspace, client, GSTIN, and period before reviewing a GSTR-7 draft." />;
  }

  if (isLoading) {
    return <LoadingState message="Loading GSTR-7 review workspace..." />;
  }

  if (isError) {
    return <ErrorState title="We couldn’t load the GSTR-7 review workspace" description="Refresh the page or return to the returns workspace and try again." />;
  }

  if (!activeReturn) {
    return <EmptyState title="No GSTR-7 draft found" description="Prepare a GSTR-7 return for the selected context before opening the review workspace." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="GSTR-7 Review"
        description="Review deductee-wise GST-TDS data in-app before you move into approval, export, or later filing workflows."
        actions={[{ label: "Back to Returns", href: reviewHref }]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title={`${selectedClient?.legal_name ?? activeReturn.client_name ?? "Client"} · ${activeReturn.compliance_period_label ?? "Current period"}`}
          description="This review workspace turns imported TDS-deducted rows into a clean deductee-wise monthly view, so GST-TDS return checks happen inside the product instead of only in spreadsheets."
          variant="soft"
          action={<StatusBadge label={activeReturn.status.replace(/_/g, " ")} variant={getStatusVariant(activeReturn.status)} />}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Deductees" value={String(tdsSummary.deductee_count ?? 0)} detail="Unique GSTINs receiving deductions in this period." tone="primary" variant="soft" />
            <StatCard label="Documents" value={String(tdsSummary.document_count ?? 0)} detail="TDS deduction entries included in this draft." tone="warning" variant="soft" />
            <StatCard label="Payment amount" value={`Rs. ${formatMoney(String(tdsSummary.payment_amount ?? "0.00"))}`} detail="Total payment base carried into this GSTR-7 summary." tone="primary" variant="soft" />
            <StatCard label="TDS deducted" value={`Rs. ${formatMoney(String(tdsSummary.tds_amount ?? "0.00"))}`} detail="Total GST-TDS captured across all deductee rows." tone="success" variant="soft" />
          </div>
        </SectionCard>

        <SectionCard title="GSTR-7 review posture" description="Use this as the working surface for deductee completeness and TDS validation before export or operational filing." variant="soft">
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <div className="metric-icon-wrap bg-indigo-50 text-indigo-600 ring-indigo-100">
                <UsersRound className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Review deductee completeness first</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Missing deductee GSTIN or duplicate deduction references should be cleaned before the monthly TDS return is trusted.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <div className="metric-icon-wrap bg-emerald-50 text-emerald-600 ring-emerald-100">
                <FileSpreadsheet className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Keep the workflow familiar</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Prepare, review, and approve GSTR-7 here using the same product flow as the other returns, but with TDS-specific content.</p>
              </div>
            </div>
            {allIssues.length > 0 ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <p className="text-sm leading-6 text-amber-700">
                  This draft currently has {readiness?.error_count ?? 0} blocker(s) and {readiness?.warning_count ?? 0} warning(s). Review the scoped warnings before moving forward.
                </p>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <Tabs defaultValue={requestedTab} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-3xl border border-slate-200 bg-white p-2">
          {REVIEW_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="rounded-full px-4 py-2 text-sm">
              {formatTabLabel(tab)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <SectionCard title="Monthly TDS summary" description="Use this summary to quickly validate whether the monthly TDS return base looks operationally complete.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                { label: "Taxable / deduction base", value: `Rs. ${formatMoney(String(tdsSummary.taxable_value ?? "0.00"))}` },
                { label: "Payment amount", value: `Rs. ${formatMoney(String(tdsSummary.payment_amount ?? "0.00"))}` },
                { label: "IGST deducted", value: `Rs. ${formatMoney(String(tdsSummary.igst_amount ?? "0.00"))}` },
                { label: "CGST deducted", value: `Rs. ${formatMoney(String(tdsSummary.cgst_amount ?? "0.00"))}` },
                { label: "SGST deducted", value: `Rs. ${formatMoney(String(tdsSummary.sgst_amount ?? "0.00"))}` },
                { label: "Total TDS deducted", value: `Rs. ${formatMoney(String(tdsSummary.tds_amount ?? "0.00"))}` },
              ].map((entry) => (
                <div key={entry.label} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">{entry.label}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{entry.value}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="deductees" className="space-y-6">
          <SectionCard title="Deductee-wise rows" description="Review GSTIN-wise payment and TDS totals before you trust the monthly return output.">
            {deducteeRows.length === 0 ? (
              <EmptyState title="No deductee rows found" description="Prepare GSTR-7 from imported TDS rows to populate deductee-wise review." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Deductee</TableHead>
                      <TableHead>Documents</TableHead>
                      <TableHead>Payment amount</TableHead>
                      <TableHead>Taxable value</TableHead>
                      <TableHead>IGST</TableHead>
                      <TableHead>CGST</TableHead>
                      <TableHead>SGST</TableHead>
                      <TableHead>Total TDS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deducteeRows.map((row) => (
                      <TableRow key={`${String(row.deductee_gstin)}-${String(row.deductee_name)}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">{String(row.deductee_name || "Unknown deductee")}</p>
                            <p className="text-xs text-slate-500">{String(row.deductee_gstin || "No GSTIN")}</p>
                          </div>
                        </TableCell>
                        <TableCell>{String(row.document_count ?? 0)}</TableCell>
                        <TableCell>Rs. {formatMoney(String(row.payment_amount ?? "0.00"))}</TableCell>
                        <TableCell>Rs. {formatMoney(String(row.taxable_value ?? "0.00"))}</TableCell>
                        <TableCell>Rs. {formatMoney(String(row.igst_amount ?? "0.00"))}</TableCell>
                        <TableCell>Rs. {formatMoney(String(row.cgst_amount ?? "0.00"))}</TableCell>
                        <TableCell>Rs. {formatMoney(String(row.sgst_amount ?? "0.00"))}</TableCell>
                        <TableCell>Rs. {formatMoney(String(row.tds_amount ?? "0.00"))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="tax-summary" className="space-y-6">
          <SectionCard title="Source TDS rows" description="These are the underlying imported TDS-deducted transactions currently feeding this GSTR-7 draft.">
            {transactions.length === 0 ? (
              <EmptyState title="No TDS transactions found" description="Upload TDS-deducted rows first to review the underlying source transactions." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Document</TableHead>
                      <TableHead>Deductee</TableHead>
                      <TableHead>Payment amount</TableHead>
                      <TableHead>Taxable value</TableHead>
                      <TableHead>Tax amount</TableHead>
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
                            <p className="text-slate-900">{transaction.counterparty_name || "Unknown deductee"}</p>
                            <p className="text-xs text-slate-500">{transaction.counterparty_gstin || "No GSTIN"}</p>
                          </div>
                        </TableCell>
                        <TableCell>Rs. {formatMoney(transaction.total_amount)}</TableCell>
                        <TableCell>Rs. {formatMoney(transaction.taxable_value)}</TableCell>
                        <TableCell>Rs. {formatMoney(transaction.tax_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="warnings" className="space-y-6">
          <SectionCard title="GSTR-7 warnings and blockers" description="These are the readiness signals currently limiting confidence in the monthly TDS return.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "warnings"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="source-imports" className="space-y-6">
          <SectionCard title="Source imports" description="These batches supplied the TDS deducted rows used in this GSTR-7 draft.">
            {sourceImports.length === 0 ? (
              <EmptyState title="No TDS imports found" description="Upload a TDS deducted file in Imports to establish the monthly GSTR-7 source set." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Valid</TableHead>
                      <TableHead>Invalid</TableHead>
                      <TableHead>Processed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sourceImports.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell>{batch.file_name}</TableCell>
                        <TableCell>{batch.status.replace(/_/g, " ")}</TableCell>
                        <TableCell>{batch.total_rows}</TableCell>
                        <TableCell>{batch.valid_rows}</TableCell>
                        <TableCell>{batch.invalid_rows}</TableCell>
                        <TableCell>{batch.processed_at ? new Date(batch.processed_at).toLocaleString("en-IN") : "Pending"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
