import type { NoticeRecord } from "@/types";

export const notices = [
  {
    id: "notice-1",
    reference: "ASMT-10/2026/1184",
    clientName: "Orion Retail Private Limited",
    status: "Open",
    dueDate: "2026-05-29",
  },
  {
    id: "notice-2",
    reference: "DRC-01A/2026/8821",
    clientName: "BluePeak Manufacturing LLP",
    status: "Responded",
    dueDate: "2026-05-31",
  },
] satisfies NoticeRecord[];
