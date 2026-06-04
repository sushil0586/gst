import { StatusBadge } from "@/components/status/status-badge";

export function ComplianceStatusBadge({ status }: { status: string }) {
  const normalizedStatus = status.replace(/_/g, " ").toLowerCase();
  const label = status.replace(/_/g, " ");
  const variant =
    normalizedStatus === "filed" || normalizedStatus === "approved" || normalizedStatus === "completed" || normalizedStatus === "processed" || normalizedStatus === "on track" || normalizedStatus === "locked"
      ? "success"
      : normalizedStatus === "needs review" || normalizedStatus === "pending" || normalizedStatus === "ready for review" || normalizedStatus === "validating" || normalizedStatus === "running" || normalizedStatus === "queued"
        ? "warning"
        : normalizedStatus === "blocked" || normalizedStatus === "at risk" || normalizedStatus === "open" || normalizedStatus === "failed" || normalizedStatus === "rejected" || normalizedStatus === "cancelled"
          ? "danger"
          : "primary";

  return <StatusBadge label={label} variant={variant} />;
}
