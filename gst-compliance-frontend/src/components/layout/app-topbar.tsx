"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronRight, Menu, PanelTop, Search, SlidersHorizontal } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/status/status-badge";
import { hasPermission, permissions } from "@/lib/permissions";
import { useSession } from "@/lib/query/session-provider";
import { initialsFromName } from "@/lib/utils/formatters";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { ClientRecord } from "@/types/api";

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

function matchesClientSearch(client: ClientRecord, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return [
    client.legal_name,
    client.trade_name,
    client.client_code,
    client.pan,
    client.email,
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(query));
}

function ClientContextPicker({
  clients,
  selectedClientId,
  onSelectClient,
  forceOpenSignal,
}: {
  clients: ClientRecord[];
  selectedClientId?: string;
  onSelectClient: (id: string) => void;
  forceOpenSignal: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const filteredClients = useMemo(
    () => clients.filter((client) => matchesClientSearch(client, query)),
    [clients, query],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (forceOpenSignal > 0) {
      setOpen(true);
    }
  }, [forceOpenSignal]);

  const disabled = clients.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="topbar-select min-w-[13rem] justify-between gap-2 rounded-full border-slate-200/80 px-3 font-normal text-slate-700"
          disabled={disabled}
        >
          <span className="truncate">
            {selectedClient?.legal_name ?? "Client"}
          </span>
          <span className="flex items-center gap-2 text-slate-400">
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] md:inline">
              Ctrl/Cmd+K
            </span>
            <Search className="size-3.5 shrink-0" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[24rem] rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.28)]">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Find client</p>
            <p className="text-xs text-slate-500">
              Search by legal name, trade name, client code, PAN, or email.
            </p>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search client"
            autoFocus
          />
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {filteredClients.length > 0 ? (
              filteredClients.map((client) => {
                const isSelected = client.id === selectedClientId;
                return (
                  <div
                    key={client.id}
                    className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-2 py-2"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-start rounded-xl px-2 py-1 text-left transition hover:bg-white"
                      onClick={() => {
                        onSelectClient(client.id);
                        setOpen(false);
                      }}
                    >
                      <span className="truncate text-sm font-medium text-slate-900">
                        {client.legal_name}
                      </span>
                      <span className="truncate text-xs text-slate-500">
                        {client.client_code} • {client.pan}
                      </span>
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant={isSelected ? "secondary" : "ghost"}
                      onClick={() => {
                        onSelectClient(client.id);
                        router.push(`/clients/${client.id}`);
                        setOpen(false);
                      }}
                    >
                      Open
                    </Button>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                No matching clients found in this workspace.
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CompactContextSelectors({
  className,
  showLabels = false,
  clientSearchSignal = 0,
}: {
  className?: string;
  showLabels?: boolean;
  clientSearchSignal?: number;
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
        <ClientContextPicker
          clients={clients}
          selectedClientId={selectedClientId}
          onSelectClient={setSelectedClientId}
          forceOpenSignal={clientSearchSignal}
        />
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
  const { user, session, permissions: sessionPermissions, logout } = useSession();
  const { selectedPeriod, clients } = useWorkspaceContext();
  const [contextOpen, setContextOpen] = useState(false);
  const [clientSearchSignal, setClientSearchSignal] = useState(0);
  const canManageWorkspaces = hasPermission(sessionPermissions, permissions.manageSettings)
    || hasPermission(sessionPermissions, permissions.manageUsers)
    || Boolean(session?.is_platform_admin);

  const breadcrumbParts = pathname.split("/").filter(Boolean);
  const pageTitle = toPageTitle(pathname);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (
          target.isContentEditable
          || target.tagName === "INPUT"
          || target.tagName === "TEXTAREA"
          || target.tagName === "SELECT"
        )
      ) {
        return;
      }

      const isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const isSlashShortcut = !event.metaKey && !event.ctrlKey && !event.altKey && event.key === "/";

      if (!isSearchShortcut && !isSlashShortcut) {
        return;
      }

      if (clients.length === 0) {
        return;
      }

      event.preventDefault();
      setClientSearchSignal((value) => value + 1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clients.length]);

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
              <CompactContextSelectors
                className="flex flex-wrap items-center gap-2"
                clientSearchSignal={clientSearchSignal}
              />
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
                  {canManageWorkspaces ? (
                    <DropdownMenuItem asChild>
                      <Link href="/settings/workspaces">Workspace management</Link>
                    </DropdownMenuItem>
                  ) : null}
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
              clientSearchSignal={clientSearchSignal}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
