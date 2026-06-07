"use client";

import type { ReactNode } from "react";

import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { typography } from "@/design-system";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "w-[min(94vw,36rem)] sm:max-w-none",
  md: "w-[min(94vw,46rem)] sm:max-w-none",
  lg: "w-[min(95vw,64rem)] sm:max-w-none",
  xl: "w-[min(96vw,78rem)] sm:max-w-none",
} as const;

export function AppModalContent({
  size = "lg",
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogContent> & {
  size?: keyof typeof sizeClasses;
}) {
  return (
    <DialogContent
      className={cn(
        "max-h-[calc(100vh-2rem)] overflow-hidden rounded-[30px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] p-0 shadow-[0_38px_110px_-42px_rgba(15,23,42,0.28)]",
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      <div className="flex min-h-0 max-h-[calc(100vh-2rem)] flex-col">{children}</div>
    </DialogContent>
  );
}

export function AppModalHeader({
  title,
  description,
  icon,
  className,
  titleClassName,
  descriptionClassName,
  aside,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  aside?: ReactNode;
}) {
  return (
    <DialogHeader className={cn("border-b border-slate-200/85 px-8 py-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {icon ? (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#eef2ff,#ffffff)] text-indigo-600 ring-1 ring-indigo-100 shadow-[0_18px_38px_-24px_rgba(79,70,229,0.35)]">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <DialogTitle className={cn("text-heading-premium text-2xl font-semibold", titleClassName)}>{title}</DialogTitle>
            {description ? (
              <DialogDescription className={cn("max-w-3xl", typography.bodyCompact, descriptionClassName)}>
                {description}
              </DialogDescription>
            ) : null}
          </div>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </DialogHeader>
  );
}

export function AppModalBody({ className, children }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-8 py-6", className)}>{children}</div>;
}

export function AppModalFooter({ className, children }: React.ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      className={cn(
        "sticky bottom-0 mx-0 mb-0 border-t border-slate-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.98))] px-8 py-5 sm:justify-between",
        className,
      )}
    >
      {children}
    </DialogFooter>
  );
}
