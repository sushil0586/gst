import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ProtectedRoute } from "@/components/common/protected-route";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <DashboardShell>{children}</DashboardShell>
    </ProtectedRoute>
  );
}
