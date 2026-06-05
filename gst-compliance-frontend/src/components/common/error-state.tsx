import { TriangleAlert } from "lucide-react";

import { typography } from "@/design-system";

export function ErrorState({
  title = "We couldn’t load this section",
  description = "Refresh the page or resolve the underlying data issue before continuing.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="surface-card border-rose-200 bg-[linear-gradient(135deg,rgba(255,241,242,0.98),rgba(255,255,255,0.92))] px-5 py-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/80 ring-1 ring-rose-200">
          <TriangleAlert className="size-5 text-rose-600" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-[-0.015em] text-rose-800">{title}</p>
          <p className={["mt-1", typography.bodyCompact, "text-rose-700"].join(" ")}>{description}</p>
        </div>
      </div>
    </div>
  );
}
