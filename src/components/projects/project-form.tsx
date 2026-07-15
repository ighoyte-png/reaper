"use client";

import { Field, inputClass } from "@/components/ui/form";
import { ColorPicker, PRESET_COLORS } from "@/components/ui/color-picker";
import type { BudgetMode, Project, ProjectStatus } from "@/lib/types";

export function ProjectForm({
  project,
  clients,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  project: Omit<Project, "organization_id">;
  clients: { id: string; name: string; color?: string }[];
  onChange: (p: Omit<Project, "organization_id">) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const clientsSorted = [...clients].sort((a, b) =>
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
        <select
          className={inputClass}
          value={project.client_id ?? ""}
          onChange={(e) => {
            const clientId = e.target.value || null;
            const client = clientsSorted.find((c) => c.id === clientId);
            onChange({
              ...project,
              client_id: clientId,
              color: client?.color ?? project.color,
            });
          }}
        >
          <option value="">No client</option>
          {clientsSorted.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Budget type">
        <select
          className={inputClass}
          value={project.budget_mode}
          onChange={(e) => setMode(e.target.value as BudgetMode)}
        >
          <option value="none">None (internal / time-off tracking)</option>
          <option value="hours">Hourly (total hours bucket)</option>
          <option value="amount">Dollar amount (hours × bill rates)</option>
        </select>
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status">
          <select
            className={inputClass}
            value={project.status}
            onChange={(e) =>
              onChange({
                ...project,
                status: e.target.value as ProjectStatus,
              })
            }
          >
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
        <div className="block text-xs text-[var(--text-muted)]">
          Color
          <ColorPicker
            value={project.color}
            onChange={(color) => onChange({ ...project, color })}
          />
          <p className="mt-1 text-[11px]">
            Defaults to the client color when you pick a client
          </p>
        </div>
      </div>
      <Field label="Notes">
        <textarea
          className={`${inputClass} h-20 py-2`}
          value={project.notes}
          onChange={(e) => onChange({ ...project, notes: e.target.value })}
        />
      </Field>
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
            className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export { PRESET_COLORS as COLORS };
