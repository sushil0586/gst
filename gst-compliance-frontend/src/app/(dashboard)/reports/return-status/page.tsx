"use client";

import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock3, FileCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { ActionLabel } from "@/components/common/action-label";
import { AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from "@/components/common/app-modal";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useClientContactsQuery } from "@/features/clients";
import {
  useCreateOperationalFollowUpMutation,
  useReturnStatusRegisterQuery,
} from "@/features/customer-operations";
import { useWorkspaceMembersQuery } from "@/features/workspace";
import { getErrorMessage } from "@/lib/api/error-handler";
import { hasPermission, permissions } from "@/lib/permissions";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { ReturnStatusRegisterRecord } from "@/types/api";

type FollowUpFormState = {
  title: string;
  reason: string;
  follow_up_type:
    | "data_request"
    | "approval_request"
    | "otp_coordination"
    | "payment_confirmation"
    | "notice_document_request"
    | "return_filing_confirmation"
    | "mismatch_resolution"
    | "general";
  pending_with: "customer" | "ca_team" | "reviewer" | "provider" | "government_portal";
  priority: "low" | "medium" | "high" | "critical";
  contact: string;
  assigned_to: string;
  due_at: string;
  next_action: string;
  notes: string;
};

const initialFollowUpState: FollowUpFormState = {
  title: "",
  reason: "",
  follow_up_type: "general",
  pending_with: "customer",
  priority: "medium",
  contact: "none",
  assigned_to: "unassigned",
  due_at: "",
  next_action: "",
  notes: "",
};

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return format(new Date(value), "dd MMM yyyy");
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function toLabel(value?: string | null) {
  if (!value) return "Not set";
  return value.replace(/_/g, " ");
}

export default function ReturnStatusRegisterPage() {
  const searchParams = useSearchParams();
  const { permissions: sessionPermissions } = useSession();
  const {
    workspaces,
    clients,
    gstins,
    periods,
    selectedWorkspaceId,
    selectedClientId,
    selectedGstinId,
    selectedPeriodId,
    selectedClient,
    selectedGstin,
    selectedPeriod,
    setSelectedWorkspaceId,
    setSelectedClientId,
    setSelectedGstinId,
    setSelectedPeriodId,
  } =
    useWorkspaceContext();
  const [statusBucket, setStatusBucket] = useState<string>("all");
  const [pendingWith, setPendingWith] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState<string>("false");
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<ReturnStatusRegisterRecord | null>(null);
  const [followUpForm, setFollowUpForm] = useState<FollowUpFormState>(initialFollowUpState);

  const filters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      compliance_period: selectedPeriodId ?? undefined,
      status_bucket: statusBucket !== "all" ? statusBucket : undefined,
      pending_with: pendingWith !== "all" ? pendingWith : undefined,
      overdue_only: overdueOnly === "true" ? "true" : undefined,
      page_size: "100",
    }),
    [overdueOnly, pendingWith, selectedClientId, selectedGstinId, selectedPeriodId, selectedWorkspaceId, statusBucket],
  );

  const registerQuery = useReturnStatusRegisterQuery(filters);
  const createFollowUpMutation = useCreateOperationalFollowUpMutation(filters);
  const contactsQuery = useClientContactsQuery(followUpTarget?.client);
  const membersQuery = useWorkspaceMembersQuery(selectedWorkspaceId);
  const rows = registerQuery.data?.items ?? [];
  const contacts = contactsQuery.data?.items ?? [];
  const members = membersQuery.data?.items ?? [];
  const canManageFollowUps = hasPermission(sessionPermissions, permissions.manageClient);
  const queryWorkspaceId = searchParams.get("workspace");
  const queryClientId = searchParams.get("client");
  const queryGstinId = searchParams.get("gstin");
  const queryPeriodId = searchParams.get("period") ?? searchParams.get("compliance_period");

  const stats = useMemo(
    () => ({
      filed: rows.filter((item) => item.status_bucket === "filed").length,
      customerPending: rows.filter((item) => item.pending_with === "customer").length,
      blocked: rows.filter((item) => item.status_bucket === "blocked").length,
      overdue: rows.filter((item) => item.is_overdue && item.status_bucket !== "filed").length,
    }),
    [rows],
  );

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

  const resetFollowUpDialog = () => {
    setFollowUpDialogOpen(false);
    setFollowUpTarget(null);
    setFollowUpForm(initialFollowUpState);
  };

  const openFollowUpDialog = (row: ReturnStatusRegisterRecord) => {
    setFollowUpTarget(row);
    setFollowUpForm({
      title: `Follow up for ${row.client_name} • ${row.period} • ${row.return_type}`,
      reason: row.blocker_reason || row.latest_follow_up_title || "Customer coordination required for this return.",
      follow_up_type: row.pending_with === "customer" ? "data_request" : "general",
      pending_with:
        row.pending_with === "customer" ||
        row.pending_with === "ca_team" ||
        row.pending_with === "reviewer" ||
        row.pending_with === "provider" ||
        row.pending_with === "government_portal"
          ? row.pending_with
          : "customer",
      priority: row.is_overdue || row.status_bucket === "blocked" ? "high" : "medium",
      contact: "none",
      assigned_to: "unassigned",
      due_at: toDatetimeLocalValue(row.due_date ? new Date(`${row.due_date}T11:00:00`).toISOString() : new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()),
      next_action: row.pending_with === "customer" ? "Call the customer and confirm the pending item." : "Review the current blocker and decide the next safe action.",
      notes: row.latest_follow_up_title ? `Latest follow-up on record: ${row.latest_follow_up_title}` : "",
    });
    setFollowUpDialogOpen(true);
  };

  const handleCreateFollowUp = async () => {
    if (!followUpTarget || !selectedWorkspaceId) {
      toast.error("Select a workspace before creating a follow-up.");
      return;
    }
    if (!followUpForm.title.trim() || !followUpForm.reason.trim() || !followUpForm.due_at) {
      toast.error("Title, reason, and due time are required.");
      return;
    }
    try {
      await createFollowUpMutation.mutateAsync({
        workspace: selectedWorkspaceId,
        client: followUpTarget.client,
        gstin: followUpTarget.gstin,
        compliance_period: followUpTarget.id,
        return_preparation: followUpTarget.preparation_id,
        return_filing: followUpTarget.filing_id,
        notice: null,
        contact: followUpForm.contact === "none" ? null : followUpForm.contact,
        follow_up_type: followUpForm.follow_up_type,
        reason: followUpForm.reason.trim(),
        pending_with: followUpForm.pending_with,
        status: "open",
        priority: followUpForm.priority,
        title: followUpForm.title.trim(),
        notes: followUpForm.notes.trim(),
        next_action: followUpForm.next_action.trim(),
        due_at: new Date(followUpForm.due_at).toISOString(),
        assigned_to: followUpForm.assigned_to === "unassigned" ? null : Number(followUpForm.assigned_to),
      });
      toast.success("Operational follow-up created from return status register.");
      resetFollowUpDialog();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Return Status Register"
        description="Customer-facing return tracker for what is filed, blocked, overdue, or waiting on the customer in the active compliance scope."
        actions={[
          { label: "Open Follow-ups", href: "/operations/follow-ups", disabled: !selectedWorkspaceId || !selectedClientId },
          { label: "Open Returns", href: "/returns", disabled: !selectedWorkspaceId || !selectedClientId },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Filed" value={String(stats.filed)} detail="Return rows already filed or ARN-confirmed." tone="success" icon={CheckCircle2} />
        <StatCard label="Pending With Customer" value={String(stats.customerPending)} detail="Rows that still need customer data, approval, or coordination." tone="warning" icon={Clock3} />
        <StatCard label="Blocked" value={String(stats.blocked)} detail="Rows blocked by reconciliation, failed filing, or intervention issues." tone="danger" icon={AlertTriangle} />
        <StatCard label="Overdue" value={String(stats.overdue)} detail="Rows past due date and not yet fully filed." tone={stats.overdue > 0 ? "danger" : "primary"} icon={FileCheck} />
      </div>

      <SectionCard
        title="Active report scope"
        description="This register follows the topbar workspace, client, GSTIN, and period selectors so customer review stays tied to real compliance work."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Client</p>
            <p className="mt-2 text-sm font-medium text-slate-900">{selectedClient?.legal_name ?? "Not selected"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">GSTIN</p>
            <p className="mt-2 text-sm font-medium text-slate-900">{selectedGstin?.gstin ?? "Not selected"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Period</p>
            <p className="mt-2 text-sm font-medium text-slate-900">{selectedPeriod?.period ?? "Not selected"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Quick links</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/operations/follow-ups">
                  <ActionLabel kind="open" label="Follow-ups" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/returns">
                  <ActionLabel kind="open" label="Returns" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Register filters"
        description="Narrow the return queue by management bucket, pending owner, and whether only overdue rows should stay visible."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label className="mb-2 block text-sm font-medium text-slate-900">Status bucket</Label>
            <Select value={statusBucket} onValueChange={setStatusBucket}>
              <SelectTrigger><SelectValue placeholder="All buckets" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All buckets</SelectItem>
                <SelectItem value="filed">Filed</SelectItem>
                <SelectItem value="customer_pending">Pending with customer</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block text-sm font-medium text-slate-900">Pending with</Label>
            <Select value={pendingWith} onValueChange={setPendingWith}>
              <SelectTrigger><SelectValue placeholder="All pending owners" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pending owners</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="ca_team">CA team</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="provider">Provider</SelectItem>
                <SelectItem value="government_portal">Government portal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block text-sm font-medium text-slate-900">Visibility</Label>
            <Select value={overdueOnly} onValueChange={setOverdueOnly}>
              <SelectTrigger><SelectValue placeholder="Show all rows" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Show all rows</SelectItem>
                <SelectItem value="true">Only overdue rows</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Return register"
        description="Per-return management view showing filing state, blocker, owner, and the latest customer-follow-up pressure."
      >
        {!selectedWorkspaceId ? (
          <EmptyState title="Select a workspace first" description="Choose a workspace from the topbar before reviewing the return status register." />
        ) : registerQuery.isLoading ? (
          <LoadingState message="Loading return status register..." />
        ) : registerQuery.isError ? (
          <ErrorState description="We couldn't load the return status register right now." />
        ) : rows.length > 0 ? (
          <DataTableShell
            columns={[
              { key: "scope", label: "Return Scope" },
              { key: "status_bucket", label: "Management Bucket" },
              { key: "preparation", label: "Preparation" },
              { key: "filing", label: "Filing" },
              { key: "pending_with", label: "Pending With" },
              { key: "follow_ups", label: "Follow-ups" },
              { key: "owner", label: "Owner" },
              { key: "actions", label: "" },
            ]}
            rows={rows.map((row) => ({
              id: row.id,
              scope: (
                <div>
                  <p className="font-medium text-slate-900">{row.client_name}</p>
                  <p className="text-xs text-slate-500">
                    {row.gstin_value} • {row.period} • {row.return_type}
                  </p>
                  <p className="text-xs text-slate-500">Due {formatDate(row.due_date)}</p>
                </div>
              ),
              status_bucket: (
                <div>
                  <p className="font-medium text-slate-900">{toLabel(row.status_bucket)}</p>
                  <p className="text-xs text-slate-500">{row.is_overdue && row.status_bucket !== "filed" ? "Past due date" : "Within current control window"}</p>
                </div>
              ),
              preparation: (
                <div>
                  <p>{toLabel(row.preparation_status)}</p>
                  <p className="text-xs text-slate-500">{row.blocker_reason || "No active blocker saved."}</p>
                </div>
              ),
              filing: (
                <div>
                  <p>{toLabel(row.filing_status)}</p>
                  <p className="text-xs text-slate-500">
                    {row.arn ? `ARN ${row.arn}` : row.filed_at ? `Filed ${formatDate(row.filed_at)}` : "No ARN yet"}
                  </p>
                </div>
              ),
              pending_with: toLabel(row.pending_with || "ca_team"),
              follow_ups: (
                <div>
                  <p>{row.open_follow_up_count} open • {row.overdue_follow_up_count} overdue</p>
                  <p className="text-xs text-slate-500">{row.latest_follow_up_title || "No active follow-up title"}</p>
                </div>
              ),
              owner: row.owner_name || "Unassigned",
              actions: canManageFollowUps ? (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => openFollowUpDialog(row)}>
                    <ActionLabel kind="create" label="Create follow-up" />
                  </Button>
                </div>
              ) : null,
            }))}
          />
        ) : (
          <EmptyState
            title="No return status rows match this scope"
            description="Create compliance periods, returns, or customer follow-ups to start managing this register."
          />
        )}
      </SectionCard>

      <Dialog open={followUpDialogOpen} onOpenChange={(open) => (!open ? resetFollowUpDialog() : setFollowUpDialogOpen(open))}>
        <AppModalContent size="md">
          <AppModalHeader
            title="Create follow-up from return row"
            description={
              followUpTarget
                ? `This follow-up will be linked to ${followUpTarget.client_name} • ${followUpTarget.gstin_value} • ${followUpTarget.period} • ${followUpTarget.return_type}.`
                : "Link this follow-up to the selected return scope."
            }
          />
          <AppModalBody className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="return-followup-title">Title</Label>
              <Input
                id="return-followup-title"
                value={followUpForm.title}
                onChange={(event) => setFollowUpForm((current) => ({ ...current, title: event.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="return-followup-reason">Reason</Label>
              <Input
                id="return-followup-reason"
                value={followUpForm.reason}
                onChange={(event) => setFollowUpForm((current) => ({ ...current, reason: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Follow-up type</Label>
              <Select
                value={followUpForm.follow_up_type}
                onValueChange={(value) =>
                  setFollowUpForm((current) => ({
                    ...current,
                    follow_up_type: value as FollowUpFormState["follow_up_type"],
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="data_request">Data request</SelectItem>
                  <SelectItem value="approval_request">Approval request</SelectItem>
                  <SelectItem value="otp_coordination">OTP coordination</SelectItem>
                  <SelectItem value="payment_confirmation">Payment confirmation</SelectItem>
                  <SelectItem value="notice_document_request">Notice document request</SelectItem>
                  <SelectItem value="return_filing_confirmation">Return filing confirmation</SelectItem>
                  <SelectItem value="mismatch_resolution">Mismatch resolution</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pending with</Label>
              <Select
                value={followUpForm.pending_with}
                onValueChange={(value) =>
                  setFollowUpForm((current) => ({
                    ...current,
                    pending_with: value as FollowUpFormState["pending_with"],
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="ca_team">CA team</SelectItem>
                  <SelectItem value="reviewer">Reviewer</SelectItem>
                  <SelectItem value="provider">Provider</SelectItem>
                  <SelectItem value="government_portal">Government portal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={followUpForm.priority}
                onValueChange={(value) =>
                  setFollowUpForm((current) => ({
                    ...current,
                    priority: value as FollowUpFormState["priority"],
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Customer contact</Label>
              <Select value={followUpForm.contact} onValueChange={(value) => setFollowUpForm((current) => ({ ...current, contact: value }))}>
                <SelectTrigger><SelectValue placeholder="Select customer contact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No saved contact</SelectItem>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name} {contact.mobile_number ? `• ${contact.mobile_number}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assigned to</Label>
              <Select value={followUpForm.assigned_to} onValueChange={(value) => setFollowUpForm((current) => ({ ...current, assigned_to: value }))}>
                <SelectTrigger><SelectValue placeholder="Select workspace member" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={String(member.user_id)}>
                      {member.full_name} • {member.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="return-followup-due-at">Due time</Label>
              <Input
                id="return-followup-due-at"
                type="datetime-local"
                value={followUpForm.due_at}
                onChange={(event) => setFollowUpForm((current) => ({ ...current, due_at: event.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="return-followup-next-action">Next action</Label>
              <Input
                id="return-followup-next-action"
                value={followUpForm.next_action}
                onChange={(event) => setFollowUpForm((current) => ({ ...current, next_action: event.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="return-followup-notes">Notes</Label>
              <Textarea
                id="return-followup-notes"
                value={followUpForm.notes}
                onChange={(event) => setFollowUpForm((current) => ({ ...current, notes: event.target.value }))}
                rows={4}
              />
            </div>
          </AppModalBody>
          <AppModalFooter>
            <Button variant="ghost" onClick={resetFollowUpDialog}>
              Cancel
            </Button>
            <Button onClick={handleCreateFollowUp} disabled={createFollowUpMutation.isPending}>
              {createFollowUpMutation.isPending ? "Creating..." : "Create follow-up"}
            </Button>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>
    </div>
  );
}
