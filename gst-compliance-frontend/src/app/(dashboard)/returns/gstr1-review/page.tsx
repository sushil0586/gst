"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileSpreadsheet, ShieldAlert, Sparkles, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ReturnSectionSummary } from "@/components/common/return-section-summary";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGstTransactionsQuery } from "@/features/imports";
import { useReturnQuery, useReturnReadinessQuery, useReturnsQuery } from "@/features/returns";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { GSTTransactionLineItem, GSTTransactionRecord, ReturnPreparationRecord, ReturnReadinessIssue } from "@/types/api";

const REVIEW_TABS = [
  "overview",
  "b2b",
  "b2cl",
  "b2cs",
  "exports",
  "advances",
  "amendments",
  "ecommerce",
  "notes",
  "hsn-docs",
] as const;

type ReviewTab = (typeof REVIEW_TABS)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
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

function getLineItems(metadata: Record<string, unknown>): Array<GSTTransactionLineItem & { rate?: string | number | null }> {
  const rawLineItems = asArray(metadata.line_items);
  return rawLineItems.filter((item): item is GSTTransactionLineItem & { rate?: string | number | null } => Boolean(asRecord(item)));
}

function getRate(transaction: GSTTransactionRecord) {
  const metadata = asRecord(transaction.metadata) ?? {};
  const lineItems = getLineItems(metadata);
  const firstRate = lineItems.find((item) => item.rate != null)?.rate;
  if (firstRate) {
    return String(firstRate);
  }
  const taxable = Number(transaction.taxable_value || 0);
  const tax = Number(transaction.tax_amount || 0);
  if (taxable > 0 && tax > 0) {
    return ((tax / taxable) * 100).toFixed(2);
  }
  return "0.00";
}

function getSpecialSupplyType(transaction: GSTTransactionRecord) {
  const metadata = asRecord(transaction.metadata) ?? {};
  return String(metadata.special_supply_type ?? "").toLowerCase();
}

function getEcommerceGstin(transaction: GSTTransactionRecord) {
  const metadata = asRecord(transaction.metadata) ?? {};
  return String(metadata.ecommerce_gstin ?? "").toUpperCase();
}

function isAmendment(transaction: GSTTransactionRecord) {
  const metadata = asRecord(transaction.metadata) ?? {};
  return Boolean(
    metadata.is_amendment ||
      metadata.original_document_number ||
      metadata.original_document_date ||
      metadata.original_period,
  );
}

function getOriginalDocumentNumber(transaction: GSTTransactionRecord) {
  const metadata = asRecord(transaction.metadata) ?? {};
  return String(metadata.original_document_number ?? "");
}

function getOriginalPeriod(transaction: GSTTransactionRecord) {
  const metadata = asRecord(transaction.metadata) ?? {};
  return String(metadata.original_period ?? "");
}

function isLargeInterstateInvoice(transaction: GSTTransactionRecord) {
  const placeOfSupply = String(transaction.place_of_supply || "");
  const gstin = String(transaction.gstin_value || "");
  const homeStateCode = gstin.slice(0, 2);
  const totalAmount = Number(transaction.total_amount || 0);
  return Boolean(placeOfSupply && homeStateCode && placeOfSupply !== homeStateCode && totalAmount >= 250000);
}

function sectionIssueMatch(issue: ReturnReadinessIssue, tab: string) {
  const code = issue.code.toLowerCase();
  if (tab === "overview") return true;
  if (tab === "advances") return code.includes("advance");
  if (tab === "exports") return code.includes("export") || code.includes("shipping") || code.includes("special_supply");
  if (tab === "amendments") return code.includes("amendment") || code.includes("orphaned");
  if (tab === "ecommerce") return code.includes("ecommerce");
  if (tab === "hsn-docs") return code.includes("hsn") || code.includes("uqc") || code.includes("quantity") || code.includes("document");
  return false;
}

function normalizeReviewTab(value: string | null): ReviewTab {
  return REVIEW_TABS.includes((value ?? "") as ReviewTab) ? ((value ?? "overview") as ReviewTab) : "overview";
}

function formatTabLabel(tab: ReviewTab) {
  if (tab === "hsn-docs") return "HSN & Documents";
  if (tab === "b2b" || tab === "b2cl" || tab === "b2cs") return tab.toUpperCase();
  if (tab === "ecommerce") return "E-commerce";
  return tab.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
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

function DocumentTable({
  title,
  description,
  transactions,
  showOriginal = false,
}: {
  title: string;
  description: string;
  transactions: GSTTransactionRecord[];
  showOriginal?: boolean;
}) {
  return (
    <SectionCard title={title} description={description}>
      {transactions.length === 0 ? (
        <EmptyState title="No rows in this section" description="Nothing from the current prepared return landed in this bucket." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>POS</TableHead>
                <TableHead>Rate</TableHead>
                {showOriginal ? <TableHead>Original doc</TableHead> : null}
                {showOriginal ? <TableHead>Original period</TableHead> : null}
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
                      <p className="text-xs text-slate-500">{transaction.document_date}</p>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{transaction.transaction_type.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-slate-900">{transaction.counterparty_name || "Unregistered buyer"}</p>
                      <p className="text-xs text-slate-500">{transaction.counterparty_gstin || "No GSTIN"}</p>
                    </div>
                  </TableCell>
                  <TableCell>{transaction.place_of_supply || "—"}</TableCell>
                  <TableCell>{getRate(transaction)}</TableCell>
                  {showOriginal ? <TableCell>{getOriginalDocumentNumber(transaction) || "—"}</TableCell> : null}
                  {showOriginal ? <TableCell>{getOriginalPeriod(transaction) || "—"}</TableCell> : null}
                  <TableCell>Rs. {formatMoney(transaction.taxable_value)}</TableCell>
                  <TableCell>Rs. {formatMoney(transaction.tax_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}

function SnapshotRowTable({
  title,
  description,
  rows,
  columns,
}: {
  title: string;
  description: string;
  rows: Array<Record<string, unknown>>;
  columns: Array<{ key: string; label: string; money?: boolean }>;
}) {
  return (
    <SectionCard title={title} description={description}>
      {rows.length === 0 ? (
        <EmptyState title="No rows in this section" description="Nothing from the prepared snapshot landed in this bucket." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={`${title}-${index}`}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      {column.money ? `Rs. ${formatMoney(row[column.key] as string | number | null | undefined)}` : String(row[column.key] ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}

export default function Gstr1ReviewPage() {
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
      return_type: "gstr1",
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
  const salesQuery = useGstTransactionsQuery({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    transaction_type: "sales",
  });
  const creditNoteQuery = useGstTransactionsQuery({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    transaction_type: "credit_note",
  });
  const debitNoteQuery = useGstTransactionsQuery({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    transaction_type: "debit_note",
  });
  const advanceReceivedQuery = useGstTransactionsQuery({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    transaction_type: "advance_received",
  });
  const advanceAdjustedQuery = useGstTransactionsQuery({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    transaction_type: "advance_adjusted",
  });

  const activeReturn = useMemo(() => {
    if (detailQuery.data?.return_type === "gstr1") {
      return detailQuery.data;
    }
    return returnsQuery.data?.items.find((item) => item.return_type === "gstr1") ?? null;
  }, [detailQuery.data, returnsQuery.data?.items]);

  const summary = (activeReturn?.summary_snapshot ?? {}) as Record<string, unknown>;
  const sections = (summary.sections as Record<string, unknown> | undefined) ?? {};
  const readiness = readinessQuery.data?.gstr1 ?? null;
  const allIssues = readiness?.issues ?? [];

  const sales = salesQuery.data?.items ?? [];
  const creditNotes = creditNoteQuery.data?.items ?? [];
  const debitNotes = debitNoteQuery.data?.items ?? [];
  const advanceReceived = advanceReceivedQuery.data?.items ?? [];
  const advanceAdjusted = advanceAdjustedQuery.data?.items ?? [];
  const allNotes = [...creditNotes, ...debitNotes];

  const b2bTransactions = sales.filter((transaction) => !isAmendment(transaction) && !getSpecialSupplyType(transaction) && Boolean(transaction.counterparty_gstin));
  const b2clTransactions = sales.filter((transaction) => !isAmendment(transaction) && !getSpecialSupplyType(transaction) && !transaction.counterparty_gstin && isLargeInterstateInvoice(transaction));
  const b2csTransactions = sales.filter((transaction) => !isAmendment(transaction) && !getSpecialSupplyType(transaction) && !transaction.counterparty_gstin && !isLargeInterstateInvoice(transaction));
  const exportTransactions = sales.filter((transaction) => !isAmendment(transaction) && Boolean(getSpecialSupplyType(transaction)));
  const amendmentTransactions = [...sales.filter(isAmendment), ...allNotes.filter(isAmendment)];
  const ecommerceTransactions = sales.filter((transaction) => Boolean(getEcommerceGstin(transaction)));
  const regularNotes = allNotes.filter((transaction) => !isAmendment(transaction));

  const nilRows = asArray(asRecord(sections.nil_exempt_non_gst)?.rows).filter((row): row is Record<string, unknown> => Boolean(asRecord(row)));
  const hsnRows = asArray(asRecord(sections.hsn_summary)?.rows).filter((row): row is Record<string, unknown> => Boolean(asRecord(row)));
  const documentRows = asArray(asRecord(sections.documents_issued)?.rows).filter((row): row is Record<string, unknown> => Boolean(asRecord(row)));
  const exportRows = asArray(asRecord(sections.exports)?.rows).filter((row): row is Record<string, unknown> => Boolean(asRecord(row)));
  const advanceReceivedRows = asArray(asRecord(sections.advances_received)?.rows).filter((row): row is Record<string, unknown> => Boolean(asRecord(row)));
  const advanceAdjustedRows = asArray(asRecord(sections.advances_adjusted)?.rows).filter((row): row is Record<string, unknown> => Boolean(asRecord(row)));
  const ecommerceRows = asArray(asRecord(sections.ecommerce)?.rows).filter((row): row is Record<string, unknown> => Boolean(asRecord(row)));

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
    salesQuery.isLoading ||
    creditNoteQuery.isLoading ||
    debitNoteQuery.isLoading ||
    advanceReceivedQuery.isLoading ||
    advanceAdjustedQuery.isLoading;

  const isError =
    returnsQuery.isError ||
    detailQuery.isError ||
    salesQuery.isError ||
    creditNoteQuery.isError ||
    debitNoteQuery.isError ||
    advanceReceivedQuery.isError ||
    advanceAdjustedQuery.isError;

  if (!selectedWorkspaceId || !selectedClientId || !selectedGstinId || !selectedPeriodId) {
    return <EmptyState title="Choose a full workspace context" description="Select workspace, client, GSTIN, and period before reviewing a GSTR-1 draft." />;
  }

  if (isLoading) {
    return <LoadingState message="Loading GSTR-1 review workspace..." />;
  }

  if (isError) {
    return <ErrorState title="We couldn’t load the GSTR-1 review workspace" description="Refresh the page or return to the returns workspace and try again." />;
  }

  if (!activeReturn) {
    return <EmptyState title="No GSTR-1 draft found" description="Prepare a GSTR-1 return for the selected context before opening the review workspace." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="GSTR-1 Review"
        description="Review each filing section in-app before exporting, approving, or filing the prepared return."
        actions={[
          { label: "Back to Returns", href: reviewHref },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title={`${selectedClient?.legal_name ?? activeReturn.client_name ?? "Client"} · ${selectedPeriod?.period ?? activeReturn.compliance_period_label ?? ""}`}
          description="This workspace turns the prepared GSTR-1 snapshot into a section-wise review surface so workbook export becomes secondary."
          variant="soft"
          action={<StatusBadge label={activeReturn.status.replace(/_/g, " ")} variant={getStatusVariant(activeReturn.status)} />}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Taxable Value" value={`Rs. ${formatMoney(getPrimaryTaxableValue(activeReturn))}`} detail="Prepared outward taxable base." tone="success" variant="soft" />
            <StatCard label="Tax Amount" value={`Rs. ${formatMoney(getPrimaryTaxAmount(activeReturn))}`} detail="Prepared GSTR-1 tax amount." tone="warning" variant="soft" />
            <StatCard label="Warnings" value={String(readiness?.warning_count ?? 0)} detail="Section and metadata warnings in readiness." tone="warning" variant="soft" />
            <StatCard label="Period Exceptions" value={String(getPeriodExceptionCountFromSummary(summary))} detail="Source rows accepted with period exception handling." tone="danger" variant="soft" />
          </div>
        </SectionCard>

        <SectionCard
          title="Review posture"
          description="Use this as the working surface before export or approval."
          variant="soft"
        >
          <div className="space-y-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-indigo-600" />
                <div>
                  <p className="font-semibold text-slate-900">Modern in-app review first</p>
                  <p className="mt-1 leading-6">Each section below is designed to make workbook download a confirmation step, not the first review step.</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-slate-900">Warnings stay visible in context</p>
                  <p className="mt-1 leading-6">Section tabs surface the readiness issues most relevant to that review area instead of forcing you to cross-check a separate export.</p>
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
          <TabsTrigger value="b2b">B2B</TabsTrigger>
          <TabsTrigger value="b2cl">B2CL</TabsTrigger>
          <TabsTrigger value="b2cs">B2CS</TabsTrigger>
          <TabsTrigger value="exports">Exports</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
          <TabsTrigger value="amendments">Amendments</TabsTrigger>
          <TabsTrigger value="ecommerce">E-commerce</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="hsn-docs">HSN & Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <ReturnSectionSummary returnType="gstr1" summarySnapshot={activeReturn.summary_snapshot} variant="full" />
          <SectionCard title="Current review risks" description="Warnings, blockers, and exception signals for this prepared return.">
            <WarningList issues={allIssues} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="b2b" className="space-y-6">
          <DocumentTable title="B2B documents" description="Registered outward supplies routed into the B2B section." transactions={b2bTransactions} />
        </TabsContent>

        <TabsContent value="b2cl" className="space-y-6">
          <DocumentTable title="B2CL documents" description="Large interstate unregistered invoices split out from general B2CS." transactions={b2clTransactions} />
        </TabsContent>

        <TabsContent value="b2cs" className="space-y-6">
          <DocumentTable title="B2CS documents" description="Unregistered outward supplies that do not qualify as B2CL." transactions={b2csTransactions} />
        </TabsContent>

        <TabsContent value="exports" className="space-y-6">
          <SnapshotRowTable
            title="Export section totals"
            description="Prepared export, SEZ, and deemed-export rows from the section-first snapshot."
            rows={exportRows}
            columns={[
              { key: "special_supply_type", label: "Supply type" },
              { key: "rate", label: "Rate" },
              { key: "document_count", label: "Docs" },
              { key: "taxable_value", label: "Taxable value", money: true },
              { key: "tax_amount", label: "Tax amount", money: true },
            ]}
          />
          <DocumentTable title="Export-linked source documents" description="Sales documents classified as export / SEZ / deemed export in the current period." transactions={exportTransactions} />
          <SectionCard title="Export-specific warnings" description="Warnings most relevant to export and special-supply handling.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "exports"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="advances" className="space-y-6">
          <SnapshotRowTable
            title="Advances received"
            description="Prepared advance-received rows before final invoicing."
            rows={advanceReceivedRows}
            columns={[
              { key: "place_of_supply", label: "POS" },
              { key: "supply_type", label: "Supply type" },
              { key: "rate", label: "Rate" },
              { key: "document_count", label: "Rows" },
              { key: "taxable_value", label: "Taxable value", money: true },
              { key: "tax_amount", label: "Tax amount", money: true },
            ]}
          />
          <SnapshotRowTable
            title="Advances adjusted"
            description="Prepared advance adjustments against later taxable supplies."
            rows={advanceAdjustedRows}
            columns={[
              { key: "place_of_supply", label: "POS" },
              { key: "supply_type", label: "Supply type" },
              { key: "rate", label: "Rate" },
              { key: "document_count", label: "Rows" },
              { key: "taxable_value", label: "Taxable value", money: true },
              { key: "tax_amount", label: "Tax amount", money: true },
            ]}
          />
          <DocumentTable title="Advance source rows" description="Imported advance-received and advance-adjusted documents for this period." transactions={[...advanceReceived, ...advanceAdjusted]} />
          <SectionCard title="Advance-specific warnings" description="Warnings relevant to POS, rate, and linkage quality for advance reporting.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "advances"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="amendments" className="space-y-6">
          <DocumentTable title="Amendment documents" description="Amendment transactions with original-document linkage carried into the prepared return." transactions={amendmentTransactions} showOriginal />
          <SectionCard title="Amendment-specific warnings" description="Warnings relevant to original-document references and amendment linkage.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "amendments"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="ecommerce" className="space-y-6">
          <SnapshotRowTable
            title="E-commerce section totals"
            description="Operator-linked summary rows derived from the prepared GSTR-1 snapshot."
            rows={ecommerceRows}
            columns={[
              { key: "ecommerce_gstin", label: "Operator GSTIN" },
              { key: "section_code", label: "Section" },
              { key: "place_of_supply", label: "POS" },
              { key: "rate", label: "Rate" },
              { key: "document_count", label: "Rows" },
              { key: "taxable_value", label: "Taxable value", money: true },
              { key: "tax_amount", label: "Tax amount", money: true },
            ]}
          />
          <DocumentTable title="E-commerce-linked source documents" description="Sales rows carrying operator GSTIN or operator section metadata." transactions={ecommerceTransactions} showOriginal />
          <SectionCard title="E-commerce-specific warnings" description="Warnings relevant to operator GSTIN and section routing.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "ecommerce"))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="notes" className="space-y-6">
          <DocumentTable title="Registered and unregistered notes" description="Credit and debit notes included in this GSTR-1 context." transactions={regularNotes} />
          <DocumentTable title="Amendment note rows" description="Note amendments carrying original-document references." transactions={allNotes.filter(isAmendment)} showOriginal />
        </TabsContent>

        <TabsContent value="hsn-docs" className="space-y-6">
          <SnapshotRowTable
            title="HSN summary"
            description="Prepared HSN rows used by the current workbook and review logic."
            rows={hsnRows}
            columns={[
              { key: "hsn_code", label: "HSN / SAC" },
              { key: "description", label: "Description" },
              { key: "uqc", label: "UQC" },
              { key: "quantity", label: "Quantity" },
              { key: "taxable_value", label: "Taxable value", money: true },
              { key: "tax_amount", label: "Tax amount", money: true },
            ]}
          />
          <SnapshotRowTable
            title="Documents issued"
            description="Document-series summary from the prepared snapshot."
            rows={documentRows}
            columns={[
              { key: "document_type", label: "Document type" },
              { key: "from_number", label: "From" },
              { key: "to_number", label: "To" },
              { key: "count", label: "Count" },
            ]}
          />
          <SnapshotRowTable
            title="Nil / exempt / non-GST"
            description="Prepared nil-rated, exempt, and non-GST summary rows."
            rows={nilRows}
            columns={[
              { key: "supply_category", label: "Category" },
              { key: "document_count", label: "Rows" },
              { key: "taxable_value", label: "Taxable value", money: true },
            ]}
          />
          <SectionCard title="Metadata warnings" description="Warnings most relevant to HSN, UQC, quantity, and document completeness.">
            <WarningList issues={allIssues.filter((issue) => sectionIssueMatch(issue, "hsn-docs"))} />
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
