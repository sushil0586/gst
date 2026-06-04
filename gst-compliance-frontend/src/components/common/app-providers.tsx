"use client";

import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/lib/query/query-provider";
import { SessionProvider } from "@/lib/query/session-provider";
import { WorkspaceContextProvider } from "@/store/workspace-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SessionProvider>
        <WorkspaceContextProvider>
          {children}
          <Toaster richColors position="top-right" closeButton />
        </WorkspaceContextProvider>
      </SessionProvider>
    </QueryProvider>
  );
}
