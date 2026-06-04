import type { DonutDatum, VendorMismatch } from "@/types";

export const mismatchBreakdown: DonutDatum[] = [
  { name: "Matched", value: 142, color: "#4f46e5" },
  { name: "Partial Match", value: 34, color: "#7c3aed" },
  { name: "Missing in 2B", value: 18, color: "#f59e0b" },
  { name: "Missing in Books", value: 11, color: "#ef4444" },
  { name: "Tax Difference", value: 6, color: "#10b981" },
];

export const topMismatchVendors: VendorMismatch[] = [
  {
    vendor: "Sapphire Components LLP",
    gstin: "29AAKCS5522L1ZQ",
    issue: "Missing in 2B",
    taxDifference: "Rs. 1,24,500",
    status: "Open",
    assignedTo: "Meera Das",
  },
  {
    vendor: "Aurum Packaging Co.",
    gstin: "27AABCA9988J1Z3",
    issue: "Tax Difference",
    taxDifference: "Rs. 86,240",
    status: "In Review",
    assignedTo: "Vikram Nair",
  },
  {
    vendor: "Northline Logistics",
    gstin: "24AADCN4567R1ZX",
    issue: "Partial Match",
    taxDifference: "Rs. 51,880",
    status: "Resolved",
    assignedTo: "Neha Shah",
  },
];
