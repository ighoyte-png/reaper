"use client";

import { Topbar } from "@/components/nav/topbar";
import { UtilizationHeatmap } from "@/components/heatmap/utilization-heatmap";

export default function UtilizationReportPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Topbar title="Utilization" />
      <div className="space-y-3 p-3 sm:p-5">
        <p className="text-sm text-[var(--text-muted)]">
          Green healthy · yellow near full · red overbooked · gray unavailable
        </p>
        <UtilizationHeatmap weeks={8} />
      </div>
    </div>
  );
}
