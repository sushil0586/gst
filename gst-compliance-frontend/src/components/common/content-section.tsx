import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ContentSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("space-y-4 lg:space-y-5", className)}>{children}</section>;
}
