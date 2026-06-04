import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function TableCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("table-shell-card", className)}>{children}</div>;
}
