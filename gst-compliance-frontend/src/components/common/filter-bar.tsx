import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function FilterBar({
  children,
  trailing,
  className,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "filter-panel flex flex-col gap-4 px-5 py-[1.125rem] lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="flex-1 space-y-2.5">
        <p className="shell-section-heading">Page controls</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>
      </div>
      {trailing ? <div className="flex items-center gap-2 lg:pb-0.5">{trailing}</div> : null}
    </div>
  );
}
