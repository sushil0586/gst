"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function QuickActionButton({
  label,
  icon: Icon,
  href,
  description,
  variant = "button",
}: {
  label: string;
  icon: LucideIcon;
  href?: string;
  description?: string;
  variant?: "button" | "tile";
}) {
  if (variant === "tile" && href) {
    return (
      <Link href={href} className="action-tile group block">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/12 shadow-[0_14px_26px_-20px_rgba(15,23,42,0.35)]">
              <Icon className="size-4" />
            </div>
            <p className="mt-4 text-base font-semibold tracking-[-0.02em]">{label}</p>
            {description ? <p className="mt-2 text-sm leading-6 text-indigo-100/88">{description}</p> : null}
          </div>
          <span className="rounded-full bg-white/10 p-2 transition group-hover:bg-white/16">
            <svg viewBox="0 0 16 16" className="size-3.5 fill-current">
              <path d="M5.22 3.97a.75.75 0 0 1 1.06 0L9.56 7.25a1.06 1.06 0 0 1 0 1.5l-3.28 3.28a.75.75 0 1 1-1.06-1.06L8.19 8 5.22 5.03a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </span>
        </div>
      </Link>
    );
  }

  if (href) {
    return (
      <Button asChild size="lg" className="h-10 rounded-xl px-4">
        <Link href={href}>
          <Icon className="size-4" />
          {label}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      size="lg"
      className="h-10 rounded-xl px-4"
      onClick={() => toast.success(`${label} flow is ready for live workflow connection.`)}
    >
      <Icon className="size-4" />
      {label}
    </Button>
  );
}
