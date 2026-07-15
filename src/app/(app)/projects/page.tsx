"use client";

import Link from "next/link";
import { useState } from "react";
import { Topbar } from "@/components/nav/topbar";
import { ProjectForm, COLORS } from "@/components/projects/project-form";
import { BurnBar } from "@/components/ui/burn-bar";
import { EmptyState, Modal } from "@/components/ui/form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { budgetBurn, budgetHealth } from "@/lib/domain/budget";
import { cn } from "@/lib/cn";
import type { BudgetMode, Project } from "@/lib/types";

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
    notes: "",
  };
}

export default function ProjectsPage() {
  const { state, upsertProject, newId } = useData();
  const { push } = useToast();
  const [editing, setEditing] = useState<Omit<Project, "organization_id"> | null>(
    null,
  );

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
            {state.projects.map((project) => {
              const burn = budgetBurn(project, state.assignments, state.people);
              const client = state.clients.find((c) => c.id === project.client_id);
              const health = budgetHealth(burn);
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
            onSave={() => {
              if (!editing.name.trim() || editing.budget_hours <= 0) return;
              const mode: BudgetMode =
                editing.budget_amount != null ? "both" : "hours";
              upsertProject({ ...editing, budget_mode: mode });
              setEditing(null);
              push("Project saved");
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
