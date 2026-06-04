import {
  BellRing,
  Building2,
  ChartColumnBig,
  ClipboardCheck,
  FileClock,
  FileSearch,
  Files,
  LayoutDashboard,
  ShieldAlert,
  ReceiptText,
  ScrollText,
  Settings,
  Users2,
} from "lucide-react";

import type { NavItem } from "@/types";

export const sidebarNavItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Clients", href: "/clients", icon: Users2 },
  { title: "GSTINs", href: "/gstins", icon: Building2 },
  { title: "Compliance Periods", href: "/compliance-periods", icon: FileClock },
  { title: "Imports", href: "/imports", icon: Files },
  { title: "2B Reconciliation", href: "/reconciliation", icon: FileSearch },
  { title: "Returns", href: "/returns", icon: ReceiptText },
  { title: "Operations", href: "/operations", icon: ShieldAlert },
  { title: "Approvals", href: "/approvals", icon: ClipboardCheck },
  { title: "Notices", href: "/notices", icon: BellRing },
  { title: "Reports", href: "/reports", icon: ChartColumnBig },
  { title: "Audit Trail", href: "/audit-trail", icon: ScrollText },
  { title: "Settings", href: "/settings", icon: Settings },
];
