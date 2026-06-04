"use client";

import { use } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { clients as mockClients } from "@/data/clients";
import { gstins as mockGstins } from "@/data/gstins";
import { useClientQuery } from "@/features/clients";
import { useGstinsQuery } from "@/features/gstins";

export default function ClientGstinsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = use(params);
  const clientQuery = useClientQuery(clientId);
  const clientFallback = mockClients.find((entry) => entry.id === clientId);
  const gstinsQuery = useGstinsQuery(clientId);
  const displayGstins = gstinsQuery.data?.items.length
    ? gstinsQuery.data.items.map((gstin) => ({
        id: gstin.id,
        gstin: gstin.gstin,
        state: gstin.state_code,
        registrationType: gstin.registration_type,
        status: "Active",
      }))
    : mockGstins
        .filter((entry) => entry.clientId === clientId)
        .map((gstin) => ({
          id: gstin.id,
          gstin: gstin.gstin,
          state: gstin.state,
          registrationType: gstin.registrationType,
          status: gstin.status,
        }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${clientQuery.data?.legal_name ?? clientFallback?.name ?? "Client"} GSTINs`}
        description="State registrations, registration types, and operational health in one compact workspace."
      />
      <SectionCard title="GSTIN register" description="Review GSTIN-level status and downstream compliance coverage.">
        {gstinsQuery.isLoading ? <LoadingState message="Loading GSTIN records..." /> : null}
        {gstinsQuery.isError ? <ErrorState description="Live GSTIN data is unavailable, so fallback data is shown where possible." /> : null}
        {displayGstins.length === 0 ? (
          <EmptyState
            title="No GSTIN records found"
            description="Once GSTINs are created for this client, they will appear here with live API data."
          />
        ) : (
          <DataTableShell
            columns={[
              { key: "gstin", label: "GSTIN" },
              { key: "state", label: "State" },
              { key: "registrationType", label: "Registration Type" },
              { key: "status", label: "Status" },
            ]}
            rows={displayGstins}
          />
        )}
      </SectionCard>
    </div>
  );
}
