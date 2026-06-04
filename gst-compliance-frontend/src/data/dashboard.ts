import type { DashboardMetric, WorkflowStep } from "@/types";

export const dashboardMetrics: DashboardMetric[] = [
  {
    label: "Compliance Health",
    value: "78%",
    tone: "primary",
    detail: "Stable performance with action needed on mismatches.",
  },
  {
    label: "Mismatches",
    value: "24",
    tone: "warning",
    detail: "8 high-priority mismatches are awaiting assignment.",
  },
  {
    label: "Open Issues",
    value: "7",
    tone: "danger",
    detail: "Includes notices, filing blockers, and data gaps.",
  },
  {
    label: "Return Status",
    value: "1/2 Filed",
    tone: "success",
    detail: "One return filed and one package under approval.",
  },
];

export const workflowSteps: WorkflowStep[] = [
  { label: "Import", status: "complete" },
  { label: "Reconciliation", status: "complete" },
  { label: "GSTR-1", status: "current" },
  { label: "GSTR-3B", status: "upcoming" },
  { label: "Approval", status: "upcoming" },
  { label: "Filing", status: "upcoming" },
];

export const periodSummary = {
  client: "Orion Retail Private Limited",
  gstin: "29AAACO1234F1Z5",
  period: "April 2026",
  filingFrequency: "Monthly",
  dueDate: "20 May 2026",
  currentStatus: "Needs Review",
};
