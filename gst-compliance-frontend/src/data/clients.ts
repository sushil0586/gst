import type { Client } from "@/types";

export const clients = [
  {
    id: "client-1",
    name: "Orion Retail Private Limited",
    code: "ORION-001",
    industry: "Retail",
    workspaceId: "ws-1",
    owner: "Aditi Menon",
    activeIssues: 9,
    filingStatus: "At Risk",
  },
  {
    id: "client-2",
    name: "BluePeak Manufacturing LLP",
    code: "BLUE-014",
    industry: "Manufacturing",
    workspaceId: "ws-1",
    owner: "Rahul Sethi",
    activeIssues: 4,
    filingStatus: "On Track",
  },
  {
    id: "client-3",
    name: "Nimbus Digital Services",
    code: "NIMBUS-042",
    industry: "Technology",
    workspaceId: "ws-2",
    owner: "Sakshi Verma",
    activeIssues: 2,
    filingStatus: "On Track",
  },
] satisfies Client[];
