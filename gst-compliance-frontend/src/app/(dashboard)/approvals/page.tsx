"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
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

export default function ApprovalsPage() {
  const { selectedWorkspaceId, selectedClientId, selectedPeriodId } = useWorkspaceContext();
  const [status, setStatus] = useState<string>("pending");
  const [entityType, setEntityType] = useState<string>("all");
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequestRecord | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [comments, setComments] = useState("");

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
  const approveMutation = useApproveApprovalMutation(filters);
  const rejectMutation = useRejectApprovalMutation(filters);
  const cancelMutation = useCancelApprovalMutation(filters);
  const approvals = approvalsQuery.data?.items ?? [];
  const pendingApprovals = approvals.filter((item) => item.status === "pending");

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
        <StatCard label="Rejected / Cancelled" value={String(approvals.filter((item) => item.status === "rejected" || item.status === "cancelled").length)} detail="Requests that need rework or were intentionally closed." tone="danger" />
      </div>

      <SectionCard title="Approval filters" description="Slice the queue by workflow state and entity type.">
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => <SelectItem key={option} value={option}>{option.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="h-10 bg-slate-50"><SelectValue placeholder="Entity type" /></SelectTrigger>
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
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Entity</TableHead>
                  <TableHead>Client / Period</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Resolved</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{approval.entity_type.replace(/_/g, " ")}</p>
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
                ))}
              </TableBody>
            </Table>
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
                <Label>Entity type</Label>
                <Input value={selectedApproval?.entity_type.replace(/_/g, " ") ?? ""} disabled className="h-11 bg-slate-50" />
              </div>
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
