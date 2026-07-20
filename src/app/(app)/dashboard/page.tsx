"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import { LeaveMonthCalendar } from "@/components/dashboard/leave-month-calendar";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { BurnBar } from "@/components/ui/burn-bar";
import { CapacityBar } from "@/components/ui/capacity-bar";
import {
  ConfirmDialog,
  Field,
  Modal,
  inputClass,
} from "@/components/ui/form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { useViewAs } from "@/lib/view-as";
import { budgetBurn, budgetHealth } from "@/lib/domain/budget";
import {
  capacityLevel,
  personBookedHoursInRange,
  availableHoursInRange,
} from "@/lib/domain/capacity";
import {
  endOfMonth,
  startOfMonth,
  toDateKey,
  weekEnd,
  weekStart,
} from "@/lib/domain/dates";
import { leaveBlockLabel } from "@/lib/domain/leave";
import { leaveBlocksInRange } from "@/lib/domain/leave-blocks";
import { projectDisplayColor, sortPeopleByName } from "@/lib/domain/sorting";
import { taskUrgency, type TaskUrgency } from "@/lib/domain/tasks";
import { cn } from "@/lib/cn";
import type { Bulletin, Person, Profile, Project, Task } from "@/lib/types";

const URGENCY_GROUPS: { key: TaskUrgency; label: string }[] = [
  { key: "today", label: "Due today" },
  { key: "tomorrow", label: "Due tomorrow" },
  { key: "three_days", label: "Due in 3 days" },
  { key: "week", label: "Due this week" },
];

function bulletinVisibleToPerson(
  bulletin: Bulletin,
  personId: string | null,
): boolean {
  if (bulletin.audience === "all") return true;
  if (!personId) return false;
  return bulletin.audience_person_ids.includes(personId);
}

export default function DashboardPage() {
  const {
    state,
    canManage,
    myPerson,
    profile,
    upsertBulletin,
    deleteBulletin,
    newId,
  } = useData();
  const { push } = useToast();
  const appHref = useAppHref();
  const {
    viewAsPersonId,
    setViewAsPersonId,
    viewedPerson: viewAsPerson,
    showingAsManager,
    effectivePersonId,
  } = useViewAs();
  const now = useMemo(() => new Date(), []);
  const todayKey = toDateKey(now);
  const start = toDateKey(weekStart(now));
  const end = toDateKey(weekEnd(now));
  const monthStart = startOfMonth(now);
  const monthEndKey = toDateKey(endOfMonth(now));
  const monthStartKey = toDateKey(monthStart);

  const showingAllTasks = showingAsManager;
  const viewedPersonId = effectivePersonId;

  /** Right-column identity: View As person, else linked person. */
  const identityPerson = viewAsPerson ?? myPerson;

  const projectById = useMemo(
    () => new Map(state.projects.map((p) => [p.id, p])),
    [state.projects],
  );

  const scopedTasks = useMemo(() => {
    if (showingAllTasks) return state.tasks;
    if (!viewedPersonId) return [];
    return state.tasks.filter((t) => t.assignee_person_id === viewedPersonId);
  }, [state.tasks, showingAllTasks, viewedPersonId]);

  const overdueTasks = useMemo(
    () =>
      scopedTasks
        .filter(
          (t) =>
            t.status !== "complete" && t.due_date && t.due_date < todayKey,
        )
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")),
    [scopedTasks, todayKey],
  );

  const urgentByGroup = useMemo(() => {
    const map = new Map<TaskUrgency, Task[]>();
    for (const t of scopedTasks) {
      if (t.status === "complete" || !t.due_date || t.due_date < todayKey) {
        continue;
      }
      const urgency = taskUrgency(t.due_date, todayKey);
      if (urgency === "none" || urgency === "overdue") continue;
      const list = map.get(urgency) ?? [];
      list.push(t);
      map.set(urgency, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
    }
    return map;
  }, [scopedTasks, todayKey]);

  const urgentTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of urgentByGroup.values()) {
      for (const t of list) ids.add(t.id);
    }
    return ids;
  }, [urgentByGroup]);

  const highPriorityTasks = useMemo(
    () =>
      scopedTasks.filter((t) => {
        if (t.status === "complete") return false;
        if (urgentTaskIds.has(t.id)) return false;
        if (overdueTasks.some((o) => o.id === t.id)) return false;
        const project = projectById.get(t.project_id);
        return Boolean(project && project.priority <= 2);
      }),
    [scopedTasks, urgentTaskIds, overdueTasks, projectById],
  );

  const pinnedTotal =
    overdueTasks.length +
    [...urgentByGroup.values()].reduce((sum, l) => sum + l.length, 0) +
    highPriorityTasks.length;

  const bulletins = useMemo(() => {
    const filtered = canManage
      ? state.bulletins
      : state.bulletins.filter((b) =>
          bulletinVisibleToPerson(b, myPerson?.id ?? null),
        );
    return [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [state.bulletins, canManage, myPerson?.id]);

  const atRisk = canManage
    ? state.projects
        .map((p) => ({
          project: p,
          burn: budgetBurn(p, state.assignments, state.people),
          client: p.client_id
            ? state.clients.find((c) => c.id === p.client_id)
            : undefined,
        }))
        .filter(({ burn }) => {
          const health = budgetHealth(burn);
          return health === "over" || health === "near";
        })
        .sort((a, b) => b.burn.pct - a.burn.pct)
    : [];

  const peopleLoad = useMemo(() => {
    const source = canManage
      ? state.people
      : myPerson
        ? [myPerson]
        : [];
    return source
      .map((person) => {
        const booked = personBookedHoursInRange(
          person.id,
          start,
          end,
          state.assignments,
          state.leave_days,
        );
        const available = availableHoursInRange(
          person,
          start,
          end,
          state.leave_days,
        );
        return {
          person,
          booked,
          available,
          level: capacityLevel(booked, available, available <= 0),
        };
      })
      .sort(
        (a, b) =>
          b.booked / Math.max(b.available, 1) -
          a.booked / Math.max(a.available, 1),
      );
  }, [
    canManage,
    myPerson,
    state.people,
    state.assignments,
    state.leave_days,
    start,
    end,
  ]);

  const leaveHorizonEnd = monthEndKey > end ? monthEndKey : end;
  const upcomingLeaveBlocks = state.people
    .flatMap((person) =>
      leaveBlocksInRange(state.leave_days, person.id, start, leaveHorizonEnd),
    )
    .filter((b) => b.end_date >= start)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 12);

  const monthLeave = state.leave_days.filter(
    (l) =>
      l.status === "approved" &&
      l.date >= monthStartKey &&
      l.date <= monthEndKey,
  );

  const sortedPeople = sortPeopleByName(state.people);

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader
        title="Dashboard"
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="view-as-person">
                View as
              </label>
              <select
                id="view-as-person"
                className={cn(inputClass, "mt-0 h-8 w-[10.5rem] py-0 text-xs")}
                value={viewAsPersonId ?? ""}
                onChange={(e) => setViewAsPersonId(e.target.value || null)}
              >
                <option value="">View as…</option>
                {sortedPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {viewAsPersonId ? (
                <button
                  type="button"
                  className="cursor-pointer text-xs text-[var(--accent)]"
                  onClick={() => setViewAsPersonId(null)}
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      />
      <div className="grid gap-4 p-3 sm:p-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <BulletinBoard
            bulletins={bulletins}
            profiles={state.profiles}
            people={sortedPeople}
            canManage={canManage}
            profileId={profile?.id ?? null}
            onSave={(row) => {
              upsertBulletin(row);
              push("Bulletin saved");
            }}
            onDelete={(id) => {
              deleteBulletin(id);
              push("Bulletin deleted");
            }}
            newId={newId}
          />

          <TaskPulse
            overdue={overdueTasks}
            urgentByGroup={urgentByGroup}
            highPriority={highPriorityTasks}
            total={pinnedTotal}
            projectById={projectById}
            appHref={appHref}
          />

          {canManage ? (
            <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Budget at risk</h2>
                <Link
                  href={appHref("/reports/budgets")}
                  className="text-xs text-[var(--accent)]"
                >
                  View budgets
                </Link>
              </div>
              {atRisk.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  All active project totals look healthy this week.
                </p>
              ) : (
                <div className="space-y-3">
                  {atRisk.map(({ project, burn, client }) => (
                    <Link
                      key={project.id}
                      href={appHref(`/projects/${project.id}`)}
                      className="block rounded-md border border-[var(--border)] p-3 hover:bg-[var(--row-hover)]"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            background: projectDisplayColor(
                              project,
                              state.clients,
                            ),
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {project.name}
                          </div>
                          <div className="truncate text-xs text-[var(--text-muted)]">
                            {client?.name ?? "No client"}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-xs",
                            budgetHealth(burn) === "over"
                              ? "text-[var(--status-over)]"
                              : "text-[var(--status-near)]",
                          )}
                        >
                          {budgetHealth(burn) === "over"
                            ? "Over total"
                            : "Near total"}
                        </span>
                      </div>
                      <BurnBar burn={burn} />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-1">
          {identityPerson ? (
            <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="flex flex-col items-start gap-3">
                <PersonAvatar
                  avatarUrl={identityPerson.avatar_url}
                  name={identityPerson.name}
                  size="xl"
                />
                <div>
                  <div className="text-sm font-semibold">
                    {identityPerson.name}
                  </div>
                  {identityPerson.role_title ? (
                    <div className="text-xs text-[var(--text-muted)]">
                      {identityPerson.role_title}
                    </div>
                  ) : null}
                  {viewAsPerson && canManage ? (
                    <div className="mt-1 text-[11px] text-[var(--accent)]">
                      Viewing as
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">This week&apos;s load</h2>
              <Link
                href={appHref("/schedule")}
                className="text-xs text-[var(--accent)]"
              >
                Open schedule
              </Link>
            </div>
            {peopleLoad.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No capacity data yet.
              </p>
            ) : (
              <div className="space-y-3">
                {peopleLoad.map(({ person, booked, available, level }) => (
                  <CapacityBar
                    key={person.id}
                    label={canManage ? person.name : "You"}
                    booked={booked}
                    available={available}
                    level={level}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Upcoming leave</h2>
            <div className="space-y-4">
              <LeaveMonthCalendar
                month={monthStart}
                leaveDays={monthLeave}
                people={state.people}
              />
              {upcomingLeaveBlocks.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No approved leave ahead.
                </p>
              ) : (
                <div className="space-y-2">
                  {upcomingLeaveBlocks.map((block) => {
                    const person = state.people.find(
                      (p) => p.id === block.person_id,
                    );
                    const rangeLabel =
                      block.start_date === block.end_date
                        ? format(parseISO(block.start_date), "MMM d")
                        : `${format(parseISO(block.start_date), "MMM d")} – ${format(parseISO(block.end_date), "MMM d")}`;
                    return (
                      <div
                        key={`${block.id}-${block.start_date}`}
                        className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                      >
                        <div className="font-medium">
                          {person?.name ?? "Person"}
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {rangeLabel} ·{" "}
                          {leaveBlockLabel(block.kind, block.hours_per_day)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </PageContainer>
  );
}

function TaskRow({
  task,
  project,
  overdue,
  appHref,
}: {
  task: Task;
  project: Project | undefined;
  overdue: boolean;
  appHref: (path: string) => string;
}) {
  return (
    <Link
      href={appHref(`/projects/${task.project_id}`)}
      className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--row-hover)]"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: project?.color ?? "#64748B" }}
      />
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      <span className="shrink-0 truncate text-xs text-[var(--text-muted)]">
        {project?.name ?? "Project"}
      </span>
      {task.due_date ? (
        <span
          className={cn(
            "shrink-0 text-xs",
            overdue
              ? "font-medium text-[var(--status-over)]"
              : "text-[var(--text-muted)]",
          )}
        >
          {overdue ? "Overdue" : task.due_date}
        </span>
      ) : null}
    </Link>
  );
}

function TaskPulse({
  overdue,
  urgentByGroup,
  highPriority,
  total,
  projectById,
  appHref,
}: {
  overdue: Task[];
  urgentByGroup: Map<TaskUrgency, Task[]>;
  highPriority: Task[];
  total: number;
  projectById: Map<string, Project>;
  appHref: (path: string) => string;
}) {
  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Pin size={14} className="text-[var(--text-muted)]" />
        <h2 className="text-sm font-semibold">Task pulse</h2>
        {total > 0 ? (
          <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
            {total}
          </span>
        ) : null}
      </div>
      {total === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Nothing overdue or urgent right now.
        </p>
      ) : (
        <div className="space-y-3">
          {overdue.length > 0 ? (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--status-over)]">
                <AlertTriangle size={12} />
                Overdue
              </div>
              <div className="space-y-1.5">
                {overdue.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    project={projectById.get(t.project_id)}
                    overdue
                    appHref={appHref}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {URGENCY_GROUPS.map(({ key, label }) => {
            const tasks = urgentByGroup.get(key);
            if (!tasks || tasks.length === 0) return null;
            return (
              <div key={key}>
                <div className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                  {label}
                </div>
                <div className="space-y-1.5">
                  {tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      project={projectById.get(t.project_id)}
                      overdue={false}
                      appHref={appHref}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {highPriority.length > 0 ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                High priority
              </div>
              <div className="space-y-1.5">
                {highPriority.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    project={projectById.get(t.project_id)}
                    overdue={false}
                    appHref={appHref}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

type BulletinDraft = Omit<Bulletin, "organization_id">;

function emptyBulletin(id: string, profileId: string | null): BulletinDraft {
  return {
    id,
    project_id: null,
    title: "",
    body: "",
    pinned: false,
    audience: "all",
    audience_person_ids: [],
    created_by_profile_id: profileId,
    created_at: new Date().toISOString(),
  };
}

function BulletinBoard({
  bulletins,
  profiles,
  people,
  canManage,
  profileId,
  onSave,
  onDelete,
  newId,
}: {
  bulletins: Bulletin[];
  profiles: Profile[];
  people: Person[];
  canManage: boolean;
  profileId: string | null;
  onSave: (row: BulletinDraft) => void;
  onDelete: (id: string) => void;
  newId: (prefix: string) => string;
}) {
  const [editing, setEditing] = useState<BulletinDraft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone size={14} className="text-[var(--text-muted)]" />
          <h2 className="text-sm font-semibold">Bulletin board</h2>
        </div>
        {canManage ? (
          <button
            type="button"
            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-[var(--accent)] hover:bg-[var(--row-hover)]"
            onClick={() =>
              setEditing(emptyBulletin(newId("bulletin"), profileId))
            }
          >
            <Plus size={12} />
            New
          </button>
        ) : null}
      </div>
      {bulletins.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No announcements yet.</p>
      ) : (
        <ul className="space-y-2">
          {bulletins.slice(0, 8).map((b) => {
            const author = profiles.find(
              (p) => p.id === b.created_by_profile_id,
            );
            return (
              <li
                key={b.id}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  b.pinned
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                    : "border-[var(--border)]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      {b.pinned ? (
                        <Pin size={11} className="text-[var(--accent)]" />
                      ) : null}
                      {b.title}
                    </div>
                    {b.body ? (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {b.body}
                      </p>
                    ) : null}
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {b.created_at.slice(0, 10)}
                      {author ? ` · ${author.full_name}` : ""}
                      {b.audience === "people"
                        ? ` · ${b.audience_person_ids.length} people`
                        : " · Everyone"}
                    </div>
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                        aria-label="Edit bulletin"
                        onClick={() =>
                          setEditing({
                            id: b.id,
                            project_id: b.project_id,
                            title: b.title,
                            body: b.body,
                            pinned: b.pinned,
                            audience: b.audience,
                            audience_person_ids: [...b.audience_person_ids],
                            created_by_profile_id: b.created_by_profile_id,
                            created_at: b.created_at,
                          })
                        }
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--status-over)]"
                        aria-label="Delete bulletin"
                        onClick={() => setConfirmDeleteId(b.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <Modal
          title={
            bulletins.some((b) => b.id === editing.id)
              ? "Edit bulletin"
              : "New bulletin"
          }
          onClose={() => setEditing(null)}
        >
          <div className="grid gap-3">
            <Field label="Title">
              <input
                className={inputClass}
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </Field>
            <Field label="Body">
              <textarea
                className={cn(inputClass, "h-24 py-2")}
                value={editing.body}
                onChange={(e) =>
                  setEditing({ ...editing, body: e.target.value })
                }
              />
            </Field>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.pinned}
                onChange={(e) =>
                  setEditing({ ...editing, pinned: e.target.checked })
                }
              />
              Pin to top
            </label>
            <Field label="Audience">
              <select
                className={inputClass}
                value={editing.audience}
                onChange={(e) => {
                  const audience = e.target.value === "people" ? "people" : "all";
                  setEditing({
                    ...editing,
                    audience,
                    audience_person_ids:
                      audience === "all" ? [] : editing.audience_person_ids,
                  });
                }}
              >
                <option value="all">All users</option>
                <option value="people">Selected people</option>
              </select>
            </Field>
            {editing.audience === "people" ? (
              <Field label="People">
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-[var(--border)] p-2">
                  {people.map((p) => {
                    const checked = editing.audience_person_ids.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...editing.audience_person_ids, p.id]
                              : editing.audience_person_ids.filter(
                                  (id) => id !== p.id,
                                );
                            setEditing({
                              ...editing,
                              audience_person_ids: ids,
                            });
                          }}
                        />
                        {p.name}
                      </label>
                    );
                  })}
                </div>
              </Field>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
                onClick={() => {
                  if (!editing.title.trim()) return;
                  if (
                    editing.audience === "people" &&
                    editing.audience_person_ids.length === 0
                  ) {
                    return;
                  }
                  onSave({
                    ...editing,
                    title: editing.title.trim(),
                    created_by_profile_id:
                      editing.created_by_profile_id ?? profileId,
                  });
                  setEditing(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <ConfirmDialog
          title="Delete bulletin?"
          message="This announcement will be removed for everyone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => {
            onDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
        />
      ) : null}
    </section>
  );
}
