"use client";

import { SectionCard } from "@/components/common/section-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SummaryRecord = Record<string, unknown>;

type ReturnSectionSummaryProps = {
  returnType?: string | null;
  summarySnapshot?: Record<string, unknown> | null;
  variant?: "full" | "compact";
};

function asRecord(value: unknown): SummaryRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as SummaryRecord;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getNumericMetric(section: SummaryRecord | null, keys: string[]) {
  for (const key of keys) {
    const value = section?.[key];
    if (typeof value === "number" || typeof value === "string") {
      return value;
    }
  }
  return 0;
}

function getSectionRows(section: SummaryRecord | null) {
  const rows = asArray(section?.rows);
  return rows.filter((row): row is SummaryRecord => Boolean(asRecord(row)));
}

function getSectionDocuments(section: SummaryRecord | null) {
  const rows = getSectionRows(section);
  return rows.flatMap((row) =>
    asArray(row.documents).filter((document): document is SummaryRecord => Boolean(asRecord(document))),
  );
}

function renderCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

const SECTION_META: Array<{
  key: string;
  label: string;
  countKeys: string[];
}> = [
  { key: "b2b", label: "B2B", countKeys: ["document_count", "row_count"] },
  { key: "b2cl", label: "B2CL", countKeys: ["document_count", "row_count"] },
  { key: "b2cs", label: "B2CS", countKeys: ["document_count", "row_count"] },
  { key: "exports", label: "Exports / SEZ / deemed", countKeys: ["row_count", "document_count"] },
  { key: "advances_received", label: "Advances received", countKeys: ["row_count", "document_count"] },
  { key: "advances_adjusted", label: "Advances adjusted", countKeys: ["row_count", "document_count"] },
  { key: "amendments", label: "Amendments", countKeys: ["row_count", "document_count"] },
  { key: "ecommerce", label: "E-commerce", countKeys: ["row_count", "document_count"] },
  { key: "cdnr", label: "CDNR", countKeys: ["document_count", "row_count"] },
  { key: "cdnur", label: "CDNUR", countKeys: ["document_count", "row_count"] },
];

export function ReturnSectionSummary({ returnType, summarySnapshot, variant = "full" }: ReturnSectionSummaryProps) {
  if (returnType !== "gstr1") {
    return null;
  }

  const summary = asRecord(summarySnapshot);
  const sections = asRecord(summary?.sections);

  if (!sections) {
    return null;
  }

  const sectionCards = SECTION_META.map((item) => {
    const section = asRecord(sections[item.key]);
    return {
      key: item.key,
      label: item.label,
      count: getNumericMetric(section, item.countKeys),
      taxableValue: getNumericMetric(section, ["taxable_value", "total_taxable_value"]),
      taxAmount: getNumericMetric(section, ["tax_amount", "total_tax_amount"]),
    };
  }).filter((item) => Number(item.count || 0) > 0 || Number(item.taxableValue || 0) > 0 || Number(item.taxAmount || 0) > 0);

  if (sectionCards.length === 0) {
    return null;
  }

  const amendmentSection = asRecord(sections.amendments);
  const ecommerceSection = asRecord(sections.ecommerce);
  const amendmentDocuments = getSectionDocuments(amendmentSection).slice(0, variant === "compact" ? 3 : 6);
  const ecommerceRows = getSectionRows(ecommerceSection).slice(0, variant === "compact" ? 3 : 6);

  return (
    <SectionCard
      title="GSTR-1 section review"
      description="Section-wise totals and the most important amendment and e-commerce rows captured in this draft."
    >
      <div className="space-y-5">
        <div className={`grid gap-3 ${variant === "compact" ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4"}`}>
          {sectionCards.map((item) => (
            <div key={item.key} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{item.count}</p>
              <p className="mt-1 text-sm text-slate-600">Rows / documents in this section.</p>
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <p>Taxable value: <span className="font-medium text-slate-900">Rs. {formatMoney(item.taxableValue)}</span></p>
                <p>Tax amount: <span className="font-medium text-slate-900">Rs. {formatMoney(item.taxAmount)}</span></p>
              </div>
            </div>
          ))}
        </div>

        {amendmentDocuments.length > 0 ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Amendment review</p>
              <p className="mt-1 text-sm text-slate-600">Original-document references now included in the prepared GSTR-1 draft.</p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Section</TableHead>
                    <TableHead>Amended doc</TableHead>
                    <TableHead>Original doc</TableHead>
                    <TableHead>Original period</TableHead>
                    <TableHead>Taxable value</TableHead>
                    <TableHead>Tax amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {amendmentDocuments.map((row, index) => (
                    <TableRow key={`${row.document_number ?? "amendment"}-${index}`}>
                      <TableCell>{renderCellValue(row.target_section ? formatLabel(String(row.target_section)) : "")}</TableCell>
                      <TableCell>{renderCellValue(row.document_number)}</TableCell>
                      <TableCell>{renderCellValue(row.original_document_number)}</TableCell>
                      <TableCell>{renderCellValue(row.original_period)}</TableCell>
                      <TableCell>Rs. {formatMoney(row.taxable_value)}</TableCell>
                      <TableCell>Rs. {formatMoney(row.tax_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {ecommerceRows.length > 0 ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">E-commerce review</p>
              <p className="mt-1 text-sm text-slate-600">Operator-linked section totals now visible without exporting the workbook.</p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Operator GSTIN</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>POS</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Taxable value</TableHead>
                    <TableHead>Tax amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ecommerceRows.map((row, index) => (
                    <TableRow key={`${row.ecommerce_gstin ?? "ecommerce"}-${index}`}>
                      <TableCell>{renderCellValue(row.ecommerce_gstin)}</TableCell>
                      <TableCell>{renderCellValue(row.section_code ? formatLabel(String(row.section_code)) : "")}</TableCell>
                      <TableCell>{renderCellValue(row.place_of_supply)}</TableCell>
                      <TableCell>{renderCellValue(row.rate)}</TableCell>
                      <TableCell>{renderCellValue(row.document_count)}</TableCell>
                      <TableCell>Rs. {formatMoney(row.taxable_value)}</TableCell>
                      <TableCell>Rs. {formatMoney(row.tax_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
