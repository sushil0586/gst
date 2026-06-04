import type { CompliancePeriod } from "@/types";

export const compliancePeriods: CompliancePeriod[] = [
  {
    id: "period-1",
    clientId: "client-1",
    gstinId: "gstin-1",
    label: "April 2026",
    filingFrequency: "Monthly",
    dueDate: "2026-05-20",
    status: "Needs Review",
  },
  {
    id: "period-2",
    clientId: "client-1",
    gstinId: "gstin-2",
    label: "April 2026",
    filingFrequency: "Monthly",
    dueDate: "2026-05-20",
    status: "On Track",
  },
  {
    id: "period-3",
    clientId: "client-2",
    gstinId: "gstin-3",
    label: "April 2026",
    filingFrequency: "Monthly",
    dueDate: "2026-05-20",
    status: "Filed",
  },
];
