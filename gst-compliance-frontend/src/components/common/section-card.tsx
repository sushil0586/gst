import type { ReactNode } from "react";

import { typography } from "@/design-system";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  variant = "default",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "default" | "soft";
}) {
  const cardClassName = variant === "soft" ? "panel-card-soft" : "panel-card";

  return (
    <Card className={cn(cardClassName, "py-0", className)}>
      <CardHeader className="border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-[1.125rem] lg:px-6 lg:py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className={typography.sectionTitle}>{title}</CardTitle>
            {description ? <CardDescription className={cn("mt-1", typography.bodyCompact)}>{description}</CardDescription> : null}
          </div>
          {action ? <div className="min-w-0 sm:shrink-0">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="px-4 py-4 sm:px-6 sm:py-5 lg:py-[1.375rem]">{children}</CardContent>
    </Card>
  );
}
