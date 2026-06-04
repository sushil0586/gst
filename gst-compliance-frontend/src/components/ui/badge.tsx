import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.02em] whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-linear-to-r from-indigo-500 to-blue-500 text-primary-foreground shadow-[0_12px_24px_-18px_rgba(79,70,229,0.42)] [a]:hover:opacity-95",
        secondary:
          "border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.96))] text-slate-700 [a]:hover:bg-slate-100",
        destructive:
          "border-rose-200 bg-rose-50 text-rose-700 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-rose-100",
        outline:
          "border-slate-200 bg-white/90 text-slate-600 shadow-[0_10px_18px_-18px_rgba(15,23,42,0.16)] [a]:hover:bg-slate-50 [a]:hover:text-slate-900",
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
