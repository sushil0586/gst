import Link from "next/link";

import { ActionLabel } from "@/components/common/action-label";
import { PlaceholderPage } from "@/components/common/placeholder-page";
import { workspaces } from "@/data/workspace";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PlaceholderPage
        title="Settings"
        description="Manage workspace preferences, operational defaults, role foundations, and future backend integrations."
        statusTitle="Pilot shell: settings overview"
        statusDescription="This top-level settings page is still a preview layer. Use Team, Pilot Readiness, and User Guide for the live-supported operational paths in the current build."
        tableTitle="Workspace settings"
        tableDescription="Mock settings overview for the active compliance workspace."
        columns={[
          { key: "name", label: "Workspace" },
          { key: "organizationName", label: "Organization" },
          { key: "role", label: "Role" },
        ]}
        rows={workspaces}
        emptyTitle="Settings foundation ready"
        emptyDescription="This page is prepared for user roles, notification rules, and filing preferences."
      />
      <div className="surface-card flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Team management</p>
          <p className="mt-1 text-sm text-slate-600">Onboard filers, senior CAs, reviewers, and workspace operators for real pilot testing.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/team">
            <ActionLabel kind="open" label="Open team" />
          </Link>
        </Button>
      </div>
      <div className="surface-card flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Pilot readiness</p>
          <p className="mt-1 text-sm text-slate-600">Follow the guided pilot checklist before inviting CA or business users.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/pilot-readiness">
            <ActionLabel kind="open" label="Open checklist" />
          </Link>
        </Button>
      </div>
      <div className="surface-card flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">User guide & UAT</p>
          <p className="mt-1 text-sm text-slate-600">Open the practical user guide, navigation map, and QA test pack for full end-to-end validation.</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/settings/user-guide">
            <ActionLabel kind="open" label="Open guide" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
