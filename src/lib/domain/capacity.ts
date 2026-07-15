import type { Assignment, CapacityLevel, LeaveDay, Person } from "@/lib/types";
import { toDateKey, workingDaysBetween } from "@/lib/domain/dates";
import { isFullDayLeave } from "@/lib/domain/leave";
import {
  expandAssignmentsInRange,
  occurrenceCoversDay,
} from "@/lib/domain/recurrence";
import { isWeekend, parseISO } from "date-fns";

export function dailyCapacityHours(person: Person): number {
  return person.capacity_hours_week / 5;
}

export function isOnLeave(
  personId: string,
  dateKey: string,
  leaveDays: LeaveDay[],
): LeaveDay | undefined {
  return leaveDays.find(
    (l) =>
      l.person_id === personId &&
      l.date === dateKey &&
      l.status === "approved",
  );
}

/** True when approved full-day leave blocks the entire workday. */
export function isOnFullDayLeave(
  personId: string,
  dateKey: string,
  leaveDays: LeaveDay[],
): LeaveDay | undefined {
  const leave = isOnLeave(personId, dateKey, leaveDays);
  return leave && isFullDayLeave(leave) ? leave : undefined;
}

export function personBookedHoursOnDay(
  personId: string,
  dateKey: string,
  assignments: Assignment[],
  leaveDays: LeaveDay[],
  includeTentative = true,
): number {
  if (isWeekend(parseISO(dateKey))) return 0;
  if (isOnFullDayLeave(personId, dateKey, leaveDays)) return 0;

  const leave = isOnLeave(personId, dateKey, leaveDays);
  const leaveHours =
    leave && !isFullDayLeave(leave) ? (leave.hours_per_day ?? 0) : 0;

  const occs = expandAssignmentsInRange(assignments, dateKey, dateKey).filter(
    (o) => {
      if (o.person_id !== personId) return false;
      if (!includeTentative && o.status !== "confirmed") return false;
      return occurrenceCoversDay(o, dateKey);
    },
  );

  return leaveHours + occs.reduce((sum, o) => sum + o.hours_per_day, 0);
}

export function personBookedHoursInRange(
  personId: string,
  startKey: string,
  endKey: string,
  assignments: Assignment[],
  leaveDays: LeaveDay[],
  includeTentative = true,
): number {
  const days = workingDaysBetween(startKey, endKey);
  return days.reduce(
    (sum, day) =>
      sum +
      personBookedHoursOnDay(
        personId,
        day,
        assignments,
        leaveDays,
        includeTentative,
      ),
    0,
  );
}

export function availableHoursInRange(
  person: Person,
  startKey: string,
  endKey: string,
  leaveDays: LeaveDay[],
): number {
  const days = workingDaysBetween(startKey, endKey);
  const perDay = dailyCapacityHours(person);
  return days.reduce((sum, day) => {
    if (isOnFullDayLeave(person.id, day, leaveDays)) return sum;
    return sum + perDay;
  }, 0);
}

export function utilizationPct(booked: number, available: number): number {
  if (available <= 0) return booked > 0 ? 999 : 0;
  return (booked / available) * 100;
}

export function capacityLevel(
  booked: number,
  available: number,
  onLeave: boolean,
): CapacityLevel {
  if (onLeave || available <= 0) return "unavailable";
  const pct = utilizationPct(booked, available);
  if (pct > 100) return "over";
  if (pct >= 95) return "near";
  return "healthy";
}

export function rangeKeysFromDates(dates: Date[]): {
  start: string;
  end: string;
} {
  if (dates.length === 0) {
    const today = toDateKey(new Date());
    return { start: today, end: today };
  }
  return {
    start: toDateKey(dates[0]),
    end: toDateKey(dates[dates.length - 1]),
  };
}
