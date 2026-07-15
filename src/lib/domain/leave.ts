import type { LeaveDay, LeaveKind } from "@/lib/types";

/** Canonical kinds stored in DB / state (vacation = PTO / Full or Partial Day). */
export const LEAVE_KINDS: LeaveKind[] = [
  "vacation",
  "holiday",
  "sick",
  "training",
];

/** UI Type values for the leave sidebar (partial/full map to vacation). */
export type LeaveTypeOption =
  | "partial"
  | "full"
  | "holiday"
  | "sick"
  | "training";

/** Full-day leave: Vacation Full Day (null hours), plus Statutory /
 * Sick / Training and holiday-calendar days (always full height). */
export function isFullDayLeave(
  leave: Pick<LeaveDay, "hours_per_day" | "kind"> | null | undefined,
): boolean {
  if (leave == null) return false;
  if (
    leave.kind === "holiday" ||
    leave.kind === "sick" ||
    leave.kind === "training"
  ) {
    return true;
  }
  return leave.hours_per_day == null;
}

/** Kinds that are always stored/saved as full day (null hours). */
export function isAlwaysFullDayKind(kind: LeaveKind | string): boolean {
  return (
    kind === "holiday" ||
    kind === "sick" ||
    kind === "training" ||
    kind === "statutory"
  );
}

/** User-facing labels for stored kinds (legacy / reports). */
export function leaveKindLabel(kind: LeaveKind | string): string {
  switch (kind) {
    case "vacation":
    case "pto":
      return "Full Day";
    case "holiday":
    case "statutory":
      return "Statutory";
    case "sick":
      return "Sick";
    case "training":
      return "Training";
    default:
      return String(kind);
  }
}

/** Label for a leave block given kind + hours (Partial vs Full Day). */
export function leaveBlockLabel(
  kind: LeaveKind | string,
  hoursPerDay: number | null,
): string {
  if (kind === "vacation" || kind === "pto") {
    return hoursPerDay == null ? "Full Day" : "Partial Day";
  }
  return leaveKindLabel(kind);
}

export function leaveTypeFromLeave(
  kind: LeaveKind,
  hoursPerDay: number | null,
): LeaveTypeOption {
  if (kind === "holiday") return "holiday";
  if (kind === "sick") return "sick";
  if (kind === "training") return "training";
  return hoursPerDay == null ? "full" : "partial";
}

export function leaveFromTypeOption(
  option: LeaveTypeOption,
  currentHours: number | null,
): { kind: LeaveKind; hours_per_day: number | null } {
  switch (option) {
    case "partial":
      return {
        kind: "vacation",
        hours_per_day:
          currentHours != null && currentHours > 0 ? currentHours : 4,
      };
    case "full":
      return { kind: "vacation", hours_per_day: null };
    case "holiday":
      return { kind: "holiday", hours_per_day: null };
    case "sick":
      return { kind: "sick", hours_per_day: null };
    case "training":
      return { kind: "training", hours_per_day: null };
  }
}

/** Map UI / prompt aliases onto stored LeaveKind values. */
export function normalizeLeaveKind(raw: string): LeaveKind {
  const k = raw.trim().toLowerCase();
  if (k === "pto" || k === "vacation" || k === "full" || k === "full day") {
    return "vacation";
  }
  if (k === "statutory" || k === "holiday") return "holiday";
  if (k === "sick") return "sick";
  if (k === "training") return "training";
  if (k === "partial" || k === "partial day") return "vacation";
  return "vacation";
}

export function isStatutoryLeave(kind: LeaveKind | string): boolean {
  return kind === "holiday" || kind === "statutory";
}

export function isPtoLeave(kind: LeaveKind | string): boolean {
  return kind === "vacation" || kind === "pto";
}
