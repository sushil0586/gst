"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { Building2, CalendarClock, FileCheck2, ShieldAlert } from "lucide-react";

import { ClientFormDialog } from "@/components/forms/client-form-dialog";
import { CompliancePeriodFormDialog } from "@/components/forms/compliance-period-form-dialog";
import { GstinFormDialog } from "@/components/forms/gstin-form-dialog";
import { ActionLabel } from "@/components/common/action-label";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { Button } from "@/components/ui/button";
import { clients as mockClients } from "@/data/clients";
import { compliancePeriods as mockPeriods } from "@/data/compliancePeriods";
import { gstins as mockGstins } from "@/data/gstins";
import { useClientQuery } from "@/features/clients";
import { useCompliancePeriodsQuery } from "@/features/compliance-periods";
import { useGstinsQuery } from "@/features/gstins";
import { useWorkspacesQuery } from "@/features/workspace";
import { hasPermission, permissions } from "@/lib/permissions";
import { useSession } from "@/lib/query/session-provider";

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [gstinDialogOpen, setGstinDialogOpen] = useState(false);
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const { clientId } = use(params);
  const { user, permissions: sessionPermissions } = useSession();
  const workspacesQuery = useWorkspacesQuery();
  const clientQuery = useClientQuery(clientId);
  const client = clientQuery.data;
  const clientFallback = mockClients.find((entry) => entry.id === clientId);
  const gstinsQuery = useGstinsQuery(clientId);
  const liveGstins = gstinsQuery.data?.items ?? [];
  const fallbackGstins = mockGstins.filter((entry) => entry.clientId === clientId).map((gstin) => ({
    id: gstin.id,
    gstin: gstin.gstin,
    state: gstin.state,
    registrationType: gstin.registrationType,
    status: gstin.status,
  }));
  const displayGstins = gstinsQuery.isError
    ? fallbackGstins
    : liveGstins.map((gstin) => ({
        id: gstin.id,
        gstin: gstin.gstin,
        state: gstin.state_code,
        registrationType: gstin.registration_type,
        status: gstin.is_active ? "Active" : "Inactive",
      }));
  const primaryGstinId = liveGstins[0]?.id;
  const periodsQuery = useCompliancePeriodsQuery(primaryGstinId);
  const fallbackPeriods = mockPeriods.filter((entry) => entry.clientId === clientId).map((period) => ({
    id: period.id,
    label: period.label,
    filingFrequency: period.filingFrequency,
    dueDate: period.dueDate,
    status: period.status,
  }));
  const displayPeriods = periodsQuery.isError
    ? fallbackPeriods
    : (periodsQuery.data?.items ?? []).map((period) => ({
        id: period.id,
        label: period.period,
        filingFrequency: period.return_type,
        dueDate: period.due_date ?? "Not set",
        status: period.status,
      }));
  const overviewCards = useMemo(() => {
    const dueSoonCount = displayPeriods.filter((period) => {
      if (!period.dueDate || period.dueDate === "Not set") {
        return false;
      }
      const dueDate = new Date(period.dueDate);
      if (Number.isNaN(dueDate.getTime())) {
        return false;
      }
      const now = new Date();
      const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= -1 && diffDays <= 7;
    }).length;
    const filedCount = displayPeriods.filter((period) => period.status.toLowerCase().includes("filed")).length;
    const activeGstinCount = displayGstins.filter((gstin) => gstin.status.toLowerCase() === "active").length;
    const exceptionCount = displayPeriods.filter((period) => {
      const normalized = period.status.toLowerCase();
      return normalized.includes("review") || normalized.includes("hold") || normalized.includes("error");
    }).length;
    return [
      {
        title: "Registered GSTINs",
        value: `${displayGstins.length}`,
        detail: activeGstinCount === displayGstins.length
          ? "All visible registrations are active."
          : `${activeGstinCount} active registration${activeGstinCount === 1 ? "" : "s"} in this client.`,
        icon: Building2,
      },
      {
        title: "Periods in scope",
        value: `${displayPeriods.length}`,
        detail: dueSoonCount > 0
          ? `${dueSoonCount} due soon across the visible filing calendar.`
          : "No immediate filing deadlines in the next 7 days.",
        icon: CalendarClock,
      },
      {
        title: "Filed periods",
        value: `${filedCount}`,
        detail: filedCount > 0
          ? `${filedCount} period${filedCount === 1 ? "" : "s"} already completed.`
          : "No periods have been marked filed yet.",
        icon: FileCheck2,
      },
      {
        title: "Needs attention",
        value: `${exceptionCount}`,
        detail: exceptionCount > 0
          ? "Review periods that are not yet fully on track."
          : "No visible period exceptions for this client.",
        icon: ShieldAlert,
      },
    ];
  }, [displayGstins, displayPeriods]);
  const canManageClient = hasPermission(sessionPermissions, permissions.manageClient);
  const canManageGstin = hasPermission(sessionPermissions, permissions.manageGstin);
  const canPrepareReturn = hasPermission(sessionPermissions, permissions.prepareReturn);

  return (
    <div className="space-y-6">
      <PageHeader
        title={client?.legal_name ?? clientFallback?.name ?? "Client workspace"}
        description={`Client code ${client?.client_code ?? clientFallback?.code ?? "N/A"} • Filing owner ${user?.full_name ?? clientFallback?.owner ?? "Assigned user"}`}
        actions={[
          ...(canManageClient ? [{ label: "Edit Client", onClick: () => setClientDialogOpen(true) }] : []),
          ...(canManageGstin ? [{ label: "Add GSTIN", onClick: () => setGstinDialogOpen(true) }] : []),
          ...(canPrepareReturn ? [{ label: "Add Period", onClick: () => setPeriodDialogOpen(true) }] : []),
        ]}
      />
      {clientQuery.isLoading && !clientFallback ? <LoadingState message="Loading client workspace..." /> : null}
      {clientQuery.isError && !clientFallback ? (
        <ErrorState description="We couldn't load this client from the API, and no fallback record was available." />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <SectionCard key={card.title} title={card.title}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold tracking-tight text-slate-950">{card.value}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{card.detail}</p>
              </div>
              <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
                <card.icon className="size-5" />
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Registered GSTINs" description="State registrations and active compliance scope.">
          {gstinsQuery.isLoading ? <LoadingState message="Loading GSTINs..." /> : null}
          {gstinsQuery.isError ? <ErrorState description="Live GSTIN data could not be loaded, so fallback data is shown." /> : null}
          {displayGstins.length === 0 ? <EmptyState title="No GSTINs found" description="Add a GSTIN to begin period-level compliance operations." /> : (
          <DataTableShell
            columns={[
              { key: "gstin", label: "GSTIN" },
              { key: "state", label: "State" },
              { key: "registrationType", label: "Registration Type" },
              { key: "status", label: "Status" },
            ]}
            rows={displayGstins}
          />)}
          <div className="mt-4">
            <Button asChild size="sm" variant="outline">
              <Link href={`/clients/${clientId}/gstins`}>
                <ActionLabel kind="view" label="View GSTIN workspace" />
              </Link>
            </Button>
          </div>
        </SectionCard>
        <SectionCard title="Compliance periods" description="Current filing periods available for this client.">
          {periodsQuery.isLoading ? <LoadingState message="Loading compliance periods..." /> : null}
          {periodsQuery.isError ? <ErrorState description="Live period data is unavailable, so fallback period cards are shown." /> : null}
          {displayPeriods.length === 0 ? <EmptyState title="No periods found" description="Create a compliance period after adding a GSTIN." /> : (
          <DataTableShell
            columns={[
              { key: "label", label: "Period" },
              { key: "filingFrequency", label: "Frequency" },
              { key: "dueDate", label: "Due Date" },
              { key: "status", label: "Status" },
              { key: "actions", label: "" },
            ]}
            rows={displayPeriods.map((period) => ({
              id: period.id,
              label: period.label,
              filingFrequency: period.filingFrequency,
              dueDate: period.dueDate,
              status: period.status,
              actions: (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/clients/${clientId}/periods/${period.id}`}>
                    <ActionLabel kind="open" label="Open period" />
                  </Link>
                </Button>
              ),
            }))}
          />)}
        </SectionCard>
      </div>
      <ClientFormDialog
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        workspaces={workspacesQuery.data?.items ?? []}
        initialValues={client ?? null}
      />
      <GstinFormDialog
        open={gstinDialogOpen}
        onOpenChange={setGstinDialogOpen}
        clients={client ? [client] : []}
      />
        <CompliancePeriodFormDialog
          open={periodDialogOpen}
          onOpenChange={setPeriodDialogOpen}
          gstins={liveGstins}
        />
    </div>
  );
}
