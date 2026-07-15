"use client";

import { Topbar } from "@/components/nav/topbar";
import { useData } from "@/lib/data/store";
import { formatHours, formatMoney } from "@/lib/domain/budget";
import { orgForecast, projectForecast } from "@/lib/domain/forecast";

export default function ForecastReportPage() {
  const { state } = useData();
  const org = orgForecast(state.projects, state.assignments, state.people);
  const rows = state.projects
    .map((project) => projectForecast(project, state.assignments, state.people))
    .filter((r) => r.plannedHours > 0)
    .sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Topbar title="Financial forecast" />
      <div className="space-y-4 p-3 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Planned hours" value={formatHours(org.plannedHours)} />
          <Stat label="Revenue" value={formatMoney(org.revenue)} />
          <Stat label="Cost" value={formatMoney(org.cost)} />
          <Stat
            label="Margin"
            value={`${formatMoney(org.margin)} (${org.marginPct.toFixed(0)}%)`}
          />
        </div>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Hours</th>
                <th className="px-3 py-2 font-medium">Revenue</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const project = state.projects.find((p) => p.id === row.projectId);
                return (
                  <tr
                    key={row.projectId}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-3 py-2.5 font-medium">
                      {project?.name ?? row.projectId}
                    </td>
                    <td className="px-3 py-2.5">{formatHours(row.plannedHours)}</td>
                    <td className="px-3 py-2.5">{formatMoney(row.revenue)}</td>
                    <td className="px-3 py-2.5">{formatMoney(row.cost)}</td>
                    <td className="px-3 py-2.5">
                      {formatMoney(row.margin)} ({row.marginPct.toFixed(0)}%)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
    </div>
  );
}
