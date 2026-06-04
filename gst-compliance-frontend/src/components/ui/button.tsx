import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium tracking-[-0.01em] whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-linear-to-r from-indigo-500 via-blue-500 to-sky-500 text-primary-foreground shadow-[0_16px_30px_-18px_rgba(79,70,229,0.5)] hover:from-indigo-600 hover:via-blue-500 hover:to-sky-500",
        outline:
          "border-slate-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,247,255,0.94))] text-slate-700 shadow-[0_10px_22px_-18px_rgba(59,130,246,0.16)] hover:border-indigo-200 hover:bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(238,244,255,0.98))] hover:text-slate-950 aria-expanded:border-indigo-200 aria-expanded:bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(238,244,255,0.98))] aria-expanded:text-slate-950",
        secondary:
          "bg-[linear-gradient(180deg,rgba(243,247,255,0.96),rgba(234,241,255,0.92))] text-slate-700 shadow-[0_10px_20px_-18px_rgba(59,130,246,0.14)] hover:bg-[linear-gradient(180deg,rgba(238,244,255,1),rgba(226,236,255,0.96))] aria-expanded:bg-[linear-gradient(180deg,rgba(238,244,255,1),rgba(226,236,255,0.96))] aria-expanded:text-slate-900",
        ghost:
          "text-slate-600 hover:bg-slate-100/85 hover:text-slate-900 aria-expanded:bg-slate-100/85 aria-expanded:text-slate-900",
        destructive: "bg-linear-to-r from-rose-500 to-rose-600 text-white shadow-[0_14px_28px_-18px_rgba(225,29,72,0.42)] hover:from-rose-600 hover:to-rose-600 focus-visible:border-rose-500 focus-visible:ring-rose-200",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-lg px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-xl px-3 text-[0.82rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-10",
        "icon-xs":
          "size-7 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-9 rounded-xl",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
