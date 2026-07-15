"use client";

import Link from "next/link";
import { useState } from "react";
import { Topbar } from "@/components/nav/topbar";
import { ProjectForm, COLORS } from "@/components/projects/project-form";
import { BurnBar } from "@/components/ui/burn-bar";
import { MonthlyRetainerChart } from "@/components/projects/monthly-retainer-chart";
import { EmptyState, Modal } from "@/components/ui/form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import {
  budgetBurn,
  budgetHealth,
  calendarYearHourBars,
} from "@/lib/domain/budget";
import { sortProjectsByClientThenName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { Project } from "@/lib/types";

function emptyProject(id: string): Omit<Project, "organization_id"> {
  return {
    id,
    client_id: null,
    name: "",
    status: "active",
    priority: 3,
    color: COLORS[0],
    start_date: null,
    end_date: null,
    budget_hours: 80,
    budget_amount: null,
    budget_mode: "hours",
    budget_monthly_reset: false,
    notes: "",
  };
}

export default function ProjectsPage() {
  const { state, upsertProject, newId } = useData();
  const { push } = useToast();
  const [editing, setEditing] = useState<Omit<Project, "organization_id"> | null>(
    null,
  );
  const projects = sortProjectsByClientThenName(state.projects, state.clients);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Topbar
        title="Projects"
        actions={
          <button
            type="button"
            className="h-8 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
            onClick={() => setEditing(emptyProject(newId("proj")))}
          >
            Add project
          </button>
        }
      />
      <div className="p-5">
        {state.projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            cta="Create your first project"
            onClick={() => setEditing(emptyProject(newId("proj")))}
          />
        ) : (
          <div className="grid gap-3">
            {projects.map((project) => {
              const burn = budgetBurn(project, state.assignments, state.people);
              const client = state.clients.find((c) => c.id === project.client_id);
              const health = budgetHealth(burn);
              const yearBars =
                project.budget_mode === "hours" && project.budget_monthly_reset
                  ? calendarYearHourBars(project, state.assignments)
                  : null;
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="rounded-md border border-[var(--border)] p-4 hover:bg-[var(--row-hover)]"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: project.color }}
                    />
                    <span className="text-sm font-semibold">{project.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {client?.name ?? "No client"}
                    </span>
                    <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                      {project.status.replace("_", " ")}
                    </span>
                    {project.budget_monthly_reset ? (
                      <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                        Monthly
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "ml-auto text-xs",
                        health === "over" && "text-[var(--status-over)]",
                        health === "near" && "text-[var(--status-near)]",
                        health === "healthy" && "text-[var(--text-muted)]",
                      )}
                    >
                      Total {burn.totalHours}h
                    </span>
                  </div>
                  <BurnBar burn={burn} />
                  {yearBars ? (
                    <div
                      className="mt-4"
                      onClick={(e) => e.preventDefault()}
                    >
                      <MonthlyRetainerChart
                        bars={yearBars}
                        budgetHours={project.budget_hours ?? 0}
                      />
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <Modal
          title={editing.name ? "Edit project" : "Add project"}
          onClose={() => setEditing(null)}
        >
          <ProjectForm
            project={editing}
            clients={state.clients}
            onChange={setEditing}
            onSave={async () => {
              if (!editing.name.trim()) return;
              if (
                editing.budget_mode === "hours" &&
                !(editing.budget_hours && editing.budget_hours > 0)
              ) {
                return;
              }
              if (
                editing.budget_mode === "amount" &&
                (editing.budget_amount == null || editing.budget_amount < 0)
              ) {
                return;
              }
              try {
                await upsertProject({
                  ...editing,
                  budget_hours:
                    editing.budget_mode === "hours"
                      ? editing.budget_hours
                      : null,
                  budget_amount:
                    editing.budget_mode === "amount"
                      ? editing.budget_amount
                      : null,
                  budget_monthly_reset:
                    editing.budget_mode === "hours"
                      ? editing.budget_monthly_reset
                      : false,
                });
                setEditing(null);
                push("Project saved");
              } catch (err) {
                push(
                  err instanceof Error ? err.message : "Could not save project",
                  "warning",
                );
              }
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
