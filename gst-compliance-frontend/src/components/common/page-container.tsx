import type { ReactNode } from "react";

import { layouts, spacing } from "@/design-system";
import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(layouts.pageContainer, spacing.pageX, spacing.pageY, className)}>
      {children}
    </div>
  );
}
