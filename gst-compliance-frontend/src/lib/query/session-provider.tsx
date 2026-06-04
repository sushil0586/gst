"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { authService } from "@/lib/auth/auth-service";
import { queryKeys } from "@/lib/query/query-keys";
import type { SessionPayload } from "@/types/api";

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
        queryClient.removeQueries({ queryKey: queryKeys.auth.me });
        router.replace("/login");
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
