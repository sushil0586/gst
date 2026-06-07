"use client";

import { useState } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PageContainer } from "@/components/common/page-container";
import { cn } from "@/lib/utils";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("gst-sidebar-pinned") === "true";
  });
  const [sidebarHovered, setSidebarHovered] = useState(false);

  const toggleSidebar = () => {
    setSidebarPinned((current) => {
      const next = !current;
      window.localStorage.setItem("gst-sidebar-pinned", String(next));
      return next;
    });
  };
  const desktopSidebarExpanded = sidebarPinned || sidebarHovered;

  return (
    <div className="app-shell-bg relative min-h-screen">
      <div className="relative z-10 flex min-h-screen">
        <div className="hidden w-28 shrink-0 lg:block">
          <div
            className={cn(
              "fixed inset-y-0 z-40 px-4 py-5 transition-[width] duration-200",
              desktopSidebarExpanded ? "w-76" : "w-28",
            )}
            onMouseEnter={() => setSidebarHovered(true)}
            onMouseLeave={() => setSidebarHovered(false)}
          >
            <AppSidebar
              collapsed={!desktopSidebarExpanded}
              pinned={sidebarPinned}
              onToggleCollapse={toggleSidebar}
            />
          </div>
        </div>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            className={cn(
              "border-none bg-transparent p-4 shadow-none transition-[width] duration-200",
              "w-76",
            )}
          >
            <AppSidebar
              collapsed={false}
              pinned={false}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-0">
          <AppTopbar onMenuClick={() => setMobileNavOpen(true)} />
          <main className="flex-1 pb-6">
            <PageContainer className="pt-3 lg:pt-4">{children}</PageContainer>
          </main>
          <footer className="px-4 pb-6 lg:px-8 xl:px-10">
            <div className="flex flex-col gap-3 rounded-[24px] border border-white/75 bg-white/70 px-5 py-4 text-xs text-slate-500 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
              <p>© 2026 GST Compliance Workspace. All rights reserved.</p>
              <div className="flex items-center gap-2">
                <span>v2.0.0</span>
                <span className="size-1 rounded-full bg-slate-300" />
                <span>Operations Console</span>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
