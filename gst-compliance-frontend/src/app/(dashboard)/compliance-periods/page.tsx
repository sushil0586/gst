"use client";

import { useMemo, useState } from "react";

import { CompliancePeriodFormDialog } from "@/components/forms/compliance-period-form-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { ActionLabel } from "@/components/common/action-label";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status/status-badge";
import { compliancePeriods as mockPeriods } from "@/data/compliancePeriods";
import { useClientsQuery } from "@/features/clients";
import { useCompliancePeriodsQuery, useLockCompliancePeriodMutation, useUnlockCompliancePeriodMutation } from "@/features/compliance-periods";
import { useGstinsQuery } from "@/features/gstins";
import { hasPermission, permissions } from "@/lib/permissions";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/api/error-handler";

export default function CompliancePeriodsPage() {
  const { permissions: sessionPermissions } = useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { selectedWorkspaceId: workspaceId, selectedClientId, selectedGstinId } = useWorkspaceContext();
  const clientsQuery = useClientsQuery(workspaceId);
  const clients = clientsQuery.data?.items ?? [];
  const gstinsQuery = useGstinsQuery(selectedClientId);
  const gstins = gstinsQuery.data?.items ?? [];
  const periodsQuery = useCompliancePeriodsQuery(selectedGstinId);
  const displayPeriods = periodsQuery.data?.items.length
    ? periodsQuery.data.items
    : periodsQuery.isError
      ? mockPeriods.filter((period) => !selectedClientId || period.clientId === selectedClientId)
      : [];
  const editingPeriod = useMemo(
    () => periodsQuery.data?.items.find((entry) => entry.id === editingId) ?? null,
    [editingId, periodsQuery.data?.items],
  );
  const canPrepare = hasPermission(sessionPermissions, permissions.prepareReturn);
  const canUnlock = hasPermission(sessionPermissions, permissions.manageSettings);
  const lockMutation = useLockCompliancePeriodMutation(selectedGstinId);
  const unlockMutation = useUnlockCompliancePeriodMutation(selectedGstinId);

  const handleLockToggle = async (periodId: string, isLocked: boolean) => {
    try {
      if (isLocked) {
        await unlockMutation.mutateAsync(periodId);
        toast.success("Compliance period unlocked.");
      } else {
        await lockMutation.mutateAsync(periodId);
        toast.success("Compliance period locked.");
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance Periods"
        description="Review monthly cycles, due dates, and filing progression at the period level."
        actions={canPrepare ? [{ label: "Add Period", onClick: () => setDialogOpen(true) }] : []}
      />
      <SectionCard title="Period register" description="Live period records, with preview fallback only when the API is unavailable.">
        {clients.length === 0 && !clientsQuery.isLoading ? (
          <EmptyState title="No clients available" description="Create a client and GSTIN first to begin period management." />
        ) : null}
        {clientsQuery.isLoading || gstinsQuery.isLoading || periodsQuery.isLoading ? (
          <LoadingState message="Loading compliance periods..." />
        ) : null}
        {periodsQuery.isError ? (
          <ErrorState description="We couldn't load period data. Preview fallback records are shown only because the live API request failed." />
        ) : null}
        {displayPeriods.length > 0 ? (
          <DataTableShell
            columns={[
              { key: "period", label: "Period" },
              { key: "returnType", label: "Return Type" },
              { key: "dueDate", label: "Due Date" },
              { key: "status", label: "Status" },
              { key: "actions", label: "" },
            ]}
            rows={displayPeriods.map((period) => ({
              id: period.id,
              period: "period" in period ? period.period : period.label,
              returnType: "return_type" in period ? period.return_type : "GSTR-3B",
              dueDate: "due_date" in period ? period.due_date ?? "Not set" : period.dueDate,
              status: (
                <div className="flex items-center gap-2">
                  <StatusBadge label={period.status} variant={period.status === "closed" ? "success" : "warning"} />
                  {"is_locked" in period && period.is_locked ? <StatusBadge label="Locked" variant="danger" /> : null}
                </div>
              ),
              actions:
                canPrepare && "return_type" in period ? (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditingId(period.id);
                      setDialogOpen(true);
                    }}>
                      <ActionLabel kind="edit" label="Edit" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLockToggle(period.id, "is_locked" in period ? period.is_locked : false)}
                      disabled={"is_locked" in period ? (period.is_locked ? !canUnlock : false) : false}
                    >
                      {"is_locked" in period && period.is_locked ? (
                        <ActionLabel kind="unlock" label="Unlock" />
                      ) : (
                        <ActionLabel kind="lock" label="Lock" />
                      )}
                    </Button>
                  </div>
                ) : null,
            }))}
          />
        ) : null}
      </SectionCard>
      <CompliancePeriodFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingId(null);
          }
        }}
        gstins={gstins}
        initialValues={editingPeriod}
      />
    </div>
  );
}
