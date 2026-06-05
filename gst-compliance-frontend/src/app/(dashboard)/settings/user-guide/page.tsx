"use client";

import Link from "next/link";

import { ActionLabel } from "@/components/common/action-label";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";

const navigationItems = [
  { label: "Dashboard", href: "/dashboard", purpose: "Compliance health, monthly summary, close-manager controls, and automation reporting." },
  { label: "Clients", href: "/clients", purpose: "Create clients and drill into client-level GSTIN and period workspaces." },
  { label: "GSTINs", href: "/gstins", purpose: "Review registrations and GSTIN coverage across the workspace." },
  { label: "Compliance Periods", href: "/compliance-periods", purpose: "Create, lock, unlock, and monitor filing periods." },
  { label: "Imports", href: "/imports", purpose: "Upload source files, manage import templates, and inspect import history and row errors." },
  { label: "2B Reconciliation", href: "/reconciliation", purpose: "Run purchase vs GSTR-2B reconciliation and action mismatch items." },
  { label: "Returns", href: "/returns", purpose: "Prepare GSTR-1 and GSTR-3B, review readiness, and export workbooks." },
  { label: "Approvals", href: "/approvals", purpose: "Review and action approval requests." },
  { label: "Notices", href: "/notices", purpose: "Track notice ownership, deadlines, and response status against the active GSTIN context." },
  { label: "Reports", href: "/reports", purpose: "Review transactions, correct metadata, use bulk remediation, and manage ownership and follow-ups." },
  { label: "Audit Trail", href: "/audit-trail", purpose: "Inspect audit logs and export proof." },
  { label: "Settings", href: "/settings", purpose: "Open team management, pilot readiness, and this guide." },
];

const practicalFlow = [
  {
    title: "1. Set up the filing context",
    detail: "For a new firm, self-register from the login page. For an existing workspace, onboard filers or senior CAs from Settings -> Team management, then create or confirm the client, GSTIN, and compliance period.",
    links: [
      { label: "Open Team Management", href: "/settings/team" },
      { label: "Open Clients", href: "/clients" },
      { label: "Open GSTINs", href: "/gstins" },
      { label: "Open Compliance Periods", href: "/compliance-periods" },
    ],
  },
  {
    title: "2. Upload source files",
    detail: "Upload sales, purchase, and GSTR-2B files. Review failed rows and save import templates where vendor formats vary.",
    links: [{ label: "Open Imports", href: "/imports" }],
  },
  {
    title: "3. Review and correct transactions",
    detail: "Use transaction review, remediation buckets, bulk correction, assignments, and follow-ups to resolve data quality gaps.",
    links: [{ label: "Open Reports", href: "/reports" }],
  },
  {
    title: "4. Run reconciliation",
    detail: "Create the GSTR-2B reconciliation run and action open mismatches or missing rows.",
    links: [{ label: "Open Reconciliation", href: "/reconciliation" }],
  },
  {
    title: "5. Prepare returns",
    detail: "Prepare GSTR-1 and GSTR-3B, check readiness, and export workbooks when the period is ready.",
    links: [{ label: "Open Returns", href: "/returns" }],
  },
  {
    title: "6. Approve, file, and lock",
    detail: "Use approvals, mark returns filed, and lock the period once the monthly cycle is complete.",
    links: [
      { label: "Open Approvals", href: "/approvals" },
      { label: "Open Compliance Periods", href: "/compliance-periods" },
    ],
  },
  {
    title: "7. Review audit and manager controls",
    detail: "Use audit logs and the dashboard close-manager section for proof, follow-up management, digests, and close reporting.",
    links: [
      { label: "Open Dashboard", href: "/dashboard" },
      { label: "Open Audit Trail", href: "/audit-trail" },
    ],
  },
];

const uatPacks = [
  {
    title: "Core filing flow",
    cases: "UAT-001 to UAT-032",
    detail: "Covers login, self-registration, team onboarding, imports, review, reconciliation, returns, approvals, and period locking.",
  },
  {
    title: "Audit and exports",
    cases: "UAT-033 to UAT-038",
    detail: "Covers audit logs, workbook exports, close-manager reporting, digests, and automation reporting.",
  },
  {
    title: "Operational coverage extension",
    cases: "UAT-039 to UAT-040",
    detail: "Covers notice register operations plus settings-based documentation and readiness access.",
  },
];

export default function UserGuidePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="User Guide & UAT"
        description="Practical navigation map, end-to-end workflow, and QA coverage checklist for testing the GST Compliance workspace."
      />

      <SectionCard
        title="Guide documents"
        description="The complete written guide and UAT pack are also stored in the repository for sharing with testers."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">User practical guide</p>
            <p className="mt-1 text-sm text-slate-600">
              End-user walkthrough covering navigation, purpose of each module, and the recommended business workflow.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              <code>docs/user-practical-guide.md</code>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Import scenario packs: <code>docs/import-scenario-bundles.md</code>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">QA UAT pack</p>
            <p className="mt-1 text-sm text-slate-600">
              Manual test cases with expected outcomes for all major Phase 1 workflows and controls.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              <code>docs/qa-uat-cases.md</code>
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Navigation map" description="Use this as the top-level menu reference while testing.">
        <div className="grid gap-4 xl:grid-cols-2">
          {navigationItems.map((item) => (
            <div key={item.href} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.purpose}</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={item.href}>
                  <ActionLabel kind="open" label="Open" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Recommended end-to-end workflow" description="Run the product in this order for the cleanest practical validation.">
        <div className="space-y-4">
          {practicalFlow.map((step) => (
            <div key={step.title} className="rounded-2xl border border-slate-200 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">{step.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{step.detail}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {step.links.map((link) => (
                  <Button key={link.href + link.label} asChild size="sm" variant="outline">
                    <Link href={link.href}>
                      <ActionLabel kind="open" label={link.label} />
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="UAT coverage packs" description="Use these grouped packs to track test progress without losing feature coverage.">
        <div className="grid gap-4 lg:grid-cols-3">
          {uatPacks.map((pack) => (
            <div key={pack.title} className="rounded-2xl border border-slate-200 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">{pack.title}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{pack.cases}</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">{pack.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Important testing reminders" description="These checks help avoid false failures during a manual run.">
        <ul className="space-y-2 text-sm leading-6 text-slate-700">
          <li>Always confirm the topbar context before testing write actions.</li>
          <li>Use self-registration only for creating a new firm/workspace. Existing workspace users should be onboarded from Team management.</li>
          <li>GSTR-1 depends on sales-side data; reconciliation depends on purchase plus GSTR-2B data.</li>
          <li>Locked periods should block imports, reconciliation, return preparation, and transaction edits.</li>
          <li>Client and period drill-down pages are reached from the Clients module, not from the sidebar directly.</li>
          <li>Use Notices as a live register for ownership, due dates, and response status, while keeping detailed legal response handling in your operating process.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild size="sm">
            <Link href="/settings/pilot-readiness">
              <ActionLabel kind="open" label="Open pilot readiness" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard">
              <ActionLabel kind="open" label="Open dashboard" />
            </Link>
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
