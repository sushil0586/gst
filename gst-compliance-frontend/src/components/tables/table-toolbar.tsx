import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function TableToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("table-toolbar", className)}>
      {children}
    </div>
  );
}
