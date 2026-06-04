import type { ReactNode } from "react";

import { layouts } from "@/design-system";
import { cn } from "@/lib/utils";

export function DashboardGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(layouts.dashboardGrid, className)}>{children}</div>;
}
