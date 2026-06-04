export const semanticColors = {
  sidebar: "from-slate-950 via-slate-900 to-slate-800",
  primary: "indigo",
  success: "emerald",
  warning: "amber",
  danger: "rose",
  background: "slate-50",
  card: "white",
  border: "slate-200",
  textStrong: "slate-950",
  textMuted: "slate-600",
} as const;

export const statusColorClasses = {
  success: "border-emerald-200/85 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(220,252,231,0.9))] text-emerald-700 ring-emerald-100/80",
  warning: "border-amber-200/85 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.92))] text-amber-700 ring-amber-100/80",
  danger: "border-rose-200/85 bg-[linear-gradient(180deg,rgba(255,241,242,0.98),rgba(255,228,230,0.92))] text-rose-700 ring-rose-100/80",
  info: "border-indigo-200/85 bg-[linear-gradient(180deg,rgba(238,242,255,0.98),rgba(224,231,255,0.92))] text-indigo-700 ring-indigo-100/80",
  neutral: "border-slate-200/85 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.95))] text-slate-700 ring-slate-100/80",
} as const;
