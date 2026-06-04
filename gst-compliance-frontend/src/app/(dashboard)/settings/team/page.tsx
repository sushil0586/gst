"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ActionLabel } from "@/components/common/action-label";
import { AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from "@/components/common/app-modal";
import { SectionCard } from "@/components/common/section-card";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/api/error-handler";
import { hasPermission, permissions } from "@/lib/permissions";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";
import {
  useCreateWorkspaceMemberMutation,
  useDeactivateWorkspaceMemberMutation,
  useUpdateWorkspaceMemberMutation,
  useWorkspaceMembersQuery,
} from "@/features/workspace";
import type { WorkspaceMemberRecord } from "@/types/api";

const roleOptions = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "reviewer", label: "Reviewer" },
  { value: "filer", label: "Filer" },
  { value: "senior_ca", label: "Senior CA" },
  { value: "viewer", label: "Viewer" },
];

type MemberFormState = {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  password: string;
};

const initialFormState: MemberFormState = {
  email: "",
  first_name: "",
  last_name: "",
  role: "filer",
  password: "",
};

export default function TeamManagementPage() {
  const { session, permissions: sessionPermissions } = useSession();
  const { selectedWorkspaceId, selectedWorkspace } = useWorkspaceContext();
  const membersQuery = useWorkspaceMembersQuery(selectedWorkspaceId);
  const createMemberMutation = useCreateWorkspaceMemberMutation(selectedWorkspaceId);
  const deactivateMemberMutation = useDeactivateWorkspaceMemberMutation(selectedWorkspaceId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formState, setFormState] = useState<MemberFormState>(initialFormState);
  const [editingMember, setEditingMember] = useState<WorkspaceMemberRecord | null>(null);
  const updateMemberMutation = useUpdateWorkspaceMemberMutation(selectedWorkspaceId, editingMember?.id);
  const canManageMembers = hasPermission(sessionPermissions, permissions.manageUsers) || Boolean(session?.is_platform_admin);
  const members = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data?.items]);

  const roleCounts = useMemo(() => {
    return roleOptions.map((option) => ({
      ...option,
      count: members.filter((member) => member.role === option.value).length,
    }));
  }, [members]);

  const openCreateDialog = () => {
    setEditingMember(null);
    setFormState(initialFormState);
    setDialogOpen(true);
  };

  const openEditDialog = (member: WorkspaceMemberRecord) => {
    setEditingMember(member);
    setFormState({
      email: member.email,
      first_name: member.first_name,
      last_name: member.last_name,
      role: member.role,
      password: "",
    });
    setDialogOpen(true);
  };

  const resetDialog = () => {
    setDialogOpen(false);
    setEditingMember(null);
    setFormState(initialFormState);
  };

  const handleSubmit = async () => {
    if (!selectedWorkspaceId) {
      toast.error("Select a workspace before managing team members.");
      return;
    }
    try {
      if (editingMember) {
        await updateMemberMutation.mutateAsync({ role: formState.role });
        toast.success("Workspace member updated.");
      } else {
        await createMemberMutation.mutateAsync({
          workspace: selectedWorkspaceId,
          email: formState.email,
          first_name: formState.first_name,
          last_name: formState.last_name,
          role: formState.role,
          password: formState.password,
        });
        toast.success("Workspace member added.");
      }
      resetDialog();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDeactivate = async (memberId: string) => {
    try {
      await deactivateMemberMutation.mutateAsync(memberId);
      toast.success("Workspace member deactivated.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Management"
        description="Onboard CAs, filers, reviewers, and workspace operators without using Django admin."
        actions={canManageMembers ? [{ label: "Add Member", onClick: openCreateDialog, disabled: !selectedWorkspaceId }] : []}
      />

      {!selectedWorkspaceId ? (
        <EmptyState
          title="Select a workspace to manage the team"
          description="Use the topbar workspace selector first. Team access is always scoped to a single workspace."
        />
      ) : null}

      {selectedWorkspaceId ? (
        <SectionCard
          title="Workspace team"
          description={`Manage filing and review access for ${selectedWorkspace?.name ?? "the selected workspace"}.`}
        >
          {membersQuery.isLoading ? <LoadingState message="Loading workspace members..." /> : null}
          {membersQuery.isError ? <ErrorState description="We couldn't load the workspace team right now." /> : null}
          {members.length === 0 && !membersQuery.isLoading ? (
            <EmptyState
              title="No team members yet"
              description="Add filers, senior CAs, reviewers, or accountants so the workspace can be tested like a real firm."
            />
          ) : null}
          {members.length > 0 ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {roleCounts
                  .filter((entry) => entry.count > 0)
                  .map((entry) => (
                    <div key={entry.value} className="rounded-2xl border border-slate-200 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{entry.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{entry.count}</p>
                    </div>
                  ))}
              </div>
              <DataTableShell
                columns={[
                  { key: "name", label: "Name" },
                  { key: "email", label: "Email" },
                  { key: "role", label: "Role" },
                  { key: "permissions", label: "Permissions" },
                  { key: "actions", label: "" },
                ]}
                rows={members.map((member) => ({
                  id: member.id,
                  name: member.full_name,
                  email: member.email,
                  role: roleOptions.find((option) => option.value === member.role)?.label ?? member.role,
                  permissions: member.permissions.join(", "),
                  actions: canManageMembers ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(member)}>
                        <ActionLabel kind="edit" label="Edit" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeactivate(member.id)}>
                        <ActionLabel kind="deactivate" label="Deactivate" />
                      </Button>
                    </div>
                  ) : null,
                }))}
              />
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Recommended workspace role usage"
        description="Use these role guidelines when onboarding actual CAs, lawyers, and filing operators."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">Filer</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Best for a user who prepares returns and marks them filed, but should not approve them.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">Senior CA</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Best for a CA or legal/compliance reviewer who should prepare, approve, and file returns with audit visibility.
            </p>
          </div>
        </div>
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={(open) => (!open ? resetDialog() : setDialogOpen(open))}>
        <AppModalContent size="md">
          <AppModalHeader
            title={editingMember ? "Update workspace member" : "Add workspace member"}
            description={
              editingMember
                ? "Adjust the role for an existing workspace user."
                : "Create a real user and grant access to this workspace so a CA or filer can log in directly."
            }
          />
          <AppModalBody className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                value={formState.email}
                onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                disabled={Boolean(editingMember)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-first-name">First name</Label>
              <Input
                id="member-first-name"
                value={formState.first_name}
                onChange={(event) => setFormState((current) => ({ ...current, first_name: event.target.value }))}
                disabled={Boolean(editingMember)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-last-name">Last name</Label>
              <Input
                id="member-last-name"
                value={formState.last_name}
                onChange={(event) => setFormState((current) => ({ ...current, last_name: event.target.value }))}
                disabled={Boolean(editingMember)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formState.role} onValueChange={(value) => setFormState((current) => ({ ...current, role: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!editingMember ? (
              <div className="space-y-2">
                <Label htmlFor="member-password">Initial password</Label>
                <Input
                  id="member-password"
                  type="password"
                  value={formState.password}
                  onChange={(event) => setFormState((current) => ({ ...current, password: event.target.value }))}
                />
              </div>
            ) : null}
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">Owner and admin roles can onboard firm users without relying on Django admin.</div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={resetDialog}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  createMemberMutation.isPending ||
                  updateMemberMutation.isPending ||
                  (!editingMember && (!formState.email || !formState.first_name || !formState.password))
                }
              >
                {editingMember
                  ? updateMemberMutation.isPending
                    ? "Saving..."
                    : "Save role"
                  : createMemberMutation.isPending
                    ? "Adding..."
                    : "Add member"}
              </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>
    </div>
  );
}
