"use client";

import { Topbar } from "@/components/nav/topbar";
import { ScheduleGrid } from "@/components/schedule/schedule-grid";
import { useData } from "@/lib/data/store";

export default function SchedulePage() {
  const { canManage } = useData();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar title={canManage ? "Schedule" : "My schedule"} />
      <ScheduleGrid />
    </div>
  );
}
