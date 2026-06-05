import Link from "next/link";

import { ActionLabel } from "@/components/common/action-label";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";

const settingsSections = [
  {
    title: "Workspace management",
    description: "Create office or branch workspaces under the same CA organization and keep teams scoped cleanly.",
    href: "/settings/workspaces",
    action: "Open workspaces",
  },
  {
    title: "Team management",
    description: "Onboard filers, senior CAs, reviewers, and workspace operators with live role controls.",
    href: "/settings/team",
    action: "Open team",
  },
  {
    title: "Pilot readiness",
    description: "Run the operational checklist before opening a new workspace to testers or controlled users.",
    href: "/settings/pilot-readiness",
    action: "Open checklist",
  },
  {
    title: "User guide & UAT",
    description: "Review the navigation map, recommended workflow, and QA coverage for the current product surface.",
    href: "/settings/user-guide",
    action: "Open guide",
  },
  {
    title: "Change password",
    description: "Update your own workspace password without leaving the product.",
    href: "/settings/change-password",
    action: "Open password",
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Open workspace operations, onboarding controls, and release-readiness guidance from one place."
      />

      <SectionCard
        title="Operational settings"
        description="Use these areas to manage team access, confirm release readiness, and support controlled rollout."
      >
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {settingsSections.map((section) => (
            <div key={section.href} className="rounded-2xl border border-slate-200 px-5 py-5">
              <p className="text-sm font-semibold text-slate-900">{section.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
              <Button asChild size="sm" className="mt-4">
                <Link href={section.href}>
                  <ActionLabel kind="open" label={section.action} />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Release note"
        description="This landing page is intentionally lightweight. Live settings workflows currently sit in the focused modules above."
      >
        <p className="text-sm leading-6 text-slate-700">
          As the production surface grows, this page can expand into notification defaults, workspace preferences, and filing-control
          settings. For the first release, the linked modules above are the active operational paths.
        </p>
      </SectionCard>
    </div>
  );
}
