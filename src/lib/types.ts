export type Role = "admin" | "manager" | "member";
export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";
export type ClientStatus = "active" | "archived";
export type BudgetMode = "none" | "hours" | "amount";
export type AssignmentStatus = "tentative" | "confirmed";
/**
 * Stored leave kinds. UI: vacation + null hours → Full Day;
 * vacation + hours → Partial Day; holiday → Statutory.
 * Aliases "pto" / "statutory" are normalized before persist.
 */
export type LeaveKind = "vacation" | "holiday" | "sick" | "training";
export type LeaveStatus = "pending" | "approved";
export type MilestoneStatus = "upcoming" | "done" | "missed";
export type Recurrence = "none" | "weekly";
export type TaskStatus = "upcoming" | "active" | "complete";
export type ProjectAssetKind =
  | "sow"
  | "website"
  | "figma"
  | "content"
  | "staging"
  | "passwords"
  | "drive"
  | "chat"
  | "spreadsheet"
  | "document"
  | "custom";

export interface Organization {
  id: string;
  name: string;
  /** URL segment for /{workspace}/… */
  slug: string;
  /** Soft-disable: members cannot use the workspace when set. */
  disabled_at?: string | null;
  /** When true, /share/[token] serves a read-only view. Token is not always loaded client-side. */
  share_enabled?: boolean;
  /** Present in demo local state; supabase managers load token via /api/share. */
  share_token?: string | null;
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
  /** URL segment under /{workspace}/projects/{client}/… */
  slug: string;
  notes: string;
  color: string;
  status: ClientStatus;
  /** When true, omit from org-wide public share (and hide this client's projects). */
  hide_from_public_share: boolean;
}

export interface Project {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  /** URL segment under /{workspace}/projects/{client}/{project} */
  slug: string;
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
  /** Optional project manager (person in the org directory). */
  manager_person_id: string | null;
  /** Per-project client portal (separate from org schedule share). */
  share_enabled?: boolean;
  share_token?: string | null;
  /** When true, omit from org-wide public share (schedule, reports, etc.). */
  hide_from_public_share: boolean;
}

export interface Milestone {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  /** Optional start of milestone window; falls back to project start for progress. */
  start_date: string | null;
  due_date: string | null;
  status: MilestoneStatus;
  /** Admin-checked after formal client sign-off. */
  client_approved: boolean;
  sort_order: number;
}

export interface ProjectAsset {
  id: string;
  organization_id: string;
  project_id: string;
  kind: ProjectAssetKind;
  label: string;
  url: string;
  /** Plain text body for note-style assets (link assets leave this empty). */
  body: string;
  sort_order: number;
  /** When true, asset is omitted from the client portal. */
  hide_from_client: boolean;
}

export interface TaskList {
  id: string;
  organization_id: string;
  project_id: string;
  milestone_id: string | null;
  name: string;
  /** Optional header background color (hex). */
  color: string | null;
  sort_order: number;
  /** When true, list is hidden from the main board until restored. */
  archived: boolean;
}

export interface Task {
  id: string;
  organization_id: string;
  project_id: string;
  list_id: string;
  parent_id: string | null;
  assignee_person_id: string | null;
  title: string;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  notes: string;
  sort_order: number;
}

export interface TaskComment {
  id: string;
  organization_id: string;
  task_id: string;
  author_profile_id: string;
  body: string;
  created_at: string;
  /** Set when the author edits the body; null if never edited. */
  updated_at: string | null;
  /** People tagged in this comment (dashboard notifications). */
  mentioned_person_ids: string[];
  /** Emoji reactions from org members. */
  reactions: TaskCommentReaction[];
}

export interface TaskCommentReaction {
  emoji: string;
  profile_id: string;
}

export interface Bulletin {
  id: string;
  organization_id: string;
  project_id: string | null;
  title: string;
  body: string;
  pinned: boolean;
  /** all = everyone; people = audience_person_ids only */
  audience: "all" | "people";
  audience_person_ids: string[];
  created_by_profile_id: string | null;
  created_at: string;
}

export interface ProjectTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string;
}

export interface TemplateMilestone {
  id: string;
  organization_id: string;
  template_id: string;
  name: string;
  offset_days: number;
  sort_order: number;
}

export interface TemplateTaskList {
  id: string;
  organization_id: string;
  template_id: string;
  template_milestone_id: string | null;
  name: string;
  sort_order: number;
}

export interface TemplateTask {
  id: string;
  organization_id: string;
  template_id: string;
  list_id: string;
  parent_id: string | null;
  title: string;
  notes: string;
  offset_days: number | null;
  sort_order: number;
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
  /** Public URL for profile photo (Storage or data URL in demo). */
  avatar_url: string | null;
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
  /**
   * Week-start (Monday) date keys excluded from expansion. Lets one week be
   * removed or detached without splitting the series into multiple rows.
   */
  recurrence_exceptions: string[];
}

/** Explicit project team roster (may also appear via schedule/tasks). */
export interface ProjectMember {
  project_id: string;
  person_id: string;
  organization_id: string;
}

export interface LeaveDay {
  id: string;
  organization_id: string;
  person_id: string;
  date: string;
  kind: LeaveKind;
  status: LeaveStatus;
  /**
   * Null = full-day leave (clears overlapping assignments on save).
   * Number = partial-day hours away (keeps other assignments).
   */
  hours_per_day: number | null;
  notes: string;
}

export interface DemoState {
  organization: Organization;
  profiles: Profile[];
  clients: Client[];
  projects: Project[];
  milestones: Milestone[];
  people: Person[];
  assignments: Assignment[];
  project_members: ProjectMember[];
  leave_days: LeaveDay[];
  holiday_calendars: HolidayCalendar[];
  holiday_calendar_days: HolidayCalendarDay[];
  project_assets: ProjectAsset[];
  task_lists: TaskList[];
  tasks: Task[];
  task_comments: TaskComment[];
  bulletins: Bulletin[];
  /** Bulletin ids the current session profile has dismissed (not "new"). */
  dismissed_bulletin_ids: string[];
  project_templates: ProjectTemplate[];
  template_milestones: TemplateMilestone[];
  template_task_lists: TemplateTaskList[];
  template_tasks: TemplateTask[];
  sessionProfileId: string | null;
}

export interface BudgetBurn {
  totalHours: number;
  plannedHours: number;
  /** Schedule hours used through today (within burn window). */
  usedHours: number;
  /** Schedule hours after today (within burn window). */
  futureHours: number;
  remainingHours: number;
  pct: number;
  overBy: number;
  totalAmount: number | null;
  plannedAmount: number;
  usedAmount: number;
  futureAmount: number;
  remainingAmount: number | null;
  amountOverBy: number;
  /** Active ledger for this burn (exclusive: never both hours and amount). */
  mode: BudgetMode;
}

export type CapacityLevel =
  | "low"
  | "healthy"
  | "near"
  | "over"
  | "unavailable";
