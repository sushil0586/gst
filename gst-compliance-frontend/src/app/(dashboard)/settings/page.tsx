import Link from "next/link";
import { ShieldCheck, Users, Building2, KeyRound, BookOpen, ClipboardList } from "lucide-react";

import { ActionLabel } from "@/components/common/action-label";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";

const settingsSections = [
  {
    icon: Building2,
    eyebrow: "Workspace control",
    title: "Workspace management",
    description: "Create branch or office workspaces, maintain organization structure, and keep operational boundaries clear.",
    href: "/settings/workspaces",
    action: "Open workspaces",
    outcome: "Manage rollout scope, office metadata, and workspace ownership from one place.",
  },
  {
    icon: Users,
    eyebrow: "Access control",
    title: "Team management",
    description: "Onboard filers, senior CAs, reviewers, and workspace operators with role-aware permissions.",
    href: "/settings/team",
    action: "Open team",
    outcome: "Control who can prepare, review, file, and support month-end work.",
  },
  {
    icon: ClipboardList,
    eyebrow: "Operational readiness",
    title: "Pilot readiness",
    description: "Run the release and environment checklist before opening a workspace for live operational use.",
    href: "/settings/pilot-readiness",
    action: "Open readiness",
    outcome: "Verify setup, seeded data, workflow readiness, and support checks before rollout.",
  },
  {
    icon: BookOpen,
    eyebrow: "Operator guidance",
    title: "User guide & UAT",
    description: "Review the navigation map, operator workflow, and QA guidance for the released product surface.",
    href: "/settings/user-guide",
    action: "Open guide",
    outcome: "Help teams work consistently and validate the release boundary with confidence.",
  },
  {
    icon: KeyRound,
    eyebrow: "Account security",
    title: "Change password",
    description: "Update your own workspace password without leaving the product or involving an administrator.",
    href: "/settings/change-password",
    action: "Change password",
    outcome: "Keep operator accounts secure during live usage and support rotations.",
  },
];

const launchStandards = [
  "Keep workspace ownership, member roles, and password hygiene current before each live close cycle.",
  "Use the readiness and guide surfaces as operational support tools, not as substitutes for missing workflow ownership.",
  "Treat settings changes as release-impacting decisions because they shape access, rollout scope, and support posture.",
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage workspace control, access, security, and operational readiness from one launch-ready administration hub."
      />

      <SectionCard
        title="Administration hub"
        description="Use these settings surfaces to control who has access, which workspaces are active, and how launch operations stay supportable."
      >
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {settingsSections.map((section) => (
            <div key={section.href} className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.28)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{section.eyebrow}</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{section.title}</p>
                </div>
                <div className="rounded-2xl bg-slate-100 p-2 text-slate-700">
                  <section.icon className="size-5" />
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{section.description}</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{section.outcome}</p>
              <Button asChild size="sm" className="mt-5">
                <Link href={section.href}>
                  <ActionLabel kind="open" label={section.action} />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Launch standard"
        description="This settings area is part of the released product surface and should be treated as an operational control center."
      >
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-700">
              <ShieldCheck className="size-5" />
            </div>
            <div className="space-y-3 text-sm leading-6 text-slate-700">
              <p>
                Settings now acts as the operational entry point for access control, workspace administration, and release-readiness support.
              </p>
              <div className="space-y-2">
                {launchStandards.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
