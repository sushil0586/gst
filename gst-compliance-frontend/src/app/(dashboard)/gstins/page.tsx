"use client";

import { useMemo, useState } from "react";

import { GstinFormDialog } from "@/components/forms/gstin-form-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { ActionLabel } from "@/components/common/action-label";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { Button } from "@/components/ui/button";
import { useClientsQuery } from "@/features/clients";
import { useGstinsQuery } from "@/features/gstins";
import { formatRegistrationTypeLabel } from "@/lib/constants/gst-registration-types";
import { hasPermission, permissions } from "@/lib/permissions";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";

export default function GstinsPage() {
  const { permissions: sessionPermissions } = useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { selectedWorkspaceId: workspaceId, selectedClientId: contextClientId } = useWorkspaceContext();
  const clientsQuery = useClientsQuery(workspaceId);
  const clients = clientsQuery.data?.items ?? [];
  const selectedClientId = contextClientId ?? clients[0]?.id;
  const gstinsQuery = useGstinsQuery(selectedClientId);
  const displayGstins = gstinsQuery.data?.items ?? [];
  const editingGstin = useMemo(
    () => gstinsQuery.data?.items.find((entry) => entry.id === editingId) ?? null,
    [editingId, gstinsQuery.data?.items],
  );
  const canManage = hasPermission(sessionPermissions, permissions.manageGstin);

  return (
    <div className="space-y-6">
      <PageHeader
        title="GSTINs"
        description="Scan registration-level health, state coverage, and operational dependencies across the portfolio."
        actions={canManage ? [{ label: "Add GSTIN", onClick: () => setDialogOpen(true) }] : []}
      />
      <SectionCard title="GSTIN portfolio" description="Live GSTIN records for the selected client context.">
        {clients.length === 0 && !clientsQuery.isLoading ? (
          <EmptyState title="No clients available" description="Create a client first to begin GSTIN management." />
        ) : null}
        {clientsQuery.isLoading || gstinsQuery.isLoading ? <LoadingState message="Loading GSTIN portfolio..." /> : null}
        {gstinsQuery.isError ? <ErrorState description="We couldn't load GSTIN data. Resolve the API issue before continuing with registration management." /> : null}
        {displayGstins.length > 0 ? (
          <DataTableShell
            columns={[
              { key: "gstin", label: "GSTIN" },
              { key: "state", label: "State" },
              { key: "registrationType", label: "Registration Type" },
              { key: "status", label: "Status" },
              { key: "actions", label: "" },
            ]}
            rows={displayGstins.map((gstin) => ({
              id: gstin.id,
              gstin: gstin.gstin,
              state: gstin.state_code,
              registrationType: formatRegistrationTypeLabel(gstin.registration_type),
              status: gstin.is_active ? "Active" : "Inactive",
              actions:
                canManage ? (
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingId(gstin.id);
                    setDialogOpen(true);
                  }}>
                    <ActionLabel kind="edit" label="Edit" />
                  </Button>
                ) : null,
            }))}
          />
        ) : null}
      </SectionCard>
      <GstinFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingId(null);
          }
        }}
        clients={clients}
        initialValues={editingGstin}
      />
    </div>
  );
}
