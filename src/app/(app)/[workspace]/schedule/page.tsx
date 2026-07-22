"use client";

import { ScheduleGrid } from "@/components/schedule/schedule-grid";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

export default function SchedulePage() {
  useDocumentTitle("Schedule");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScheduleGrid />
    </div>
  );
}
