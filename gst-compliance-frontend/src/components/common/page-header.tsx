import Link from "next/link";

import { Button } from "@/components/ui/button";
import { typography } from "@/design-system";

type Action = {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
};

export function PageHeader({
  title,
  description,
  actions = [],
}: {
  title: string;
  description: string;
  actions?: Action[];
}) {
  return (
    <div className="page-header-surface flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        <p className={typography.eyebrow}>Compliance workspace</p>
        <h1 className={typography.pageTitle}>{title}</h1>
        <p className={["max-w-3xl", typography.body].join(" ")}>{description}</p>
      </div>

      {actions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 lg:max-w-xl lg:justify-end">
          {actions.map((action) =>
            action.href ? (
              <Button key={action.label} size="default" asChild className={action.disabled ? "pointer-events-none opacity-50" : undefined}>
                <Link href={action.href} aria-disabled={action.disabled}>
                  {action.label}
                </Link>
              </Button>
            ) : (
              <Button key={action.label} size="default" onClick={action.onClick} disabled={action.disabled}>
                {action.label}
              </Button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
