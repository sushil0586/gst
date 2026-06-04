import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

import { typography } from "@/design-system";
import { cn } from "@/lib/utils";

const toneClasses = {
  primary: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  danger: "bg-rose-50 text-rose-700 ring-rose-100",
};

export function StatCard({
  label,
  value,
  detail,
  tone,
  icon: Icon = ArrowUpRight,
  variant = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone: keyof typeof toneClasses;
  icon?: LucideIcon;
  variant?: "default" | "soft";
}) {
  return (
    <div className={cn(variant === "soft" ? "metric-tile-soft" : "metric-tile", "h-full")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium tracking-[-0.01em] text-slate-500">{label}</p>
          <p className={cn("mt-3 break-words text-[2rem] lg:text-[2.2rem]", typography.metricValue)}>{value}</p>
        </div>
        <div className={cn("metric-icon-wrap", toneClasses[tone])}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className={cn("mt-3", typography.bodyCompact)}>{detail}</p>
    </div>
  );
}
