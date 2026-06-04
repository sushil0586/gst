import type { ActivityItem, AuditEvent } from "@/types";

export const recentActivities: ActivityItem[] = [
  {
    id: "activity-1",
    title: "Imported purchase register",
    description: "2,184 rows uploaded for Orion Retail Private Limited.",
    timestamp: "15 minutes ago",
    tone: "primary",
  },
  {
    id: "activity-2",
    title: "Reconciliation completed",
    description: "2B comparison closed with 24 outstanding mismatches.",
    timestamp: "48 minutes ago",
    tone: "success",
  },
  {
    id: "activity-3",
    title: "Mismatch assigned",
    description: "Tax difference issue assigned to Meera for vendor follow-up.",
    timestamp: "1 hour ago",
    tone: "warning",
  },
  {
    id: "activity-4",
    title: "GSTR-1 draft prepared",
    description: "Draft package generated for April 2026 filing cycle.",
    timestamp: "2 hours ago",
    tone: "primary",
  },
  {
    id: "activity-5",
    title: "Approval pending",
    description: "Return package is waiting on reviewer confirmation.",
    timestamp: "3 hours ago",
    tone: "warning",
  },
];

export const auditEvents: AuditEvent[] = [
  {
    id: "audit-1",
    title: "Client profile updated",
    actor: "Aditi Menon",
    at: "Today, 11:20 AM",
    description: "Filing owner and escalation recipients were updated.",
  },
  {
    id: "audit-2",
    title: "Return draft generated",
    actor: "GST Bot",
    at: "Today, 10:05 AM",
    description: "Mock return preparation snapshot created for review.",
  },
  {
    id: "audit-3",
    title: "Import batch validated",
    actor: "Rahul Sethi",
    at: "Yesterday, 6:35 PM",
    description: "Purchase register import completed with 7 row warnings.",
  },
];
