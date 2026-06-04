"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ClientFormDialog } from "@/components/forms/client-form-dialog";
import { ActionLabel } from "@/components/common/action-label";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FilterBar } from "@/components/common/filter-bar";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { ComplianceStatusBadge } from "@/components/status/compliance-status-badge";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { Button } from "@/components/ui/button";
import { clients as mockClients } from "@/data/clients";
import { useClientsQuery, useDeleteClientMutation } from "@/features/clients";
import { getErrorMessage } from "@/lib/api/error-handler";
import { useWorkspacesQuery } from "@/features/workspace";
import { hasPermission, permissions } from "@/lib/permissions";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";

export default function ClientsPage() {
  const { user, permissions: sessionPermissions } = useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const workspacesQuery = useWorkspacesQuery();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const clientsQuery = useClientsQuery(selectedWorkspaceId);
  const deleteClientMutation = useDeleteClientMutation(selectedWorkspaceId);
  const connectedClients = clientsQuery.data?.items;
  const displayClients = connectedClients?.length
    ? connectedClients.map((client) => ({
        id: client.id,
        name: client.legal_name,
        code: client.client_code,
        industry: "Managed account",
        owner: user?.full_name ?? "Assigned user",
        activeIssues: "Live",
        filingStatus: "On Track",
        canEdit: true,
        canDelete: Boolean(client.can_delete),
        transactionCount: client.transaction_count ?? 0,
      }))
    : clientsQuery.isError
      ? mockClients.map((client) => ({
          id: client.id,
          name: client.name,
          code: client.code,
          industry: client.industry,
          owner: client.owner,
          activeIssues: client.activeIssues,
          filingStatus: client.filingStatus,
          canEdit: false,
          canDelete: false,
        }))
      : [];
  const editingClient = connectedClients?.find((client) => client.id === editingClientId) ?? null;
  const canManageClients = hasPermission(sessionPermissions, permissions.manageClient);

  const handleDeleteClient = async (clientId: string, clientName: string) => {
    const confirmed = window.confirm(`Delete ${clientName}? This will only work if the client has no active transactions.`);
    if (!confirmed) {
      return;
    }
    try {
      await deleteClientMutation.mutateAsync(clientId);
      toast.success("Client deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Manage GST compliance portfolios across legal entities, business verticals, and filing owners."
      />
      <FilterBar trailing={canManageClients ? <Button size="sm" onClick={() => setDialogOpen(true)}>Add Client</Button> : null}>
        <div className="surface-muted px-4 py-3 text-sm text-slate-600">Portfolio: All active clients</div>
        <div className="surface-muted px-4 py-3 text-sm text-slate-600">Risk view: At risk first</div>
      </FilterBar>
      <SectionCard title="Client portfolio" description="Operational snapshot of current filing exposure.">
        {clientsQuery.isLoading ? <LoadingState message="Loading clients..." /> : null}
        {clientsQuery.isError ? <ErrorState description="We couldn't load live clients. Mock portfolio data is shown only as a preview while the API issue is resolved." /> : null}
        {!clientsQuery.isLoading && displayClients.length === 0 ? (
          <EmptyState title="No clients yet" description="Create your first client to start GSTIN and filing period setup." />
        ) : null}
        {displayClients.length > 0 ? (
          <DataTableShell
            columns={[
              { key: "name", label: "Client" },
              { key: "code", label: "Code" },
              { key: "industry", label: "Industry" },
              { key: "owner", label: "Owner" },
              { key: "activeIssues", label: "Open Issues" },
              { key: "filingStatus", label: "Status" },
              { key: "actions", label: "" },
            ]}
            rows={displayClients.map((client) => ({
              id: client.id,
              name: client.name,
              code: client.code,
              industry: client.industry,
              owner: client.owner,
              activeIssues: client.activeIssues,
              filingStatus: <ComplianceStatusBadge status={client.filingStatus} />,
              actions: (
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/clients/${client.id}`}>
                      <ActionLabel kind="open" label="Open" />
                    </Link>
                  </Button>
                  {canManageClients && client.canEdit ? (
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditingClientId(client.id);
                      setDialogOpen(true);
                    }}>
                      <ActionLabel kind="edit" label="Edit" />
                    </Button>
                  ) : null}
                  {canManageClients && client.canDelete ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700"
                      onClick={() => handleDeleteClient(client.id, client.name)}
                      disabled={deleteClientMutation.isPending}
                    >
                      <ActionLabel kind="delete" label="Delete" />
                    </Button>
                  ) : null}
                </div>
              ),
            }))}
          />
        ) : null}
      </SectionCard>
      <ClientFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingClientId(null);
          }
        }}
        workspaces={workspacesQuery.data?.items ?? []}
        initialValues={editingClient}
      />
    </div>
  );
}
