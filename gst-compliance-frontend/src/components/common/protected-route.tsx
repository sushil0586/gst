"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import { LoadingState } from "@/components/common/loading-state";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useSession();
  const { requiresOnboarding } = useWorkspaceContext();
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (isMounted && !isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, isMounted, router]);

  useEffect(() => {
    if (isMounted && !isLoading && isAuthenticated && requiresOnboarding && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [isAuthenticated, isLoading, isMounted, pathname, requiresOnboarding, router]);

  if (!isMounted || isLoading) {
    return (
      <div className="p-6">
        <LoadingState message="Loading your compliance workspace..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
