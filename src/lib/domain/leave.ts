import type { LeaveKind } from "@/lib/types";

/** Canonical kinds stored in DB / state (vacation = PTO, holiday = statutory). */
export const LEAVE_KINDS: LeaveKind[] = [
  "vacation",
  "holiday",
  "sick",
  "training",
];

/** User-facing labels (PTO / Statutory). */
export function leaveKindLabel(kind: LeaveKind | string): string {
  switch (kind) {
    case "vacation":
    case "pto":
      return "PTO";
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

/** Map UI / prompt aliases onto stored LeaveKind values. */
export function normalizeLeaveKind(raw: string): LeaveKind {
  const k = raw.trim().toLowerCase();
  if (k === "pto" || k === "vacation") return "vacation";
  if (k === "statutory" || k === "holiday") return "holiday";
  if (k === "sick") return "sick";
  if (k === "training") return "training";
  return "vacation";
}

export function isStatutoryLeave(kind: LeaveKind | string): boolean {
  return kind === "holiday" || kind === "statutory";
}

export function isPtoLeave(kind: LeaveKind | string): boolean {
  return kind === "vacation" || kind === "pto";
}
