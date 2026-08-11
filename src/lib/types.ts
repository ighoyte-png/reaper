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
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string;
  company_website: string;
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
  /**
   * Off-the-record collaborative project: roster members share PM powers,
   * no schedule/budget/reporting (except My Tasks / mentions / Task Pulse).
   */
  sandbox_mode: boolean;
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
  /** PM- or client-checked approval flag. */
  client_approved: boolean;
  sort_order: number;
  /** When true (and contact set), portal shows Ready for Approval. */
  approval_enabled: boolean;
  /** Expected client contact for portal approval (never exposed on portal). */
  approval_name: string;
  approval_email: string;
  /** Inline essentials link shown beside the milestone bar. */
  essential_kind: ProjectAssetKind | null;
  essential_label: string;
  essential_url: string;
  /** Set only when the client approves via the portal. */
  approved_by_name: string | null;
  approved_at: string | null;
  approved_by_client: boolean;
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
  /** When true, list (and its tasks) are omitted from the client portal. */
  hide_from_client: boolean;
  /** When true, list participates in the project Gantt view (PM-locked). */
  gantt_enabled: boolean;
  /** Inclusive list sprint start for Gantt bar (date key). */
  start_date: string | null;
  /** Inclusive list sprint end for Gantt bar (date key). */
  end_date: string | null;
}

export interface Task {
  id: string;
  organization_id: string;
  project_id: string;
  list_id: string;
  parent_id: string | null;
  assignee_person_id: string | null;
  title: string;
  /** Visual list separator — no assignee, status, or subtasks. */
  is_divider: boolean;
  /**
   * Subtask-only client approval gate. Open = not complete (yellow);
   * Approved = complete (green). Locks downstream status until approved.
   */
  is_client_review: boolean;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  notes: string;
  sort_order: number;
  /** When the task row was created (ISO). */
  created_at: string;
  /** Profile that created the task; null for legacy rows. */
  created_by_profile_id: string | null;
  /** Latest edit time (ISO); null until the task is first updated. */
  edited_at: string | null;
  /** Profile that made the latest edit. */
  edited_by_profile_id: string | null;
  /** Latest status change time (ISO); null until status first changes. */
  status_changed_at: string | null;
  /** Profile that made the latest status change. */
  status_changed_by_profile_id: string | null;
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

export type BulletinTone = "default" | "success";

export interface Bulletin {
  id: string;
  organization_id: string;
  project_id: string | null;
  /** Deep-link for task in-review system notices. */
  task_id: string | null;
  /** Deep-link for milestone approval system notices. */
  milestone_id: string | null;
  title: string;
  body: string;
  pinned: boolean;
  /** all = everyone; people = audience_person_ids and/or audience_pod_ids */
  audience: "all" | "people";
  audience_person_ids: string[];
  audience_pod_ids: string[];
  /** Visual tone — success = green highlight (e.g. milestone approval). */
  tone: BulletinTone;
  created_by_profile_id: string | null;
  created_at: string;
}

export interface ProjectTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  /**
   * Source project start_date when the template was saved with dates.
   * Apply slides all template dates by (chosenStart − anchor).
   */
  anchor_start_date: string | null;
}

export interface TemplateMilestone {
  id: string;
  organization_id: string;
  template_id: string;
  name: string;
  offset_days: number;
  sort_order: number;
  start_date: string | null;
  due_date: string | null;
}

export interface TemplateTaskList {
  id: string;
  organization_id: string;
  template_id: string;
  template_milestone_id: string | null;
  name: string;
  sort_order: number;
  gantt_enabled: boolean;
  start_date: string | null;
  end_date: string | null;
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
  start_date: string | null;
  due_date: string | null;
  assignee_person_id: string | null;
  is_client_review: boolean;
  is_divider: boolean;
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
  /** R2 attachment for profile photo (supabase + R2). */
  avatar_attachment_id: string | null;
  /**
   * When true, omit from schedule rows (management-only or project-basis
   * contractors who are not part of resource planning).
   */
  hide_from_schedule: boolean;
  /**
   * When true, omit from utilization/capacity aggregates. Auto-forced when
   * hide_from_schedule is true.
   */
  hide_from_utilization: boolean;
  /** External staff tag; may use project-basis budget terms when not FT-style. */
  is_contractor: boolean;
  /** Initials circle background when avatar_url is empty (client palette hex). */
  avatar_color: string | null;
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
  /** When the assignment row was first created. */
  created_at: string;
  edited_at: string | null;
  edited_by_profile_id: string | null;
}

/** Per-project contractor compensation mode. */
export type ContractorMode = "fixed_fee" | "hours" | "scheduled";

/** Explicit project team roster (may also appear via schedule/tasks). */
export interface ProjectMember {
  project_id: string;
  person_id: string;
  organization_id: string;
  /** Project-basis contractor compensation mode (null for staff / FT-style). */
  contractor_mode: ContractorMode | null;
  contractor_fixed_fee: number | null;
  contractor_hours: number | null;
}

/** Per-user starred project (nav tabs + sidebars). */
export interface ProjectFavorite {
  id: string;
  organization_id: string;
  profile_id: string;
  project_id: string;
  sort_order: number;
  created_at: string;
}

/** Org-level people grouping for filters and dashboard scope. */
export interface Pod {
  id: string;
  organization_id: string;
  name: string;
  manager_person_id: string | null;
  sort_order: number;
}

export interface PodMember {
  pod_id: string;
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
  /** Bulletin ids still unread for the current session profile. */
  unread_bulletin_ids: string[];
  /** System bulletin ids hidden from this profile's board. */
  dismissed_bulletin_ids: string[];
  /** Mention inbox rows (comment_id + person). Orange unread when read_at is null. */
  unread_mentions: {
    comment_id: string;
    person_id: string;
    read_at?: string | null;
  }[];
  /** Tasks with unread assigner ↔ assignee comment thread for a person. */
  unread_task_threads: { task_id: string; person_id: string }[];
  /** Current profile's starred projects (sort_order = nav tab order). */
  project_favorites: ProjectFavorite[];
  pods: Pod[];
  pod_members: PodMember[];
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
  /** Project-basis contractor commitment + scheduled hours (green). */
  contractorHours: number;
  contractorAmount: number;
  contractorUsedHours: number;
  contractorFutureHours: number;
  contractorUsedAmount: number;
  contractorFutureAmount: number;
}

export type CapacityLevel =
  | "low"
  | "healthy"
  | "near"
  | "over"
  | "unavailable";
