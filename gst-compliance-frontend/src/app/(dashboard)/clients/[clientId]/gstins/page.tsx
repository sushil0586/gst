"use client";

import { use } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { useClientQuery } from "@/features/clients";
import { useGstinsQuery } from "@/features/gstins";
import { formatRegistrationTypeLabel } from "@/lib/constants/gst-registration-types";

export default function ClientGstinsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = use(params);
  const clientQuery = useClientQuery(clientId);
  const gstinsQuery = useGstinsQuery(clientId);
  const displayGstins = (gstinsQuery.data?.items ?? []).map((gstin) => ({
    id: gstin.id,
    gstin: gstin.gstin,
    state: gstin.state_code,
    registrationType: formatRegistrationTypeLabel(gstin.registration_type),
    status: gstin.is_active ? "Active" : "Inactive",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${clientQuery.data?.legal_name ?? "Client"} GSTINs`}
        description="State registrations, registration types, and operational health in one compact workspace."
      />
      <SectionCard title="GSTIN register" description="Review GSTIN-level status and downstream compliance coverage.">
        {gstinsQuery.isLoading ? <LoadingState message="Loading GSTIN records..." /> : null}
        {gstinsQuery.isError ? <ErrorState description="Live GSTIN data is unavailable. Resolve the API issue before continuing with registration work." /> : null}
        {displayGstins.length === 0 ? (
          <EmptyState
            title="No GSTIN records found"
            description="Once GSTINs are created for this client, they will appear here."
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
