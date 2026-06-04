import { Building2, CircleAlert, FileClock, ShieldAlert } from "lucide-react";

import { SectionCard } from "@/components/common/section-card";
import { typography } from "@/design-system";

const cards = [
  {
    title: "Workspace coverage",
    value: "14 GSTINs",
    detail: "Across 6 active clients this filing month.",
    icon: Building2,
  },
  {
    title: "Pending deadlines",
    value: "3 due soon",
    detail: "Two approvals and one final filing reminder.",
    icon: FileClock,
  },
  {
    title: "Escalations",
    value: "2 unresolved",
    detail: "Tax difference disputes still need follow-up.",
    icon: ShieldAlert,
  },
  {
    title: "Exceptions",
    value: "7 open",
    detail: "Data quality and notice response related items.",
    icon: CircleAlert,
  },
];

export function OverviewGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <SectionCard key={card.title} title={card.title}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-heading-premium text-2xl font-semibold">{card.value}</p>
              <p className={["mt-2", typography.bodyCompact].join(" ")}>{card.detail}</p>
            </div>
            <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
              <card.icon className="size-5" />
            </div>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
