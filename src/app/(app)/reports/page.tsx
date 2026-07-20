"use client";

import Link from "next/link";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { useAppHref } from "@/lib/hooks/use-app-href";

const reports = [
  {
    path: "/reports/utilization",
    title: "Utilization",
    description: "People × weeks heatmap of planned load vs capacity.",
  },
  {
    path: "/reports/budgets",
    title: "Budgets",
    description: "Planned hours vs project total budget for every project.",
  },
  {
    path: "/reports/forecast",
    title: "Financial Forecast",
    description: "Revenue, cost, and margin implied by the schedule.",
  },
  {
    path: "/reports/tasks",
    title: "Tasks",
    description: "Overdue tasks, tasks missing a due date, and recent completions.",
  },
];

export default function ReportsPage() {
  const appHref = useAppHref();
  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title="Reports" />
      <div className="grid gap-3 p-3 sm:p-5 md:grid-cols-3">
        {reports.map((report) => (
          <Link
            key={report.path}
            href={appHref(report.path)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 hover:bg-[var(--row-hover)]"
          >
            <h2 className="text-sm font-semibold">{report.title}</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {report.description}
            </p>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
