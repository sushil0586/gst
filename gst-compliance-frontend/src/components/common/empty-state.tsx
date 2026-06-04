import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { typography } from "@/design-system";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col items-center justify-center border-dashed border-slate-300 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.9))] px-6 py-12 text-center">
      <div className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200">
        <Inbox className="size-5 text-slate-500" />
      </div>
      <p className={["mt-4", typography.eyebrow].join(" ")}>No records yet</p>
      <h3 className={["mt-2", typography.sectionTitle].join(" ")}>{title}</h3>
      <p className={["mt-2 max-w-md", typography.bodyCompact].join(" ")}>{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
