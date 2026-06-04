"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { DonutDatum } from "@/types";

export function MismatchDonutChart({ data }: { data: DonutDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const topCategory = [...data].sort((a, b) => b.value - a.value)[0];

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <div className="relative h-[280px] min-w-0">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-white/92 px-5 py-4 text-center shadow-[0_22px_46px_-30px_rgba(15,23,42,0.2)] ring-1 ring-slate-200/80 backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Open items</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{total}</p>
            <p className="mt-1 text-xs text-slate-500">{topCategory?.name ?? "No categories"}</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height="100%" minHeight={280}>
          <PieChart>
            <Pie data={data} innerRadius={76} outerRadius={110} dataKey="value" paddingAngle={4} stroke="rgba(255,255,255,0.9)" strokeWidth={4}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 18,
                border: "1px solid #e2e8f0",
                background: "rgba(255,255,255,0.96)",
                boxShadow: "0 22px 50px -28px rgba(15,23,42,0.28)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3">
        {data.map((entry) => {
          const percentage = total > 0 ? Math.round((entry.value / total) * 100) : 0;

          return (
            <div key={entry.name} className="rounded-2xl border border-slate-200/80 bg-white/96 px-4 py-3 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.14)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="size-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{entry.name}</p>
                    <p className="text-xs text-slate-500">{percentage}% of current mismatch volume</p>
                  </div>
                </div>
                <p className="text-lg font-semibold text-slate-950">{entry.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
