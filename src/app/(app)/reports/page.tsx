"use client";

import Link from "next/link";
import {
  ClipboardList,
  Gauge,
  LineChart,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { useAppHref } from "@/lib/hooks/use-app-href";

const reports: {
  path: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    path: "/reports/utilization",
    title: "Utilization",
    description: "People × weeks heatmap of planned load vs capacity.",
    icon: Gauge,
  },
  {
    path: "/reports/budgets",
    title: "Budgets",
    description: "Planned hours vs project total budget for every project.",
    icon: Wallet,
  },
  {
    path: "/reports/forecast",
    title: "Financial Forecast",
    description: "Revenue, cost, and margin implied by the schedule.",
    icon: LineChart,
  },
  {
    path: "/reports/tasks",
    title: "Tasks",
    description:
      "Overdue tasks, tasks missing a due date, and recent completions.",
    icon: ClipboardList,
  },
];

export default function ReportsPage() {
  const appHref = useAppHref();
  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title="Reports" />
      <div className="grid gap-3 p-3 sm:p-5 md:grid-cols-3">
        {reports.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.path}
              href={appHref(report.path)}
              className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 hover:bg-[var(--row-hover)]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-[var(--accent)]">
                <Icon size={18} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{report.title}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {report.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </PageContainer>
  );
}
