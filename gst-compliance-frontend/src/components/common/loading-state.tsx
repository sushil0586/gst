import { Loader2 } from "lucide-react";

import { typography } from "@/design-system";

export function LoadingState({ message = "Loading workspace data..." }: { message?: string }) {
  return (
    <div className="surface-card flex items-center gap-4 px-6 py-7">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 ring-1 ring-indigo-100">
        <Loader2 className="size-4 animate-spin text-indigo-600" />
      </div>
      <div>
        <p className="text-sm font-semibold tracking-[-0.015em] text-slate-900">Working on your workspace</p>
        <p className={["mt-1", typography.bodyCompact].join(" ")}>{message}</p>
      </div>
    </div>
  );
}
