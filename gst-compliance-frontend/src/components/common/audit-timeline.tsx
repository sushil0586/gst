import { format } from "date-fns";

import { auditEvents } from "@/data/activities";
import { typography } from "@/design-system";
import type { ActivitySummaryRecord } from "@/types/api";

type AuditTimelineEntry = {
  id: string;
  title: string;
  actor: string;
  at: string;
  description: string;
};

function toDisplayEvents(events?: ActivitySummaryRecord[]): AuditTimelineEntry[] {
  if (!events?.length) {
    return auditEvents;
  }

  return events.map((event) => ({
    id: event.id,
    title: event.action.replace(/_/g, " "),
    actor: event.actor_name || "System",
    at: format(new Date(event.timestamp), "dd MMM yyyy, h:mm a"),
    description: event.description,
  }));
}

export function AuditTimeline({ events }: { events?: ActivitySummaryRecord[] }) {
  const displayEvents = toDisplayEvents(events);

  return (
    <div className="space-y-4">
      {displayEvents.map((event) => (
        <div key={event.id} className="flex gap-4 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.14)]">
          <div className="flex flex-col items-center">
            <span className="mt-1 size-3 rounded-full bg-indigo-500 ring-4 ring-indigo-100" />
            <span className="mt-2 h-full w-px bg-slate-200" />
          </div>
          <div className="pb-1">
            <p className="text-sm font-semibold tracking-[-0.015em] text-slate-900">{event.title}</p>
            <p className={["mt-1", typography.eyebrow].join(" ")}>
              {event.actor} • {event.at}
            </p>
            <p className={["mt-2", typography.bodyCompact].join(" ")}>{event.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
