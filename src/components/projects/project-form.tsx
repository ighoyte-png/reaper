"use client";

import { Field, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { Project, ProjectStatus } from "@/lib/types";

const COLORS = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#06B6D4", // cyan
  "#EC4899", // pink
  "#F97316", // orange
  "#14B8A6", // teal
  "#84CC16", // lime
  "#6366F1", // indigo
  "#D946EF", // fuchsia
];

export function ProjectForm({
  project,
  clients,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  project: Omit<Project, "organization_id">;
  clients: { id: string; name: string }[];
  onChange: (p: Omit<Project, "organization_id">) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
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
          onChange={(e) =>
            onChange({
              ...project,
              client_id: e.target.value || null,
            })
          }
        >
          <option value="">No client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Total budget (hours)">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={project.budget_hours}
            onChange={(e) =>
              onChange({
                ...project,
                budget_hours: Number(e.target.value) || 0,
              })
            }
          />
        </Field>
        <Field label="Total budget ($) optional">
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
      </div>
      <div className="grid grid-cols-2 gap-3">
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
        <Field label="Color">
          <div className="mt-1 flex gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={cn(
                  "h-7 w-7 rounded-full border-2",
                  project.color === color
                    ? "border-[var(--text)]"
                    : "border-transparent",
                )}
                style={{ background: color }}
                onClick={() => onChange({ ...project, color })}
              />
            ))}
          </div>
        </Field>
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

export { COLORS };
