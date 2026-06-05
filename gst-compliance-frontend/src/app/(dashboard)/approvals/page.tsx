"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ActionLabel } from "@/components/common/action-label";
import { AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from "@/components/common/app-modal";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useApproveApprovalMutation,
  useApprovalsQuery,
  useCancelApprovalMutation,
  useRejectApprovalMutation,
} from "@/features/approvals";
import { useReturnsQuery } from "@/features/returns";
import { getErrorMessage } from "@/lib/api/error-handler";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { ApprovalRequestRecord } from "@/types/api";

const statusOptions = ["all", "pending", "approved", "rejected", "cancelled"] as const;
const entityOptions = ["all", "import_batch", "reconciliation_run", "return_preparation", "compliance_period"] as const;

function formatDateTime(value?: string | null) {
  if (!value) return "Pending";
  return format(new Date(value), "dd MMM yyyy, h:mm a");
}

function statusVariant(status: ApprovalRequestRecord["status"]) {
  if (status === "approved") return "success" as const;
  if (status === "pending") return "warning" as const;
  if (status === "rejected") return "danger" as const;
  return "neutral" as const;
}

function getPeriodExceptionCountFromSummary(summary: Record<string, unknown> | null | undefined) {
  if (!summary || typeof summary !== "object") {
    return 0;
  }
  const raw = summary.period_exceptions;
  if (!raw || typeof raw !== "object") {
    return 0;
  }
  const count = (raw as Record<string, unknown>).count;
  return typeof count === "number" ? count : 0;
}

export default function ApprovalsPage() {
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
  const [status, setStatus] = useState<string>("pending");
  const [entityType, setEntityType] = useState<string>("all");
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequestRecord | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [comments, setComments] = useState("");
  const queryWorkspaceId = searchParams.get("workspace");
  const queryClientId = searchParams.get("client");
  const queryGstinId = searchParams.get("gstin");
  const queryPeriodId = searchParams.get("period") ?? searchParams.get("compliance_period");

  const filters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      period: selectedPeriodId ?? undefined,
      status: status !== "all" ? status : undefined,
      entity_type: entityType !== "all" ? entityType : undefined,
    }),
    [selectedWorkspaceId, selectedClientId, selectedPeriodId, status, entityType],
  );

  const approvalsQuery = useApprovalsQuery(filters);
  const returnsQuery = useReturnsQuery({
    workspace: selectedWorkspaceId ?? undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
  });
  const approveMutation = useApproveApprovalMutation(filters);
  const rejectMutation = useRejectApprovalMutation(filters);
  const cancelMutation = useCancelApprovalMutation(filters);
  const approvals = approvalsQuery.data?.items ?? [];
  const pendingApprovals = approvals.filter((item) => item.status === "pending");
  const returnsById = useMemo(
    () => new Map((returnsQuery.data?.items ?? []).map((item) => [item.id, item])),
    [returnsQuery.data?.items],
  );
  const approvalPeriodExceptionCount = useMemo(
    () =>
      approvals.reduce((total, approval) => {
        if (approval.entity_type !== "return_preparation") {
          return total;
        }
        return total + getPeriodExceptionCountFromSummary(returnsById.get(approval.entity_id)?.summary_snapshot);
      }, 0),
    [approvals, returnsById],
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

  const handleAction = async () => {
    if (!selectedApproval || !actionType) return;
    try {
      if (actionType === "approve") {
        await approveMutation.mutateAsync({ approvalId: selectedApproval.id, comments });
      } else if (actionType === "reject") {
        await rejectMutation.mutateAsync({ approvalId: selectedApproval.id, comments });
      } else {
        await cancelMutation.mutateAsync({ approvalId: selectedApproval.id, comments });
      }
      toast.success(`Approval request ${actionType}d.`);
      setSelectedApproval(null);
      setActionType(null);
      setComments("");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Manage reviewer sign-off, decision history, and controlled monthly approvals before filing."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Pending" value={String(pendingApprovals.length)} detail="Open approval requests awaiting reviewer action." tone="warning" />
        <StatCard label="Approved" value={String(approvals.filter((item) => item.status === "approved").length)} detail="Requests cleared through the control workflow." tone="success" />
        <StatCard
          label="Period exceptions"
          value={String(approvalPeriodExceptionCount)}
          detail="Out-of-period source exceptions linked to return approvals in this queue."
          tone="danger"
        />
      </div>

      <SectionCard title="Approval filters" description="Filter the queue by workflow state and work item type.">
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => <SelectItem key={option} value={option}>{option.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Work item type" /></SelectTrigger>
            <SelectContent>
              {entityOptions.map((option) => <SelectItem key={option} value={option}>{option.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard title="Approval queue" description="Pending approvals and decision history for the selected monthly workspace context.">
        {!selectedWorkspaceId ? (
          <EmptyState title="Select a workspace first" description="Choose a workspace from the topbar to load approval requests." />
        ) : approvalsQuery.isLoading ? (
          <LoadingState message="Loading approval queue..." />
        ) : approvalsQuery.isError ? (
          <ErrorState description={getErrorMessage(approvalsQuery.error)} />
        ) : approvals.length > 0 ? (
          <div className="space-y-4">
            {approvalPeriodExceptionCount > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                {approvalPeriodExceptionCount} period exception{approvalPeriodExceptionCount === 1 ? "" : "s"} {approvalPeriodExceptionCount === 1 ? "is" : "are"} linked to return approvals in this queue. Review those justifications before approving the filing pack.
              </div>
            ) : null}
            <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Work Item</TableHead>
                  <TableHead>Client / Period</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Resolved</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map((approval) => {
                  const preparedReturn = approval.entity_type === "return_preparation" ? returnsById.get(approval.entity_id) : null;
                  const periodExceptionCount = getPeriodExceptionCountFromSummary(preparedReturn?.summary_snapshot);
                  return (
                    <TableRow key={approval.id}>
                      <TableCell>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{approval.entity_type.replace(/_/g, " ")}</p>
                            {periodExceptionCount > 0 ? (
                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                                {periodExceptionCount} period exception{periodExceptionCount === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">{approval.entity_id.slice(0, 8)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm text-slate-900">{approval.client_name ?? "Unknown client"}</p>
                          <p className="text-xs text-slate-500">{approval.compliance_period_label ?? "No period"}</p>
                        </div>
                      </TableCell>
                      <TableCell>{approval.requested_to_name ?? "Unassigned"}</TableCell>
                      <TableCell><StatusBadge label={approval.status} variant={statusVariant(approval.status)} /></TableCell>
                      <TableCell>{formatDateTime(approval.created_at)}</TableCell>
                      <TableCell>{formatDateTime(approval.resolved_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setSelectedApproval(approval); setActionType("approve"); }} disabled={approval.status !== "pending"}>
                            <ActionLabel kind="approve" label="Approve" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setSelectedApproval(approval); setActionType("reject"); }} disabled={approval.status !== "pending"}>
                            <ActionLabel kind="reject" label="Reject" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedApproval(approval); setActionType("cancel"); }} disabled={approval.status !== "pending"}>
                            <ActionLabel kind="cancel" label="Cancel" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </div>
        ) : (
          <EmptyState title="No approvals found" description="Approval requests will appear here when returns or other entities are sent for review." />
        )}
      </SectionCard>

      <Dialog open={Boolean(selectedApproval && actionType)} onOpenChange={(open) => !open && (setSelectedApproval(null), setActionType(null), setComments(""))}>
        <AppModalContent size="md">
          <AppModalHeader
            title={actionType ? `${actionType[0].toUpperCase()}${actionType.slice(1)} approval request` : "Approval action"}
            description="Add remarks for the review trail before you confirm this approval action."
          />
          <AppModalBody>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Work item type</Label>
                <Input value={selectedApproval?.entity_type.replace(/_/g, " ") ?? ""} disabled className="h-11 bg-slate-50" />
              </div>
              {selectedApproval?.entity_type === "return_preparation" && getPeriodExceptionCountFromSummary(returnsById.get(selectedApproval.entity_id)?.summary_snapshot) > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                  This return includes {getPeriodExceptionCountFromSummary(returnsById.get(selectedApproval.entity_id)?.summary_snapshot)} source transaction(s) accepted under a period exception. Review the justification before confirming this approval action.
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="approval-comments">Review remarks</Label>
                <Textarea
                  id="approval-comments"
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                  placeholder="Add review remarks, filing comments, or rejection reason..."
                  className="min-h-32 bg-slate-50"
                />
              </div>
            </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">
              {selectedApproval?.client_name ?? "Selected client"}{selectedApproval?.compliance_period_label ? ` • ${selectedApproval.compliance_period_label}` : ""}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => { setSelectedApproval(null); setActionType(null); setComments(""); }}>
                <ActionLabel kind="cancel" label="Cancel" />
              </Button>
              <Button onClick={handleAction} disabled={approveMutation.isPending || rejectMutation.isPending || cancelMutation.isPending}>
              {approveMutation.isPending || rejectMutation.isPending || cancelMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ActionLabel kind="confirm" label="Confirm" />}
              </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>
    </div>
  );
}
