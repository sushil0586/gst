"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Menu, PanelTop, SlidersHorizontal } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/status/status-badge";
import { useSession } from "@/lib/query/session-provider";
import { initialsFromName } from "@/lib/utils/formatters";
import { useWorkspaceContext } from "@/store/workspace-context";

function toTitle(segment: string) {
  return segment
    .replace(/-/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function toPageTitle(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "Dashboard";
  }

  return toTitle(segments[segments.length - 1] ?? "Dashboard");
}

function CompactContextSelectors({
  className,
  showLabels = false,
}: {
  className?: string;
  showLabels?: boolean;
}) {
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

  return (
    <div className={className}>
      <div>
        {showLabels ? <span className="field-label">Workspace</span> : null}
        <Select
          value={selectedWorkspaceId}
          onValueChange={(value) => {
            setSelectedWorkspaceId(value);
          }}
        >
          <SelectTrigger className="topbar-select min-w-[9rem]">
            <SelectValue placeholder="Workspace" />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        {showLabels ? <span className="field-label">Client</span> : null}
        <Select
          value={selectedClientId}
          onValueChange={(value) => {
            setSelectedClientId(value);
          }}
        >
          <SelectTrigger className="topbar-select min-w-[9rem]">
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.legal_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        {showLabels ? <span className="field-label">GSTIN</span> : null}
        <Select
          value={selectedGstinId}
          onValueChange={(value) => {
            setSelectedGstinId(value);
          }}
        >
          <SelectTrigger className="topbar-select min-w-[9.5rem]">
            <SelectValue placeholder="GSTIN" />
          </SelectTrigger>
          <SelectContent>
            {gstins.map((gstin) => (
              <SelectItem key={gstin.id} value={gstin.id}>
                {gstin.gstin}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        {showLabels ? <span className="field-label">Compliance Period</span> : null}
        <Select
          value={selectedPeriodId}
          onValueChange={(value) => {
            setSelectedPeriodId(value);
          }}
        >
          <SelectTrigger className="topbar-select min-w-[8.5rem]">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            {periods.map((period) => (
              <SelectItem key={period.id} value={period.id}>
                {period.period}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function AppTopbar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const { user, session, logout } = useSession();
  const { selectedPeriod } = useWorkspaceContext();
  const [contextOpen, setContextOpen] = useState(false);

  const breadcrumbParts = pathname.split("/").filter(Boolean);
  const pageTitle = toPageTitle(pathname);

  return (
    <>
      <header className="sticky top-0 z-30 px-4 pt-3 lg:px-8 xl:px-10">
        <div className="topbar-shell relative min-h-[60px] px-3 py-2 lg:px-4">
          <div className="topbar-accent pointer-events-none absolute inset-x-5 top-0 h-px opacity-90 lg:inset-x-6" />
          <div className="flex min-h-11 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="outline" size="icon-sm" className="bg-white lg:hidden" onClick={onMenuClick}>
                <Menu className="size-4" />
              </Button>

              <div className="min-w-0">
                <div className="topbar-kicker hidden items-center gap-1 sm:flex">
                  <Link href="/dashboard" className="transition hover:text-slate-700">
                    Home
                  </Link>
                  {breadcrumbParts.map((part, index) => {
                    const href = `/${breadcrumbParts.slice(0, index + 1).join("/")}`;
                    const label = part.startsWith("[") ? part : toTitle(part);

                    return (
                      <div key={href} className="flex items-center gap-1">
                        <ChevronRight className="size-3 text-slate-400" />
                        <Link href={href} className="truncate transition hover:text-slate-700">
                          {label}
                        </Link>
                      </div>
                    );
                  })}
                </div>
                <h1 className="topbar-title truncate">
                  {pageTitle}
                </h1>
              </div>
            </div>

            <div className="hidden flex-1 justify-center xl:flex">
              <CompactContextSelectors className="flex flex-wrap items-center gap-2" />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="topbar-utility xl:hidden"
                onClick={() => setContextOpen(true)}
              >
                <SlidersHorizontal className="size-3.5" />
                Context
              </Button>

              {selectedPeriod ? (
                <StatusBadge
                  label={selectedPeriod.is_locked ? "Period Locked" : "Period Open"}
                  variant={selectedPeriod.is_locked ? "danger" : "success"}
                />
              ) : null}

              <Button variant="outline" size="icon-sm" className="topbar-utility relative" asChild>
                <Link href="/notices">
                  <Bell className="size-4" />
                  <span className="absolute right-2 top-2 size-2 rounded-full bg-rose-500 ring-2 ring-white" />
                  <span className="sr-only">Notifications</span>
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="topbar-utility flex items-center gap-2 rounded-full border px-2 py-1.5 transition hover:border-slate-300">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-[linear-gradient(135deg,#dbeafe,#e0e7ff)] text-xs font-semibold text-indigo-700">
                        {initialsFromName(user?.full_name ?? "Ananya Rao")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden text-left md:block">
                      <p className="max-w-[14ch] truncate text-sm font-medium text-slate-900">
                        {user?.full_name ?? "Ananya Rao"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {session?.default_workspace?.role ?? "Owner"}
                      </p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Workspace Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Profile settings</DropdownMenuItem>
                  <DropdownMenuItem>Notification preferences</DropdownMenuItem>
                  <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <Sheet open={contextOpen} onOpenChange={setContextOpen}>
        <SheetContent side="right" className="w-full border-l border-slate-200 bg-white p-0 shadow-xl sm:max-w-md">
          <SheetHeader className="border-b border-slate-200 px-5 py-4">
            <SheetTitle className="flex items-center gap-2">
              <PanelTop className="size-4 text-slate-500" />
              Context
            </SheetTitle>
            <SheetDescription>
              Update workspace, client, GSTIN, and compliance period without leaving the current page.
            </SheetDescription>
          </SheetHeader>

          <div className="px-5 py-5">
            <CompactContextSelectors
              className="grid gap-4"
              showLabels
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
