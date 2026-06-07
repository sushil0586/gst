"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";

import { sidebarNavItems } from "@/lib/constants/navigation";
import { cn } from "@/lib/utils";

const navSections = [
  {
    label: "Workspace",
    items: ["/dashboard", "/clients", "/gstins", "/compliance-periods"],
  },
  {
    label: "Execution",
    items: ["/imports", "/reconciliation", "/returns", "/operations", "/approvals"],
  },
  {
    label: "Controls",
    items: ["/notices", "/reports", "/audit-trail", "/settings"],
  },
];

function SidebarTooltip({
  label,
  visible,
}: {
  label: string;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded-xl border border-slate-200/85 bg-white px-2.5 py-1.5 text-xs font-semibold tracking-[-0.01em] text-slate-700 opacity-0 shadow-[0_14px_28px_-20px_rgba(15,23,42,0.24)] transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-within:translate-x-0.5 group-focus-within:opacity-100">
      {label}
    </span>
  );
}

export function AppSidebar({
  collapsed = false,
  pinned = false,
  onNavigate,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  pinned?: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const ToggleIcon = pinned ? ChevronLeft : ChevronRight;

  return (
    <aside className={cn("sidebar-shell flex h-full w-full flex-col rounded-[30px] px-4 py-5 transition-[width,padding] duration-200", collapsed && "px-3 py-4")}>
      <div className={cn("mb-8 flex items-center gap-3", collapsed ? "justify-center" : "justify-between")}>
        <Link
          href="/dashboard"
          className={cn(
            "sidebar-brand-card flex min-w-0 items-center gap-3 rounded-2xl px-3 py-3 transition-all",
            collapsed ? "w-full justify-center px-2.5" : "flex-1",
          )}
        >
          <div className="flex size-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(79,70,229,0.22),rgba(56,189,248,0.16))] ring-1 ring-indigo-200/80 shadow-inner">
            <ShieldCheck className="size-5 text-indigo-700" />
          </div>
          <div className={cn("min-w-0", collapsed && "hidden")}>
            <p className="text-[15px] font-semibold tracking-tight text-slate-950">GST Compliance</p>
            <p className="text-xs text-slate-500">Operations Console</p>
          </div>
        </Link>
        {onToggleCollapse ? (
          <button
            type="button"
            className={cn("sidebar-button flex size-10 shrink-0 items-center justify-center rounded-2xl", collapsed && "hidden")}
            onClick={onToggleCollapse}
            aria-label={pinned ? "Collapse sidebar" : "Pin sidebar open"}
          >
            <ToggleIcon className="size-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-5">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className={cn("mb-2 px-2", collapsed && "hidden")}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                {section.label}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {sidebarNavItems
                .filter((item) => section.items.includes(item.href))
                .map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));

                  return (
                    <div key={item.href} className="group relative">
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn("sidebar-link", collapsed && "justify-center px-2.5", isActive && "sidebar-link-active")}
                        aria-label={collapsed ? item.title : undefined}
                      >
                        <item.icon className="size-4" />
                        <span className={cn("truncate", collapsed && "hidden")}>{item.title}</span>
                      </Link>
                      <SidebarTooltip label={item.title} visible={collapsed} />
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>

      <div className={cn("sidebar-panel mt-6 rounded-[24px] px-4 py-4", collapsed && "px-3 py-3 text-center")}>
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400", collapsed && "hidden")}>
          Current Workspace
        </p>
        <p className={cn("mt-3 text-sm font-semibold text-slate-900", collapsed && "mt-0 text-xs")}>
          {collapsed ? "DW" : "Demo Workspace"}
        </p>
        <p className={cn("mt-1 text-xs text-slate-500", collapsed && "hidden")}>demo@example.com</p>
        <p className={cn("mt-3 text-xs leading-5 text-slate-500", collapsed && "hidden")}>
          Central controls, filing workflows, and audit surfaces stay available from this shell.
        </p>
      </div>

      {onToggleCollapse ? (
        <div className="group relative">
          <button
            type="button"
            className={cn("sidebar-button mt-3 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium", collapsed && "px-0")}
            onClick={onToggleCollapse}
            aria-label={pinned ? "Collapse sidebar" : "Pin sidebar open"}
          >
            <ToggleIcon className="size-4" />
            <span className={cn(collapsed && "hidden")}>{pinned ? "Collapse" : "Pin open"}</span>
          </button>
          <SidebarTooltip label={pinned ? "Collapse sidebar" : "Pin sidebar open"} visible={collapsed} />
        </div>
      ) : null}
    </aside>
  );
}
