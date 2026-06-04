import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-2xl border border-slate-200/85 bg-white/96 px-3.5 py-2 text-sm text-slate-900 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.18)] transition-[border-color,box-shadow,background-color] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-slate-400 focus-visible:border-indigo-300 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-indigo-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-slate-100/80 disabled:text-slate-400 disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/10",
        className
      )}
      {...props}
    />
  )
}

export { Input }
