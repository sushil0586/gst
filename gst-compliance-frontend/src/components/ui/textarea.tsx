import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-2xl border border-slate-200/85 bg-white/96 px-3.5 py-3 text-sm text-slate-900 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.18)] transition-[border-color,box-shadow,background-color] outline-none placeholder:text-slate-400 focus-visible:border-indigo-300 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100/80 disabled:text-slate-400 disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/10",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
