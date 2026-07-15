export type Role = "admin" | "manager" | "member";
export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";
export type BudgetMode = "none" | "hours" | "amount";
export type AssignmentStatus = "tentative" | "confirmed";
/**
 * Stored leave kinds. UI labels: vacation→PTO, holiday→Statutory.
 * Aliases "pto" / "statutory" are normalized before persist.
 */
export type LeaveKind = "vacation" | "holiday" | "sick" | "training";
export type LeaveStatus = "pending" | "approved";
export type MilestoneStatus = "upcoming" | "done" | "missed";
export type Recurrence = "none" | "weekly";

export interface Organization {
  id: string;
  name: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: Role;
}

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  notes: string;
}

export interface Project {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  status: ProjectStatus;
  priority: number;
  color: string;
  start_date: string | null;
  end_date: string | null;
  /** Null / unused when budget_mode is none or amount. */
  budget_hours: number | null;
  budget_amount: number | null;
  budget_mode: BudgetMode;
  /** When true, hourly budget resets each calendar month (retainer). */
  budget_monthly_reset: boolean;
  notes: string;
}

export interface Milestone {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  due_date: string;
  status: MilestoneStatus;
}

export interface Person {
  id: string;
  organization_id: string;
  profile_id: string | null;
  name: string;
  /** Work email used for invites (may mirror linked profile email). */
  email: string;
  role_title: string;
  department: string;
  office: string;
  capacity_hours_week: number;
  cost_rate: number;
  bill_rate: number;
  timezone: string;
  /** Optional holiday calendar (statutory dates applied into leave_days). */
  holiday_calendar_id: string | null;
}

export interface HolidayCalendar {
  id: string;
  organization_id: string;
  name: string;
  /** Region label, e.g. US, CA. */
  region: string;
}

export interface HolidayCalendarDay {
  id: string;
  organization_id: string;
  calendar_id: string;
  date: string;
  name: string;
}

export interface Assignment {
  id: string;
  organization_id: string;
  person_id: string;
  project_id: string;
  start_date: string;
  end_date: string;
  hours_per_day: number;
  allocation_pct: number | null;
  status: AssignmentStatus;
  notes: string;
  /** Weekly = repeat same weekdays (until recurrence_end_date if set). */
  recurrence: Recurrence;
  /** Inclusive end of weekly series; null = indefinite (budget uses 52 weeks). */
  recurrence_end_date: string | null;
}

export interface LeaveDay {
  id: string;
  organization_id: string;
  person_id: string;
  date: string;
  kind: LeaveKind;
  status: LeaveStatus;
}

export interface DemoState {
  organization: Organization;
  profiles: Profile[];
  clients: Client[];
  projects: Project[];
  milestones: Milestone[];
  people: Person[];
  assignments: Assignment[];
  leave_days: LeaveDay[];
  holiday_calendars: HolidayCalendar[];
  holiday_calendar_days: HolidayCalendarDay[];
  sessionProfileId: string | null;
}

export interface BudgetBurn {
  totalHours: number;
  plannedHours: number;
  remainingHours: number;
  pct: number;
  overBy: number;
  totalAmount: number | null;
  plannedAmount: number;
  remainingAmount: number | null;
  amountOverBy: number;
  /** Active ledger for this burn (exclusive: never both hours and amount). */
  mode: BudgetMode;
}

export type CapacityLevel = "healthy" | "near" | "over" | "unavailable";
