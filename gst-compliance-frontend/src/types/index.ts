import type { LucideIcon } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export type Workspace = {
  id: string;
  name: string;
  organizationName: string;
  role: string;
};

export type Client = {
  id: string;
  name: string;
  code: string;
  industry: string;
  workspaceId: string;
  owner: string;
  activeIssues: number;
  filingStatus: "On Track" | "At Risk" | "Attention";
};

export type GSTINRecord = {
  id: string;
  clientId: string;
  gstin: string;
  registrationType: string;
  state: string;
  status: "Active" | "Suspended" | "Pending";
};

export type CompliancePeriod = {
  id: string;
  clientId: string;
  gstinId: string;
  label: string;
  filingFrequency: string;
  dueDate: string;
  status: "On Track" | "Needs Review" | "Filed" | "Blocked";
};

export type DashboardMetric = {
  label: string;
  value: string;
  tone: "primary" | "warning" | "success" | "danger";
  detail: string;
};

export type WorkflowStep = {
  label: string;
  status: "complete" | "current" | "upcoming";
};

export type ActivityItem = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  tone: "primary" | "success" | "warning";
};

export type DonutDatum = {
  name: string;
  value: number;
  color: string;
};

export type VendorMismatch = {
  vendor: string;
  gstin: string;
  issue: string;
  taxDifference: string;
  status: "Open" | "In Review" | "Resolved";
  assignedTo: string;
};

export type NoticeRecord = {
  id: string;
  reference: string;
  clientName: string;
  status: "Open" | "Responded" | "Escalated";
  dueDate: string;
};

export type AuditEvent = {
  id: string;
  title: string;
  actor: string;
  at: string;
  description: string;
};

export type PermissionCode =
  | "view_client"
  | "manage_client"
  | "manage_gstin"
  | "import_data"
  | "run_reconciliation"
  | "prepare_return"
  | "approve_return"
  | "file_return"
  | "manage_users"
  | "view_audit_log"
  | "manage_settings";
