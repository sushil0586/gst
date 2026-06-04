import Link from "next/link";

import { ActionLabel } from "@/components/common/action-label";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";

const checklist = [
  "Seed demo data and log in with the pilot account.",
  "Create or confirm a client, GSTIN, and compliance period.",
  "Upload sample sales, purchase, GSTR-2B, and invalid import files.",
  "Run reconciliation and review mismatch actions.",
  "Prepare GSTR-1 and GSTR-3B drafts.",
  "Request approval, approve, mark filed, and lock the period.",
  "Download reports from transactions, imports, reconciliation, returns, and audit trail.",
  "Review known limitations before sharing the environment with testers.",
];

export default function PilotReadinessPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pilot Readiness"
        description="Use this checklist before running the first controlled pilot with CA or business users."
      />

      <SectionCard title="Pilot checklist" description="A compact run-through of the Phase 1 workflow and known boundaries.">
        <div className="space-y-3">
          {checklist.map((item, index) => (
            <div key={item} className="flex gap-3 rounded-2xl border border-slate-100 px-4 py-4">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
                {index + 1}
              </div>
              <p className="text-sm leading-6 text-slate-700">{item}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild size="sm">
            <Link href="/dashboard">
              <ActionLabel kind="open" label="Go to dashboard" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/imports">
              <ActionLabel kind="open" label="Open imports" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/audit-trail">
              <ActionLabel kind="open" label="Open audit trail" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/user-guide">
              <ActionLabel kind="open" label="Open user guide & UAT" />
            </Link>
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Runbook location" description="The full local setup and pilot steps are documented in the repository.">
        <p className="text-sm text-slate-700">
          See <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">docs/pilot-runbook.md</code> for setup,
          seed data, sample imports, workflow steps, export checks, and known limitations.
        </p>
        <p className="mt-3 text-sm text-slate-700">
          For full product navigation and manual QA coverage, also use{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">docs/user-practical-guide.md</code> and{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">docs/qa-uat-cases.md</code>.
        </p>
      </SectionCard>
    </div>
  );
}
