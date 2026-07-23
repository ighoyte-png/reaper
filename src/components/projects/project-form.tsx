"use client";

import { Field, inputClass, DateInput } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import type {
  BudgetMode,
  Person,
  Project,
  ProjectStatus,
  ProjectTemplate,
} from "@/lib/types";

const DEFAULT_PROJECT_COLOR = "#3498DB";

export function ProjectForm({
  project,
  clients,
  people,
  memberIds,
  onMemberIdsChange,
  onChange,
  onSave,
  onCancel,
  onDelete,
  templates = [],
  templateId = "",
  onTemplateIdChange,
  showTemplateSelect = false,
}: {
  project: Omit<Project, "organization_id">;
  clients: { id: string; name: string; color?: string }[];
  people: Person[];
  memberIds: string[];
  onMemberIdsChange: (ids: string[]) => void;
  onChange: (p: Omit<Project, "organization_id">) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  templates?: ProjectTemplate[];
  templateId?: string;
  onTemplateIdChange?: (id: string) => void;
  /** When true, show optional template picker (new projects only). */
  showTemplateSelect?: boolean;
}) {
  const clientsSorted = [...clients].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const peopleSorted = [...people].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const templatesSorted = [...templates].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  function setMode(mode: BudgetMode) {
    onChange({
      ...project,
      budget_mode: mode,
      budget_hours: mode === "hours" ? (project.budget_hours ?? 80) : null,
      budget_amount: mode === "amount" ? (project.budget_amount ?? 0) : null,
      budget_monthly_reset:
        mode === "hours" ? Boolean(project.budget_monthly_reset) : false,
    });
  }

  return (
    <div className="grid gap-3">
      <Field label="Name">
        <input
          className={inputClass}
          value={project.name}
          onChange={(e) => onChange({ ...project, name: e.target.value })}
        />
      </Field>
      <Field label="Client">
        <Select
          searchable
          value={project.client_id ?? ""}
          onChange={(clientId) => {
            if (!clientId) return;
            const client = clientsSorted.find((c) => c.id === clientId);
            if (!client) return;
            onChange({
              ...project,
              client_id: clientId,
              color: client.color ?? DEFAULT_PROJECT_COLOR,
            });
          }}
          placeholder={
            clientsSorted.length === 0
              ? "Create a client first…"
              : "Select a client…"
          }
          options={[
            {
              value: "",
              label:
                clientsSorted.length === 0
                  ? "Create a client first…"
                  : "Select a client…",
              disabled: true,
            },
            ...clientsSorted.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Field>
      {showTemplateSelect && onTemplateIdChange ? (
        <Field label="Template">
          <Select
            searchable
            value={templateId}
            onChange={onTemplateIdChange}
            options={[
              { value: "", label: "None" },
              ...templatesSorted.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Applies milestones and tasks undated and unassigned after create.
          </p>
        </Field>
      ) : null}
      <Field label="Team members">
        <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-[var(--border)] p-2">
          {peopleSorted.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Add people in the directory first.
            </p>
          ) : (
            peopleSorted.map((p) => {
              const checked = memberIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      onMemberIdsChange(
                        e.target.checked
                          ? [...memberIds, p.id]
                          : memberIds.filter((id) => id !== p.id),
                      );
                    }}
                  />
                  <span className="min-w-0 truncate">
                    {p.name}
                    {p.role_title ? (
                      <span className="text-[var(--text-muted)]">
                        {" "}
                        · {p.role_title}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </Field>
      <Field label="Project manager">
        <Select
          searchable
          value={project.manager_person_id ?? ""}
          onChange={(v) =>
            onChange({
              ...project,
              manager_person_id: v || null,
            })
          }
          options={[
            { value: "", label: "None" },
            ...peopleSorted.map((p) => ({
              value: p.id,
              label: p.role_title ? `${p.name} · ${p.role_title}` : p.name,
            })),
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <DateInput
            className={inputClass}
            value={project.start_date ?? ""}
            onChange={(e) =>
              onChange({ ...project, start_date: e.target.value || null })
            }
          />
        </Field>
        <Field label="Completion date">
          <DateInput
            className={inputClass}
            value={project.end_date ?? ""}
            onChange={(e) =>
              onChange({ ...project, end_date: e.target.value || null })
            }
          />
        </Field>
      </div>
      <Field label="Budget type">
        <Select
          value={project.budget_mode}
          onChange={(v) => setMode(v as BudgetMode)}
          options={[
            {
              value: "none",
              label: "None (internal / time-off tracking)",
            },
            {
              value: "hours",
              label: "Hourly (total hours bucket)",
            },
            {
              value: "amount",
              label: "Dollar amount (hours × bill rates)",
            },
          ]}
        />
      </Field>
      {project.budget_mode === "hours" && (
        <>
          <Field label="Total budget (hours)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={project.budget_hours ?? ""}
              onChange={(e) =>
                onChange({
                  ...project,
                  budget_hours: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={Boolean(project.budget_monthly_reset)}
              onChange={(e) =>
                onChange({
                  ...project,
                  budget_monthly_reset: e.target.checked,
                })
              }
            />
            <span>
              Monthly reset
              <span className="block text-xs text-[var(--text-muted)]">
                Treat the hours budget as a recurring monthly retainer
              </span>
            </span>
          </label>
        </>
      )}
      {project.budget_mode === "amount" && (
        <Field label="Total budget ($)">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={project.budget_amount ?? ""}
            onChange={(e) =>
              onChange({
                ...project,
                budget_amount:
                  e.target.value === "" ? null : Number(e.target.value) || 0,
              })
            }
          />
        </Field>
      )}
      <Field label="Status">
        <Select
          value={project.status}
          onChange={(v) =>
            onChange({
              ...project,
              status: v as ProjectStatus,
            })
          }
          options={[
            { value: "active", label: "Active" },
            { value: "on_hold", label: "On hold" },
            { value: "completed", label: "Completed" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </Field>
      <Field label="Notes">
        <textarea
          className={`${inputClass} h-20 py-2`}
          value={project.notes}
          onChange={(e) => onChange({ ...project, notes: e.target.value })}
        />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={Boolean(project.hide_from_public_share)}
          onChange={(e) =>
            onChange({
              ...project,
              hide_from_public_share: e.target.checked,
            })
          }
        />
        <span>
          Hide Project From Public Share
          <span className="block text-xs text-[var(--text-muted)]">
            Omit this project from the org-wide public schedule and reports link
          </span>
        </span>
      </label>
      <div className="flex justify-between pt-2">
        {onDelete ? (
          <button
            type="button"
            className="text-sm text-[var(--status-over)]"
            onClick={onDelete}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)] disabled:opacity-40"
            disabled={!project.client_id || clientsSorted.length === 0}
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
