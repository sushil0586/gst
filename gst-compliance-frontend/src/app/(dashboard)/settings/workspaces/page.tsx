"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrganizationsQuery, useWorkspacesQuery, useCreateWorkspaceMutation, useDeactivateWorkspaceMutation, useUpdateWorkspaceMutation } from "@/features/workspace";
import { getErrorMessage } from "@/lib/api/error-handler";
import { hasPermission, permissions } from "@/lib/permissions";
import { useSession } from "@/lib/query/session-provider";
import type { WorkspaceRecord } from "@/types/api";

type WorkspaceFormState = {
  organization: string;
  name: string;
  code: string;
  timezone: string;
  office_label: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postal_code: string;
  contact_email: string;
  contact_phone: string;
};

const initialFormState: WorkspaceFormState = {
  organization: "",
  name: "",
  code: "",
  timezone: "Asia/Kolkata",
  office_label: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  state: "",
  postal_code: "",
  contact_email: "",
  contact_phone: "",
};

function getSuggestedOrganizationId(
  organizations: { id: string }[],
  sessionOrganizationIds: string[],
) {
  if (organizations.length === 1) {
    return organizations[0]?.id ?? "";
  }

  const matchingOrganization = organizations.find((organization) => sessionOrganizationIds.includes(organization.id));
  return matchingOrganization?.id ?? organizations[0]?.id ?? "";
}

function buildWorkspaceCode(name: string) {
  const compact = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.slice(0, 4))
    .join("-");
  return compact.slice(0, 24);
}

function buildOfficeLabel(name: string) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(workspace|office|branch)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSuggestedCity(name: string) {
  const cleaned = buildOfficeLabel(name);
  if (!cleaned) {
    return "";
  }

  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 0) {
    return "";
  }

  return parts.length === 1 ? parts[0] : parts.slice(-2).join(" ");
}

export default function WorkspaceManagementPage() {
  const { session, permissions: sessionPermissions } = useSession();
  const organizationsQuery = useOrganizationsQuery();
  const workspacesQuery = useWorkspacesQuery();
  const createWorkspaceMutation = useCreateWorkspaceMutation();
  const deactivateWorkspaceMutation = useDeactivateWorkspaceMutation();
  const [formState, setFormState] = useState<WorkspaceFormState>(initialFormState);
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceRecord | null>(null);
  const canManageWorkspaces = hasPermission(sessionPermissions, permissions.manageSettings)
    || hasPermission(sessionPermissions, permissions.manageUsers)
    || Boolean(session?.is_platform_admin);

  const organizations = organizationsQuery.data?.items ?? [];
  const workspaces = workspacesQuery.data?.items ?? [];
  const sessionWorkspaceFallback = session?.workspaces ?? [];
  const sessionOrganizationIds = useMemo(
    () => (session?.organizations ?? []).map((organization) => organization.id),
    [session?.organizations],
  );
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const workspaceAccessById = useMemo(
    () => new Map((session?.workspaces ?? []).map((workspace) => [workspace.id, workspace])),
    [session?.workspaces],
  );
  const updateWorkspaceMutation = useUpdateWorkspaceMutation(editingWorkspace?.id);
  const showWorkspaceLoadError = workspacesQuery.isError || organizationsQuery.isError;
  const workspaceRegisterCards = useMemo(() => {
    if (workspaces.length > 0) {
      return workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        officeLabel: workspace.office_label || organizationsById.get(workspace.organization)?.name || "Organization unavailable",
        code: workspace.code,
        timezone: workspace.timezone,
        role: workspaceAccessById.get(workspace.id)?.role ?? "Member",
        cityState: [workspace.city, workspace.state].filter(Boolean).join(", ") || "-",
        organizationCode: organizationsById.get(workspace.organization)?.code ?? "-",
        address: [workspace.address_line_1, workspace.address_line_2, workspace.city, workspace.state, workspace.postal_code].filter(Boolean).join(", ") || "-",
        contactEmail: workspace.contact_email || "-",
        contactPhone: workspace.contact_phone || "-",
        isActive: workspace.is_active,
        canEdit: true,
        source: "live" as const,
        workspaceRecord: workspace,
      }));
    }

    return sessionWorkspaceFallback.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      officeLabel: workspace.office_label || workspace.organization_name || "Organization unavailable",
      code: workspace.code,
      timezone: workspace.timezone,
      role: workspace.role ?? "Member",
      cityState: [workspace.city, workspace.state].filter(Boolean).join(", ") || "-",
      organizationCode: workspace.organization_name,
      address: [workspace.address_line_1, workspace.address_line_2, workspace.city, workspace.state, workspace.postal_code].filter(Boolean).join(", ") || "-",
      contactEmail: workspace.contact_email || "-",
      contactPhone: workspace.contact_phone || "-",
      isActive: true,
      canEdit: false,
      source: "session" as const,
      workspaceRecord: null,
    }));
  }, [organizationsById, sessionWorkspaceFallback, workspaceAccessById, workspaces]);

  const resetForm = () => {
    setEditingWorkspace(null);
    setFormState((current) => ({
      ...initialFormState,
      organization: current.organization || getSuggestedOrganizationId(organizations, sessionOrganizationIds),
    }));
  };

  useEffect(() => {
    if (editingWorkspace || organizations.length === 0 || formState.organization) {
      return;
    }

    const suggestedOrganizationId = getSuggestedOrganizationId(organizations, sessionOrganizationIds);
    if (!suggestedOrganizationId) {
      return;
    }

    setFormState((current) => ({ ...current, organization: suggestedOrganizationId }));
  }, [editingWorkspace, formState.organization, organizations, sessionOrganizationIds]);

  const populateEditForm = (workspace: WorkspaceRecord) => {
    setEditingWorkspace(workspace);
    setFormState({
      organization: workspace.organization,
      name: workspace.name,
      code: workspace.code,
      timezone: workspace.timezone,
      office_label: workspace.office_label,
      address_line_1: workspace.address_line_1,
      address_line_2: workspace.address_line_2,
      city: workspace.city,
      state: workspace.state,
      postal_code: workspace.postal_code,
      contact_email: workspace.contact_email,
      contact_phone: workspace.contact_phone,
    });
  };

  const handleCreateWorkspace = async () => {
    const missingFields = [
      !formState.organization ? "organization" : null,
      !formState.name.trim() ? "workspace name" : null,
      !formState.code.trim() ? "workspace code" : null,
      !formState.timezone.trim() ? "timezone" : null,
    ].filter(Boolean);

    if (missingFields.length > 0) {
      toast.error(`Please complete: ${missingFields.join(", ")}.`);
      return;
    }

    try {
      const payload = {
        organization: formState.organization,
        name: formState.name.trim(),
        code: formState.code.trim().toUpperCase(),
        timezone: formState.timezone.trim(),
        office_label: formState.office_label.trim(),
        address_line_1: formState.address_line_1.trim(),
        address_line_2: formState.address_line_2.trim(),
        city: formState.city.trim(),
        state: formState.state.trim(),
        postal_code: formState.postal_code.trim(),
        contact_email: formState.contact_email.trim(),
        contact_phone: formState.contact_phone.trim(),
      };
      if (editingWorkspace) {
        await updateWorkspaceMutation.mutateAsync(payload);
        toast.success("Workspace updated.");
      } else {
        await createWorkspaceMutation.mutateAsync(payload);
        toast.success("Workspace created.");
      }
      setFormState((current) => ({
        organization: current.organization,
        name: "",
        code: "",
        timezone: current.timezone,
        office_label: "",
        address_line_1: "",
        address_line_2: "",
        city: "",
        state: "",
        postal_code: "",
        contact_email: "",
        contact_phone: "",
      }));
      setEditingWorkspace(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDeactivateWorkspace = async (workspace: WorkspaceRecord) => {
    const confirmed = window.confirm(`Deactivate ${workspace.name}? The workspace will no longer be available in active selections.`);
    if (!confirmed) {
      return;
    }
    try {
      await deactivateWorkspaceMutation.mutateAsync(workspace.id);
      toast.success("Workspace deactivated.");
      if (editingWorkspace?.id === workspace.id) {
        resetForm();
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workspace Management"
        description="Create and manage office-level workspaces under your CA organization, such as Delhi, Jaipur, or Bangalore operations."
      />

      <SectionCard
        title="Why multiple workspaces"
        description="Use separate workspaces when the same CA firm needs branch-level portfolios, team separation, or office-specific operations."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">Branch separation</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">Keep Delhi, Jaipur, and Bangalore client portfolios in separate operating queues.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">Team control</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">Assign workspace-specific members so each office only sees its own returns, notices, and follow-ups.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">Cleaner reporting</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">Branch managers can monitor their own queues without the noise of every office in one view.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Office workspace register"
        description="Each workspace can represent a CA office, branch, or separate operating unit under the same organization."
      >
        {workspacesQuery.isLoading || organizationsQuery.isLoading ? <LoadingState message="Loading workspaces..." /> : null}
        {showWorkspaceLoadError ? (
          <ErrorState
            description={
              workspaceRegisterCards.length > 0
                ? "We couldn't refresh live workspace details right now. Showing the workspaces available in your current signed-in session."
                : "We couldn't load live workspace data right now."
            }
          />
        ) : null}
        {!workspacesQuery.isLoading && !showWorkspaceLoadError && workspaceRegisterCards.length === 0 ? (
          <EmptyState title="No workspaces yet" description="Create the first operating workspace for your organization." />
        ) : null}
        {!workspacesQuery.isLoading && showWorkspaceLoadError && workspaceRegisterCards.length === 0 ? (
          <div className="flex justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void workspacesQuery.refetch();
                void organizationsQuery.refetch();
              }}
            >
              Retry loading workspaces
            </Button>
          </div>
        ) : null}
        {workspaceRegisterCards.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {workspaceRegisterCards.map((workspace) => {
              return (
                <div key={workspace.id} className="rounded-2xl border border-slate-200 px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">{workspace.name}</p>
                      <p className="mt-1 text-sm text-slate-600">{workspace.officeLabel}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${workspace.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {workspace.isActive ? "Active" : "Inactive"}
                      </span>
                      {workspace.source === "session" ? (
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                          Session view
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Code</dt>
                      <dd className="mt-1 text-sm text-slate-800">{workspace.code}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Office label</dt>
                      <dd className="mt-1 text-sm text-slate-800">{workspace.officeLabel || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Timezone</dt>
                      <dd className="mt-1 text-sm text-slate-800">{workspace.timezone}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Your role</dt>
                      <dd className="mt-1 text-sm text-slate-800">{workspace.role}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">City / state</dt>
                      <dd className="mt-1 text-sm text-slate-800">{workspace.cityState}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Organization</dt>
                      <dd className="mt-1 text-sm text-slate-800">{workspace.organizationCode || "-"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Office address</dt>
                      <dd className="mt-1 text-sm text-slate-800">{workspace.address}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Office email</dt>
                      <dd className="mt-1 text-sm text-slate-800">{workspace.contactEmail}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Office phone</dt>
                      <dd className="mt-1 text-sm text-slate-800">{workspace.contactPhone}</dd>
                    </div>
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {canManageWorkspaces && workspace.canEdit && workspace.workspaceRecord ? (
                      <Button size="sm" variant="outline" onClick={() => populateEditForm(workspace.workspaceRecord)}>
                        Edit workspace
                      </Button>
                    ) : null}
                    {canManageWorkspaces && workspace.canEdit && workspace.workspaceRecord && workspace.isActive ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-600 hover:text-rose-700"
                        onClick={() => handleDeactivateWorkspace(workspace.workspaceRecord)}
                        disabled={deactivateWorkspaceMutation.isPending}
                      >
                        Deactivate
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title={editingWorkspace ? "Edit workspace" : "Create workspace"}
        description="Add or update office workspaces under an existing organization. New clients can then be created inside that workspace from the normal Clients flow."
      >
        {!canManageWorkspaces ? (
          <EmptyState
            title="You need workspace-level admin access"
            description="Only an owner, admin, or settings manager should create new office workspaces."
          />
        ) : organizations.length === 0 ? (
          <EmptyState
            title="No organization found"
            description="This account does not have an organization available for workspace creation yet."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Organization</Label>
              <Select
                value={formState.organization}
                onValueChange={(value) => setFormState((current) => ({ ...current, organization: value }))}
                disabled={organizations.length <= 1}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                {organizations.length <= 1
                  ? "This workspace will be created under your current CA organization."
                  : "Choose the CA organization under which this office workspace should be created."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                value={formState.name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  const suggestedOfficeLabel = buildOfficeLabel(nextName);
                  const suggestedCity = buildSuggestedCity(nextName);
                  setFormState((current) => ({
                    ...current,
                    name: nextName,
                    code: current.code.trim() ? current.code : buildWorkspaceCode(nextName),
                    office_label: current.office_label.trim() ? current.office_label : suggestedOfficeLabel,
                    city: current.city.trim() ? current.city : suggestedCity,
                  }));
                }}
                placeholder="Delhi Office"
              />
              <p className="text-xs text-slate-500">
                Use the office or branch name your team will actually switch into every day.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-code">Workspace code</Label>
              <Input
                id="workspace-code"
                value={formState.code}
                onChange={(event) => setFormState((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                placeholder="DELHI"
              />
              <p className="text-xs text-slate-500">
                Suggested automatically from workspace name. You can still override it.
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="workspace-timezone">Timezone</Label>
              <Input
                id="workspace-timezone"
                value={formState.timezone}
                onChange={(event) => setFormState((current) => ({ ...current, timezone: event.target.value }))}
                placeholder="Asia/Kolkata"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-office-label">Office label</Label>
              <Input
                id="workspace-office-label"
                value={formState.office_label}
                onChange={(event) => setFormState((current) => ({ ...current, office_label: event.target.value }))}
                placeholder="Delhi NCR Branch"
              />
              <p className="text-xs text-slate-500">
                This is the friendly branch label shown in workspace cards and office views.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-contact-phone">Office phone</Label>
              <Input
                id="workspace-contact-phone"
                value={formState.contact_phone}
                onChange={(event) => setFormState((current) => ({ ...current, contact_phone: event.target.value }))}
                placeholder="+91 11 4000 1234"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="workspace-address-1">Address line 1</Label>
              <Input
                id="workspace-address-1"
                value={formState.address_line_1}
                onChange={(event) => setFormState((current) => ({ ...current, address_line_1: event.target.value }))}
                placeholder="12 Barakhamba Road"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="workspace-address-2">Address line 2</Label>
              <Input
                id="workspace-address-2"
                value={formState.address_line_2}
                onChange={(event) => setFormState((current) => ({ ...current, address_line_2: event.target.value }))}
                placeholder="Connaught Place"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-city">City</Label>
              <Input
                id="workspace-city"
                value={formState.city}
                onChange={(event) => setFormState((current) => ({ ...current, city: event.target.value }))}
                placeholder="New Delhi"
              />
              <p className="text-xs text-slate-500">
                If the workspace name includes a city, we suggest it automatically while the field is blank.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-state">State</Label>
              <Input
                id="workspace-state"
                value={formState.state}
                onChange={(event) => setFormState((current) => ({ ...current, state: event.target.value }))}
                placeholder="Delhi"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-postal-code">Postal code</Label>
              <Input
                id="workspace-postal-code"
                value={formState.postal_code}
                onChange={(event) => setFormState((current) => ({ ...current, postal_code: event.target.value }))}
                placeholder="110001"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="workspace-contact-email">Office email</Label>
              <Input
                id="workspace-contact-email"
                type="email"
                value={formState.contact_email}
                onChange={(event) => setFormState((current) => ({ ...current, contact_email: event.target.value }))}
                placeholder="delhi.office@firm.example.com"
              />
            </div>

            <div className="md:col-span-2 flex justify-end">
              <div className="flex gap-3">
                {editingWorkspace ? (
                  <Button type="button" variant="outline" className="h-11" onClick={resetForm}>
                    Cancel
                  </Button>
                ) : null}
                <Button
                  className="h-11 min-w-40"
                  onClick={handleCreateWorkspace}
                  disabled={createWorkspaceMutation.isPending || updateWorkspaceMutation.isPending}
                >
                  {editingWorkspace
                    ? (updateWorkspaceMutation.isPending ? "Saving..." : "Save workspace")
                    : (createWorkspaceMutation.isPending ? "Creating..." : "Create workspace")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Operator shortcut"
        description="After creating a workspace, continue normal setup from the core operating screens."
      >
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/clients">Open clients</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/settings/team">Open team management</Link>
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
