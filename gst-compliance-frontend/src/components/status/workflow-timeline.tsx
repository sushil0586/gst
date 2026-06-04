import { CheckCircle2, CircleDashed, Clock3 } from "lucide-react";

import type { WorkflowStep } from "@/types";

const iconByStatus = {
  complete: CheckCircle2,
  current: Clock3,
  upcoming: CircleDashed,
};

const textByStatus = {
  complete: "text-emerald-600",
  current: "text-indigo-600",
  upcoming: "text-slate-400",
};

export function WorkflowTimeline({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-6">
      {steps.map((step, index) => {
        const Icon = iconByStatus[step.status];

        return (
          <div key={step.label} className="relative rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.16)]">
            {index < steps.length - 1 ? (
              <span className="absolute top-1/2 left-full hidden h-px w-3 -translate-y-1/2 bg-slate-200 md:block" />
            ) : null}
            <div className="flex size-10 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200/80">
              <Icon className={`size-5 ${textByStatus[step.status]}`} />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-900">{step.label}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{step.status}</p>
          </div>
        );
      })}
    </div>
  );
}
