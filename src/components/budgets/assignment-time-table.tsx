"use client";

import { PersonAvatar } from "@/components/people/person-avatar";
import {
  formatAssignmentTimeDateRange,
  formatAssignmentTimeHours,
  type AssignmentTimeMonthSection,
  type AssignmentTimeRow,
} from "@/lib/domain/assignment-time-report";
import { personAvatarColor } from "@/lib/domain/people";
import { cn } from "@/lib/cn";
import type { Person } from "@/lib/types";

function statusLabel(status: AssignmentTimeRow["status"]): string {
  return status === "completed" ? "Completed" : "Planned Estimate";
}

function AssignmentTimeBodyRows({
  rows,
  peopleById,
  totalLabel,
}: {
  rows: AssignmentTimeRow[];
  peopleById: Map<string, Person>;
  totalLabel: string;
}) {
  return (
    <>
      {rows.map((row) => {
        if (row.kind === "total") {
          return (
            <tr
              key={row.id}
              className="border-t-4 border-[var(--border)] bg-[var(--bg-elevated)]"
            >
              <td
                colSpan={4}
                className="px-3 py-2.5 text-sm font-semibold"
              >
                Total Hours · {totalLabel}
              </td>
              <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                {formatAssignmentTimeHours(row.hours)}
              </td>
            </tr>
          );
        }

        const person = row.personId ? peopleById.get(row.personId) : undefined;
        const planned = row.status === "planned";
        const isFooter = row.kind === "project_management";

        return (
          <tr
            key={row.id}
            className={cn(
              "border-t border-[var(--border)]",
              planned && "bg-[var(--bg-elevated)]/40",
              isFooter && "border-t-4 border-[var(--border)]",
            )}
          >
            <td
              className={cn(
                "whitespace-nowrap px-3 py-2.5 text-sm",
                planned && "text-[var(--text-muted)]",
              )}
            >
              {formatAssignmentTimeDateRange(row.startDate, row.endDate)}
            </td>
            <td className="px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                {person ? (
                  <PersonAvatar
                    avatarUrl={person.avatar_url}
                    avatarAttachmentId={person.avatar_attachment_id}
                    name={person.name}
                    size="row"
                    fallback="initials"
                    personId={person.id}
                    color={personAvatarColor(person)}
                  />
                ) : (
                  <span className="inline-flex h-7 w-7 shrink-0 rounded-full bg-[var(--border)]" />
                )}
                <span
                  className={cn(
                    "min-w-0 truncate text-sm font-medium",
                    planned && "text-[var(--text-muted)]",
                  )}
                >
                  {row.personName}
                </span>
              </div>
            </td>
            <td
              className={cn(
                "px-3 py-2.5 text-sm",
                planned && "text-[var(--text-muted)]",
              )}
            >
              {row.taskLabels.length === 0 ? (
                <span className="text-[var(--text-muted)]">—</span>
              ) : row.taskLabels.length === 1 &&
                (row.taskLabels[0] === "Production Time" ||
                  row.taskLabels[0] === "Project Management time") ? (
                <span>{row.taskLabels[0]}</span>
              ) : (
                <ul className="list-disc space-y-0.5 pl-4">
                  {row.taskLabels.map((label, i) => (
                    <li key={`${row.id}-${i}`}>{label}</li>
                  ))}
                </ul>
              )}
            </td>
            <td
              className={cn(
                "whitespace-nowrap px-3 py-2.5 text-sm",
                planned
                  ? "font-medium text-[var(--status-near)]"
                  : "text-[var(--status-healthy)]",
              )}
            >
              {statusLabel(row.status)}
            </td>
            <td
              className={cn(
                "whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums",
                planned && "text-[var(--text-muted)]",
                isFooter && "font-medium",
              )}
            >
              {formatAssignmentTimeHours(row.hours)}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function AssignmentTimeTable({
  sections,
  people,
  termMode = false,
}: {
  sections: AssignmentTimeMonthSection[];
  people: Person[];
  /** When true, show month headings and label totals as Contract Term aggregate context. */
  termMode?: boolean;
}) {
  const peopleById = new Map(people.map((p) => [p.id, p]));

  if (sections.length === 0) return null;

  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
      <h2 className="mb-3 text-sm font-semibold">Assignment Time</h2>
      <div className="min-w-0 space-y-6 overflow-x-auto">
        {sections.map((section) => {
          const totalLabel = termMode ? section.monthLabel : section.monthLabel;
          return (
            <div key={section.monthKey}>
              {termMode || sections.length > 1 ? (
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {section.monthLabel}
                </h3>
              ) : null}
              <div className="min-w-0 overflow-auto rounded-md border border-[var(--border)]">
                <table className="w-full min-w-[48rem] text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--bg)] text-xs text-[var(--text-muted)]">
                      <th className="px-3 py-2.5 font-medium">Date</th>
                      <th className="px-3 py-2.5 font-medium">Team Member</th>
                      <th className="px-3 py-2.5 font-medium">Tasks</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 text-right font-medium">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.some((r) => r.kind === "assignment" || r.kind === "contractor") ||
                    section.pmHours > 0 ? (
                      <AssignmentTimeBodyRows
                        rows={section.rows}
                        peopleById={peopleById}
                        totalLabel={totalLabel}
                      />
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          className="border-t border-[var(--border)] px-3 py-4 text-sm text-[var(--text-muted)]"
                        >
                          No schedule assignments in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {termMode && sections.length > 1 ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm font-semibold">
            <div className="flex justify-between gap-2">
              <span>Total Hours · Contract Term</span>
              <span className="tabular-nums">
                {formatAssignmentTimeHours(
                  sections.reduce((sum, s) => sum + s.totalHours, 0),
                )}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
