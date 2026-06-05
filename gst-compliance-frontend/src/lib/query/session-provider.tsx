"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { authService } from "@/lib/auth/auth-service";
import { queryKeys } from "@/lib/query/query-keys";
import type { SessionPayload } from "@/types/api";

const WORKSPACE_STORAGE_KEYS = [
  "gst:selected-workspace-id",
  "gst:selected-client-id",
  "gst:selected-gstin-id",
  "gst:selected-period-id",
];

type SessionContextValue = {
  session: SessionPayload | null;
  user: SessionPayload["user"] | null;
  permissions: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: authService.getCurrentUser,
    retry: false,
  });

  const value = useMemo<SessionContextValue>(
    () => ({
      session: sessionQuery.data ?? null,
      user: sessionQuery.data?.user ?? null,
      permissions: sessionQuery.data?.permissions_summary.codes ?? [],
      isLoading: sessionQuery.isLoading,
      isAuthenticated: Boolean(sessionQuery.data),
      logout: async () => {
        await authService.logout();
        queryClient.cancelQueries();
        queryClient.setQueryData(queryKeys.auth.me, null);
        queryClient.removeQueries({ queryKey: queryKeys.auth.me });
        queryClient.clear();
        if (typeof window !== "undefined") {
          for (const key of WORKSPACE_STORAGE_KEYS) {
            window.localStorage.removeItem(key);
          }
        }
        router.replace("/login");
        router.refresh();
      },
    }),
    [queryClient, router, sessionQuery.data, sessionQuery.isLoading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider.");
  }
  return context;
}
