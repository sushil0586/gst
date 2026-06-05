"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ActionLabel } from "@/components/common/action-label";
import { AppModalBody, AppModalContent, AppModalHeader } from "@/components/common/app-modal";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuditLogQuery, useAuditLogsQuery } from "@/features/audit";
import { downloadFile } from "@/lib/api/download";
import { getErrorMessage } from "@/lib/api/error-handler";
import { useWorkspaceContext } from "@/store/workspace-context";

function formatDateTime(value?: string | null) {
  if (!value) return "Pending";
  return format(new Date(value), "dd MMM yyyy, h:mm a");
}

export default function AuditTrailPage() {
  const searchParams = useSearchParams();
  const {
    workspaces,
    clients,
    gstins,
    periods,
    selectedWorkspaceId,
    selectedClientId,
    selectedGstinId,
    selectedPeriodId,
    setSelectedWorkspaceId,
    setSelectedClientId,
    setSelectedGstinId,
    setSelectedPeriodId,
  } = useWorkspaceContext();
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const queryWorkspaceId = searchParams.get("workspace");
  const queryClientId = searchParams.get("client");
  const queryGstinId = searchParams.get("gstin");
  const queryPeriodId = searchParams.get("period") ?? searchParams.get("compliance_period");

  const filters = useMemo(
    () => ({
      workspace_id_ref: selectedWorkspaceId ?? undefined,
      client_id_ref: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      period: selectedPeriodId ?? undefined,
      action: action || undefined,
      entity_type: entityType || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId, action, entityType, dateFrom, dateTo],
  );

  const auditLogsQuery = useAuditLogsQuery(filters);
  const auditLogs = auditLogsQuery.data?.items ?? [];
  const selectedLogQuery = useAuditLogQuery(selectedLogId ?? undefined);
  const selectedLog = selectedLogQuery.data ?? null;

  useEffect(() => {
    if (queryWorkspaceId && queryWorkspaceId !== selectedWorkspaceId && workspaces.some((workspace) => workspace.id === queryWorkspaceId)) {
      setSelectedWorkspaceId(queryWorkspaceId);
      return;
    }
    if (queryClientId && queryClientId !== selectedClientId && clients.some((client) => client.id === queryClientId)) {
      setSelectedClientId(queryClientId);
      return;
    }
    if (queryGstinId && queryGstinId !== selectedGstinId && gstins.some((gstin) => gstin.id === queryGstinId)) {
      setSelectedGstinId(queryGstinId);
      return;
    }
    if (queryPeriodId && queryPeriodId !== selectedPeriodId && periods.some((period) => period.id === queryPeriodId)) {
      setSelectedPeriodId(queryPeriodId);
    }
  }, [
    clients,
    gstins,
    periods,
    queryClientId,
    queryGstinId,
    queryPeriodId,
    queryWorkspaceId,
    selectedClientId,
    selectedGstinId,
    selectedPeriodId,
    selectedWorkspaceId,
    setSelectedClientId,
    setSelectedGstinId,
    setSelectedPeriodId,
    setSelectedWorkspaceId,
    workspaces,
  ]);

  const handleExport = async () => {
    if (!selectedWorkspaceId) {
      toast.error("Select a workspace before exporting audit logs.");
      return;
    }
    try {
      await downloadFile(
        "/exports/audit-logs/",
        {
          workspace: selectedWorkspaceId,
          client: selectedClientId ?? undefined,
          gstin: selectedGstinId ?? undefined,
          compliance_period: selectedPeriodId ?? undefined,
          action: action || undefined,
          entity_type: entityType || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
        "audit-logs.xlsx",
      );
      toast.success("Audit log export downloaded.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Review operator and system activity with filterable, audit-ready history across imports, reconciliation, approvals, and period controls."
        actions={[{ label: "Export XLSX", onClick: handleExport, disabled: !selectedWorkspaceId }]}
      />

      <SectionCard title="Audit filters" description="Narrow the timeline by action, work item type, and date range.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Action contains..." />
          <Input value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder="Work item type..." />
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
      </SectionCard>

      <SectionCard title="Audit log stream" description="Events captured from key monthly workflow actions and control transitions.">
        {!selectedWorkspaceId ? (
          <EmptyState title="Select a workspace first" description="Choose a workspace from the topbar to load audit history." />
        ) : auditLogsQuery.isLoading ? (
          <LoadingState message="Loading audit logs..." />
        ) : auditLogsQuery.isError ? (
          <ErrorState description={getErrorMessage(auditLogsQuery.error)} />
        ) : auditLogs.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Inspect</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((auditLog) => (
                  <TableRow key={auditLog.id}>
                    <TableCell>{auditLog.actor_name ?? "System"}</TableCell>
                    <TableCell>{auditLog.action}</TableCell>
                    <TableCell>{auditLog.entity_type} • {auditLog.entity_id.slice(0, 8)}</TableCell>
                    <TableCell>{formatDateTime(auditLog.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedLogId(auditLog.id)}>
                        <ActionLabel kind="view" label="View" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState title="No audit logs match these filters" description="Try broadening the date range or clearing action/work item filters." />
        )}
      </SectionCard>

      <Dialog open={Boolean(selectedLogId)} onOpenChange={(open) => !open && setSelectedLogId(null)}>
        <AppModalContent size="xl">
          <AppModalHeader
            title="Audit event detail"
            description="Inspect metadata and before/after state captured for this event."
          />
          <AppModalBody className="space-y-6">
            {selectedLogQuery.isLoading ? (
              <LoadingState message="Loading audit event detail..." />
            ) : selectedLogQuery.isError ? (
              <ErrorState description={getErrorMessage(selectedLogQuery.error)} />
            ) : selectedLog ? (
              <>
                <SectionCard title="Event summary" description={selectedLog.action}>
                  <div className="grid gap-4 md:grid-cols-2 text-sm">
                    <div className="space-y-3">
                      <div><span className="text-slate-500">Actor:</span> <span className="font-medium text-slate-900">{selectedLog.actor_name ?? "System"}</span></div>
                      <div><span className="text-slate-500">Work item:</span> <span className="font-medium text-slate-900">{selectedLog.entity_type}</span></div>
                    </div>
                    <div className="space-y-3">
                      <div><span className="text-slate-500">Work item ID:</span> <span className="font-medium text-slate-900">{selectedLog.entity_id}</span></div>
                      <div><span className="text-slate-500">Created:</span> <span className="font-medium text-slate-900">{formatDateTime(selectedLog.created_at)}</span></div>
                    </div>
                  </div>
                </SectionCard>
                <SectionCard title="Metadata" description="Additional event context stored with the log.">
                  <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(selectedLog.metadata ?? {}, null, 2)}</pre>
                </SectionCard>
                <SectionCard title="Before state" description="Values captured before the workflow action occurred.">
                  <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(selectedLog.before_state ?? {}, null, 2)}</pre>
                </SectionCard>
                <SectionCard title="After state" description="Values captured after the workflow action completed.">
                  <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(selectedLog.after_state ?? {}, null, 2)}</pre>
                </SectionCard>
              </>
            ) : null}
          </AppModalBody>
        </AppModalContent>
      </Dialog>
    </div>
  );
}
