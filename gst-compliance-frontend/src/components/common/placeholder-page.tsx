import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { DataTableShell } from "@/components/tables/data-table-shell";

export function PlaceholderPage({
  title,
  description,
  statusTitle = "Pilot shell",
  statusDescription = "This page is visible in navigation, but it is still a demonstration workflow and not fully wired to live backend operations.",
  tableTitle,
  tableDescription,
  columns,
  rows,
  emptyTitle,
  emptyDescription,
  showHeader = true,
}: {
  title: string;
  description: string;
  statusTitle?: string;
  statusDescription?: string;
  tableTitle: string;
  tableDescription: string;
  columns: { key: string; label: string; className?: string }[];
  rows: Record<string, string | number | React.ReactNode>[];
  emptyTitle: string;
  emptyDescription: string;
  showHeader?: boolean;
}) {
  return (
    <div className="space-y-6">
      {showHeader ? <PageHeader title={title} description={description} /> : null}
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
        <p className="text-sm font-semibold text-amber-900">{statusTitle}</p>
        <p className="mt-1 text-sm leading-6 text-amber-800">{statusDescription}</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard title={tableTitle} description={tableDescription}>
          <DataTableShell columns={columns} rows={rows} />
        </SectionCard>
        <SectionCard title="Current State" description="This foundation page is ready for backend wiring.">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </SectionCard>
      </div>
    </div>
  );
}
