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
import { AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from "@/components/common/app-modal";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useGstinsQuery } from "@/features/gstins";
import { useCreateNoticeMutation, useNoticesQuery, useUpdateNoticeMutation } from "@/features/notices";
import { useWorkspaceMembersQuery } from "@/features/workspace";
import { getErrorMessage } from "@/lib/api/error-handler";
import { hasPermission, permissions } from "@/lib/permissions";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { NoticeRecordApi } from "@/types/api";

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "responded", label: "Responded" },
  { value: "escalated", label: "Escalated" },
  { value: "closed", label: "Closed" },
];

function formatDateTime(value?: string | null) {
  if (!value) return "Pending";
  return format(new Date(value), "dd MMM yyyy, h:mm a");
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return format(new Date(value), "dd MMM yyyy");
}

function getNoticeStatusVariant(status?: string) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "responded" || normalized === "closed") return "success" as const;
  if (normalized === "escalated") return "danger" as const;
  if (normalized === "open") return "warning" as const;
  return "primary" as const;
}

export default function NoticesPage() {
  const searchParams = useSearchParams();
  const { permissions: sessionPermissions } = useSession();
  const {
    workspaces,
    clients,
    gstins: contextGstins,
    periods,
    selectedWorkspaceId,
    selectedClientId,
    selectedGstinId,
    selectedClient,
    setSelectedWorkspaceId,
    setSelectedClientId,
    setSelectedGstinId,
    setSelectedPeriodId,
  } = useWorkspaceContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<NoticeRecordApi | null>(null);
  const [status, setStatus] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const queryWorkspaceId = searchParams.get("workspace");
  const queryClientId = searchParams.get("client");
  const queryGstinId = searchParams.get("gstin");
  const queryPeriodId = searchParams.get("period") ?? searchParams.get("compliance_period");
  const [formState, setFormState] = useState({
    gstin: selectedGstinId ?? "",
    reference_number: "",
    title: "",
    description: "",
    status: "open",
    due_date: "",
    assigned_to: "unassigned",
  });

  const gstinsQuery = useGstinsQuery(selectedClientId);
  const workspaceMembersQuery = useWorkspaceMembersQuery(selectedWorkspaceId ?? undefined);
  const gstins = gstinsQuery.data?.items ?? [];
  const workspaceMembers = workspaceMembersQuery.data?.items ?? [];
  const canManageNotices = hasPermission(sessionPermissions, permissions.manageGstin);

  const filters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      status: status !== "all" ? status : undefined,
      assigned_to: assigneeFilter !== "all" ? assigneeFilter : undefined,
      search: search || undefined,
    }),
    [assigneeFilter, search, selectedClientId, selectedGstinId, selectedWorkspaceId, status],
  );

  const noticesQuery = useNoticesQuery(filters, Boolean(selectedWorkspaceId));
  const createNoticeMutation = useCreateNoticeMutation(filters);
  const updateNoticeMutation = useUpdateNoticeMutation(editingNotice?.id, filters);
  const notices = noticesQuery.data?.items ?? [];

  useEffect(() => {
    if (queryWorkspaceId && queryWorkspaceId !== selectedWorkspaceId && workspaces.some((workspace) => workspace.id === queryWorkspaceId)) {
      setSelectedWorkspaceId(queryWorkspaceId);
      return;
    }
    if (queryClientId && queryClientId !== selectedClientId && clients.some((client) => client.id === queryClientId)) {
      setSelectedClientId(queryClientId);
      return;
    }
    if (queryGstinId && queryGstinId !== selectedGstinId && contextGstins.some((gstin) => gstin.id === queryGstinId)) {
      setSelectedGstinId(queryGstinId);
      return;
    }
    if (queryPeriodId && periods.some((period) => period.id === queryPeriodId)) {
      setSelectedPeriodId(queryPeriodId);
    }
  }, [
    clients,
    contextGstins,
    periods,
    queryClientId,
    queryGstinId,
    queryPeriodId,
    queryWorkspaceId,
    selectedClientId,
    selectedGstinId,
    selectedWorkspaceId,
    setSelectedClientId,
    setSelectedGstinId,
    setSelectedPeriodId,
    setSelectedWorkspaceId,
    workspaces,
  ]);

  const availableGstins = selectedClientId ? gstins : [];

  const resetForm = () => {
    setFormState({
      gstin: selectedGstinId ?? availableGstins[0]?.id ?? "",
      reference_number: "",
      title: "",
      description: "",
      status: "open",
      due_date: "",
      assigned_to: "unassigned",
    });
  };

  const handleOpenDialog = () => {
    setEditingNotice(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleEditNotice = (notice: NoticeRecordApi) => {
    setEditingNotice(notice);
    setFormState({
      gstin: notice.gstin,
      reference_number: notice.reference_number,
      title: notice.title,
      description: notice.description ?? "",
      status: notice.status,
      due_date: notice.due_date ?? "",
      assigned_to: notice.assigned_to ? String(notice.assigned_to) : "unassigned",
    });
    setDialogOpen(true);
  };

  const handleSubmitNotice = async () => {
    if (!formState.gstin || !formState.reference_number.trim() || !formState.title.trim()) {
      toast.error("Select a GSTIN and fill the reference number plus title before creating a notice.");
      return;
    }

    try {
      const payload = {
        reference_number: formState.reference_number.trim(),
        title: formState.title.trim(),
        description: formState.description.trim(),
        status: formState.status,
        due_date: formState.due_date || null,
        assigned_to: formState.assigned_to === "unassigned" ? null : Number(formState.assigned_to),
      };
      if (editingNotice) {
        await updateNoticeMutation.mutateAsync(payload);
        toast.success("Notice updated.");
      } else {
        await createNoticeMutation.mutateAsync({
          gstin: formState.gstin,
          ...payload,
        });
        toast.success("Notice created.");
      }
      setDialogOpen(false);
      setEditingNotice(null);
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notices"
        description="Track live government notices, response posture, and due follow-up within the active compliance context."
        actions={canManageNotices ? [{ label: "Add Notice", onClick: handleOpenDialog, disabled: !selectedClientId || availableGstins.length === 0 }] : []}
      />

      {!selectedWorkspaceId ? (
        <EmptyState
          title="Select a workspace first"
          description="Choose a workspace from the topbar to load live notices."
        />
      ) : null}

      <SectionCard title="Notice filters" description="Focus notices by current context, status, and search terms.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="surface-muted px-4 py-3 text-sm text-slate-600">
            Client: {selectedClient?.legal_name ?? "All clients in workspace"}
          </div>
          <div className="surface-muted px-4 py-3 text-sm text-slate-600">
            GSTIN: {selectedGstinId ? gstins.find((item) => item.id === selectedGstinId)?.gstin ?? "Selected GSTIN" : "All GSTINs in scope"}
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 bg-slate-50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-10 bg-slate-50">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {workspaceMembers.map((member) => (
                <SelectItem key={member.user_id} value={String(member.user_id)}>
                  {member.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, title, or GSTIN" />
        </div>
      </SectionCard>

      <SectionCard title="Notice register" description="Live notices for the active workspace, client, and GSTIN context.">
        {!selectedWorkspaceId ? null : noticesQuery.isLoading ? (
          <LoadingState message="Loading notices..." />
        ) : noticesQuery.isError ? (
          <ErrorState description={getErrorMessage(noticesQuery.error)} />
        ) : notices.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Reference</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Created</TableHead>
                  {canManageNotices ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {notices.map((notice) => (
                  <TableRow key={notice.id}>
                    <TableCell className="font-medium text-slate-900">{notice.reference_number}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{notice.title}</p>
                        {notice.description ? <p className="mt-1 text-xs text-slate-500">{notice.description}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell>{notice.client_name ?? "Unknown client"}</TableCell>
                    <TableCell>{notice.gstin_value ?? "Unknown GSTIN"}</TableCell>
                    <TableCell>
                      <StatusBadge label={notice.status.replace(/_/g, " ")} variant={getNoticeStatusVariant(notice.status)} />
                    </TableCell>
                    <TableCell>{notice.assigned_to_name ?? "Unassigned"}</TableCell>
                    <TableCell>{formatDate(notice.due_date)}</TableCell>
                    <TableCell>{formatDateTime(notice.created_at)}</TableCell>
                    {canManageNotices ? (
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => handleEditNotice(notice)}>
                          <ActionLabel kind="edit" label="Update" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            title="No notices found"
            description={
              selectedClientId
                ? "No live notices match the current filters for this client context."
                : "No live notices match the current filters for this workspace."
            }
          />
        )}
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AppModalContent size="md">
          <AppModalHeader
            title={editingNotice ? "Update notice" : "Create notice"}
            description={
              editingNotice
                ? "Refresh status, owner, deadline, or summary details without leaving the notice register."
                : "Record a live notice against the selected GSTIN so it appears in the operational register."
            }
          />
          <AppModalBody className="space-y-4">
            <div className="space-y-2">
              <Label>GSTIN</Label>
              <Select
                value={formState.gstin}
                onValueChange={(value) => setFormState((current) => ({ ...current, gstin: value }))}
                disabled={Boolean(editingNotice)}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Select GSTIN" />
                </SelectTrigger>
                <SelectContent>
                  {availableGstins.map((gstin) => (
                    <SelectItem key={gstin.id} value={gstin.id}>
                      {gstin.gstin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editingNotice ? <p className="text-xs text-slate-500">GSTIN stays locked during updates so the notice history remains traceable.</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notice-reference">Reference number</Label>
              <Input
                id="notice-reference"
                value={formState.reference_number}
                onChange={(event) => setFormState((current) => ({ ...current, reference_number: event.target.value }))}
                placeholder="ASMT-10/2026/1184"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notice-title">Title</Label>
              <Input
                id="notice-title"
                value={formState.title}
                onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                placeholder="Mismatch in outward supplies"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formState.status} onValueChange={(value) => setFormState((current) => ({ ...current, status: value }))}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.filter((option) => option.value !== "all").map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notice-due-date">Response due date</Label>
                <Input
                  id="notice-due-date"
                  type="date"
                  value={formState.due_date}
                  onChange={(event) => setFormState((current) => ({ ...current, due_date: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={formState.assigned_to} onValueChange={(value) => setFormState((current) => ({ ...current, assigned_to: value }))}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {workspaceMembers.map((member) => (
                    <SelectItem key={member.user_id} value={String(member.user_id)}>
                      {member.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Assign the notice to a workspace operator so follow-up ownership is visible in the register.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notice-description">Description</Label>
              <Textarea
                id="notice-description"
                value={formState.description}
                onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                placeholder="Add the notice summary, context, or required response detail..."
                className="min-h-28 bg-slate-50"
              />
            </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">Notices remain tied to a GSTIN so response tracking stays audit-ready.</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setEditingNotice(null);
                }}
              >
                <ActionLabel kind="cancel" label="Cancel" />
              </Button>
              <Button onClick={handleSubmitNotice} disabled={createNoticeMutation.isPending || updateNoticeMutation.isPending}>
                {editingNotice
                  ? (updateNoticeMutation.isPending ? "Updating..." : "Update notice")
                  : (createNoticeMutation.isPending ? "Creating..." : "Create notice")}
              </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>
    </div>
  );
}
