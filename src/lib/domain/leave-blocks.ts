import { workingDaysBetween } from "@/lib/domain/dates";
import type { LeaveDay, LeaveKind } from "@/lib/types";

export interface LeaveBlock {
  /** First leave day id (stable key for selection). */
  id: string;
  person_id: string;
  start_date: string;
  end_date: string;
  kind: LeaveKind;
  status: LeaveDay["status"];
  hours_per_day: number | null;
  notes: string;
  /** All leave day rows in this contiguous block. */
  dayIds: string[];
}

/**
 * Group approved leave into contiguous working-day blocks (same kind + hours + notes).
 */
export function leaveBlocksInRange(
  leaveDays: LeaveDay[],
  personId: string,
  rangeStart: string,
  rangeEnd: string,
): LeaveBlock[] {
  const days = leaveDays
    .filter(
      (l) =>
        l.person_id === personId &&
        l.status === "approved" &&
        l.date >= rangeStart &&
        l.date <= rangeEnd,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (days.length === 0) return [];

  const blocks: LeaveBlock[] = [];
  let current: LeaveDay[] = [days[0]];

  function flush() {
    if (current.length === 0) return;
    const first = current[0];
    const last = current[current.length - 1];
    blocks.push({
      id: first.id,
      person_id: first.person_id,
      start_date: first.date,
      end_date: last.date,
      kind: first.kind,
      status: first.status,
      hours_per_day: first.hours_per_day ?? null,
      notes: first.notes ?? "",
      dayIds: current.map((d) => d.id),
    });
    current = [];
  }

  for (let i = 1; i < days.length; i++) {
    const prev = current[current.length - 1];
    const next = days[i];
    const between = workingDaysBetween(prev.date, next.date);
    const contiguous =
      between.length === 2 &&
      next.kind === prev.kind &&
      (next.hours_per_day ?? null) === (prev.hours_per_day ?? null) &&
      (next.notes ?? "") === (prev.notes ?? "");
    if (contiguous) {
      current.push(next);
    } else {
      flush();
      current = [next];
    }
  }
  flush();
  return blocks;
}
