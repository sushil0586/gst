import type { ReactNode } from "react";

import { ComplianceStatusBadge } from "@/components/status/compliance-status-badge";
import { TableCard } from "@/components/tables/table-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Column = {
  key: string;
  label: string;
  className?: string;
};

type RowValue = string | number | ReactNode;

export function DataTableShell({
  columns,
  rows,
  emptyState,
}: {
  columns: Column[];
  rows: Record<string, RowValue>[];
  emptyState?: ReactNode;
}) {
  return (
    <TableCard className="rounded-[28px] border border-slate-200/80 bg-white/98 shadow-[0_24px_54px_-34px_rgba(15,23,42,0.18)]">
      <Table>
        <TableHeader className="bg-[linear-gradient(180deg,rgba(246,248,252,0.98),rgba(255,255,255,0.94))]">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.key} className={column.className}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <TableRow key={String(row.id ?? rowIndex)}>
                {columns.map((column) => {
                  const value = row[column.key];
                  const isStatus = column.key.toLowerCase() === "status" && typeof value === "string";

                  return (
                    <TableCell key={column.key} className={column.className}>
                      {isStatus ? <ComplianceStatusBadge status={value} /> : value}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          ) : emptyState ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="px-6 py-10">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </TableCard>
  );
}
