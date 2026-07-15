"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Topbar } from "@/components/nav/topbar";
import { BurnBar } from "@/components/ui/burn-bar";
import { Field, Modal, ConfirmDialog, inputClass } from "@/components/ui/form";
import { ProjectForm } from "@/components/projects/project-form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import {
  assignmentHours,
  budgetBurn,
  formatHours,
  formatMoney,
} from "@/lib/domain/budget";
import { projectForecast } from "@/lib/domain/forecast";
import type { Milestone } from "@/lib/types";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state, upsertProject, deleteProject, upsertMilestone, deleteMilestone, newId } =
    useData();
  const { push } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState<Omit<
    Milestone,
    "organization_id"
  > | null>(null);

  const project = state.projects.find((p) => p.id === params.id);

  const allocations = useMemo(() => {
    if (!project) return [];
    return state.assignments
      .filter((a) => a.project_id === project.id)
      .map((a) => ({
        assignment: a,
        person: state.people.find((p) => p.id === a.person_id),
        hours: assignmentHours(a),
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [project, state.assignments, state.people]);

  if (!project) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Topbar title="Project" />
        <div className="p-5 text-sm text-[var(--text-muted)]">
          Project not found.{" "}
          <Link href="/projects" className="text-[var(--accent)]">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const burn = budgetBurn(project, state.assignments, state.people);
  const forecast = projectForecast(project, state.assignments, state.people);
  const client = state.clients.find((c) => c.id === project.client_id);
  const milestones = state.milestones.filter((m) => m.project_id === project.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Topbar
        title={project.name}
        actions={
          <>
            <Link
              href="/schedule"
              className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-sm"
            >
              Schedule
            </Link>
            <button
              type="button"
              className="h-8 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          </>
        }
      />
      <div className="space-y-4 p-5">
        <section className="rounded-md border border-[var(--border)] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: project.color }}
            />
            <span className="text-xs text-[var(--text-muted)]">
              {client?.name ?? "No client"} · {project.status.replace("_", " ")}
            </span>
          </div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">
              {burn.mode === "none"
                ? "Budget"
                : burn.mode === "amount"
                  ? "Dollar budget"
                  : project.budget_monthly_reset
                    ? "Monthly hours budget"
                    : "Hours budget"}
            </h2>
            <span className="text-sm text-[var(--text-muted)]">
              {burn.mode === "none"
                ? "No budget tracking"
                : burn.mode === "amount"
                  ? `${formatMoney(burn.plannedAmount)} planned · ${formatMoney(Math.max(0, burn.remainingAmount ?? 0))} remaining of ${formatMoney(burn.totalAmount ?? 0)}`
                  : `${formatHours(burn.plannedHours)} planned · ${formatHours(Math.max(0, burn.remainingHours))} remaining of ${formatHours(burn.totalHours)}`}
            </span>
          </div>
          <BurnBar burn={burn} />
          {project.notes && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">{project.notes}</p>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-md border border-[var(--border)] p-4 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold">Allocations</h2>
            {allocations.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No assignments yet.{" "}
                <Link href="/schedule" className="text-[var(--accent)]">
                  Book on the schedule
                </Link>
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-[var(--text-muted)]">
                  <tr>
                    <th className="pb-2 font-medium">Person</th>
                    <th className="pb-2 font-medium">Dates</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map(({ assignment, person, hours }) => (
                    <tr
                      key={assignment.id}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="py-2">{person?.name ?? "—"}</td>
                      <td className="py-2 text-[var(--text-muted)]">
                        {assignment.start_date} → {assignment.end_date} ·{" "}
                        {assignment.hours_per_day}h/d
                      </td>
                      <td className="py-2 capitalize">{assignment.status}</td>
                      <td className="py-2 text-right">
                        {formatHours(hours)}
                        {assignment.status === "tentative" && (
                          <span className="ml-1 text-xs text-[var(--text-muted)]">
                            (not burned)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-md border border-[var(--border)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Forecast $</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Revenue</dt>
                <dd>{formatMoney(forecast.revenue)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Cost</dt>
                <dd>{formatMoney(forecast.cost)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Margin</dt>
                <dd>
                  {formatMoney(forecast.margin)} (
                  {forecast.marginPct.toFixed(0)}%)
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="rounded-md border border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Milestones</h2>
            <button
              type="button"
              className="text-xs text-[var(--accent)]"
              onClick={() =>
                setMilestoneForm({
                  id: newId("ms"),
                  project_id: project.id,
                  name: "",
                  due_date: new Date().toISOString().slice(0, 10),
                  status: "upcoming",
                })
              }
            >
              Add milestone
            </button>
          </div>
          {milestones.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No milestones yet.</p>
          ) : (
            <ul className="space-y-2">
              {milestones.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {m.due_date} · {m.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-[var(--text-muted)]"
                    onClick={() => {
                      deleteMilestone(m.id);
                      push("Milestone deleted");
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing && (
        <Modal title="Edit project" onClose={() => setEditing(false)}>
          <ProjectForm
            project={project}
            clients={state.clients}
            onChange={(p) => upsertProject(p)}
            onSave={() => {
              setEditing(false);
              push("Project saved");
            }}
            onCancel={() => setEditing(false)}
            onDelete={() => setConfirmDelete(true)}
          />
        </Modal>
      )}

      {confirmDelete && project && (
        <ConfirmDialog
          title="Delete project?"
          message={`Delete ${project.name}? All assignments and milestones on this project will be removed. This can’t be undone.`}
          confirmLabel="Delete project"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            deleteProject(project.id);
            setConfirmDelete(false);
            setEditing(false);
            push("Project deleted");
            router.push("/projects");
          }}
        />
      )}

      {milestoneForm && (
        <Modal title="Add milestone" onClose={() => setMilestoneForm(null)}>
          <div className="grid gap-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={milestoneForm.name}
                onChange={(e) =>
                  setMilestoneForm({ ...milestoneForm, name: e.target.value })
                }
              />
            </Field>
            <Field label="Due date">
              <input
                type="date"
                className={inputClass}
                value={milestoneForm.due_date}
                onChange={(e) =>
                  setMilestoneForm({
                    ...milestoneForm,
                    due_date: e.target.value,
                  })
                }
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
                onClick={() => setMilestoneForm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
                onClick={() => {
                  if (!milestoneForm.name.trim()) return;
                  upsertMilestone(milestoneForm);
                  setMilestoneForm(null);
                  push("Milestone saved");
                }}
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
