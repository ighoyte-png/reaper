"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput, Field, inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import { toDateKey } from "@/lib/domain/dates";
import {
  DEFAULT_TEMPLATE_SAVE_OPTIONS,
  templateCapabilityFlags,
  type TemplateApplyOptions,
  type TemplateSaveOptions,
} from "@/lib/domain/project-templates";
import { cn } from "@/lib/cn";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function OptionRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-sm",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={disabled ? "text-[var(--text-muted)]" : undefined}>
        {label}
      </span>
    </label>
  );
}

export function ApplyTemplateDialog({
  templateId,
  projectName,
  onConfirm,
  onCancel,
}: {
  templateId: string;
  projectName?: string;
  onConfirm: (options: TemplateApplyOptions) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { state } = useData();
  const mounted = useMounted();
  const template = state.project_templates.find((t) => t.id === templateId);

  const milestones = useMemo(
    () =>
      state.template_milestones.filter((m) => m.template_id === templateId),
    [state.template_milestones, templateId],
  );
  const lists = useMemo(
    () =>
      state.template_task_lists.filter((l) => l.template_id === templateId),
    [state.template_task_lists, templateId],
  );
  const tasks = useMemo(
    () => state.template_tasks.filter((t) => t.template_id === templateId),
    [state.template_tasks, templateId],
  );

  const caps = useMemo(
    () =>
      templateCapabilityFlags({
        template,
        milestones,
        lists,
        tasks,
      }),
    [template, milestones, lists, tasks],
  );

  const [includeDescriptions, setIncludeDescriptions] = useState(true);
  const [includeDates, setIncludeDates] = useState(true);
  const [includeMilestones, setIncludeMilestones] = useState(true);
  const [includeAssignees, setIncludeAssignees] = useState(true);
  const [projectStartDate, setProjectStartDate] = useState(() =>
    toDateKey(new Date()),
  );

  useEffect(() => {
    setIncludeDescriptions(caps.hasDescriptions);
    setIncludeDates(caps.hasDates);
    setIncludeMilestones(caps.hasMilestones);
    setIncludeAssignees(caps.hasAssignees);
  }, [caps]);

  if (!mounted) return null;

  const name = template?.name ?? "This template";
  const target = projectName ? `“${projectName}”` : "this project";
  const showStartPicker = caps.hasDates && includeDates;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-4 shadow-xl">
        <h2 className="text-sm font-semibold">Apply Template?</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Apply <strong>{name}</strong> to {target}. Lists and tasks always
          import (including Client Reviews). New items append below existing
          work. Gantt stays disabled on imported lists.
        </p>
        <ul className="mt-3 space-y-1 text-sm tabular-nums text-[var(--text)]">
          <li>
            {lists.length} list{lists.length === 1 ? "" : "s"}
          </li>
          <li>
            {tasks.length} task{tasks.length === 1 ? "" : "s"}
          </li>
          {caps.hasMilestones ? (
            <li>
              {milestones.length} milestone
              {milestones.length === 1 ? "" : "s"}
            </li>
          ) : null}
        </ul>
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Also import
          </p>
          <OptionRow
            label="Task Descriptions"
            checked={includeDescriptions && caps.hasDescriptions}
            disabled={!caps.hasDescriptions}
            onChange={setIncludeDescriptions}
          />
          <OptionRow
            label="List and Task Dates"
            checked={includeDates && caps.hasDates}
            disabled={!caps.hasDates}
            onChange={setIncludeDates}
          />
          <OptionRow
            label="Milestones"
            checked={includeMilestones && caps.hasMilestones}
            disabled={!caps.hasMilestones}
            onChange={setIncludeMilestones}
          />
          <OptionRow
            label="Assignees"
            checked={includeAssignees && caps.hasAssignees}
            disabled={!caps.hasAssignees}
            onChange={setIncludeAssignees}
          />
        </div>
        {showStartPicker ? (
          <Field label="Project start date" className="mt-3">
            <DateInput
              value={projectStartDate}
              onChange={(e) => setProjectStartDate(e.target.value)}
            />
          </Field>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={showStartPicker && !projectStartDate}
            onClick={() => {
              void onConfirm({
                includeDescriptions:
                  caps.hasDescriptions && includeDescriptions,
                includeDates: caps.hasDates && includeDates,
                includeMilestones: caps.hasMilestones && includeMilestones,
                includeAssignees: caps.hasAssignees && includeAssignees,
                projectStartDate: projectStartDate || toDateKey(new Date()),
              });
            }}
          >
            Apply Template
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SaveAsTemplateDialog({
  defaultName,
  onConfirm,
  onCancel,
}: {
  defaultName: string;
  onConfirm: (
    name: string,
    options: TemplateSaveOptions,
  ) => void | Promise<void>;
  onCancel: () => void;
}) {
  const mounted = useMounted();
  const [name, setName] = useState(defaultName);
  const [options, setOptions] = useState<TemplateSaveOptions>(
    DEFAULT_TEMPLATE_SAVE_OPTIONS,
  );

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-4 shadow-xl">
        <h2 className="text-sm font-semibold">Save As Template?</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Lists, tasks, dividers, and Client Reviews are always included.
          Comments, team, budget, and essentials are never saved.
        </p>
        <label className="mt-3 block text-xs text-[var(--text-muted)]">
          Template Name
          <input
            className={cn(inputClass, "mt-1")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Also include
          </p>
          <OptionRow
            label="Task Descriptions"
            checked={options.includeDescriptions}
            onChange={(v) =>
              setOptions((prev) => ({ ...prev, includeDescriptions: v }))
            }
          />
          <OptionRow
            label="List and Task Dates"
            checked={options.includeDates}
            onChange={(v) =>
              setOptions((prev) => ({ ...prev, includeDates: v }))
            }
          />
          <OptionRow
            label="Milestones"
            checked={options.includeMilestones}
            onChange={(v) =>
              setOptions((prev) => ({ ...prev, includeMilestones: v }))
            }
          />
          <OptionRow
            label="Assignees"
            checked={options.includeAssignees}
            onChange={(v) =>
              setOptions((prev) => ({ ...prev, includeAssignees: v }))
            }
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!name.trim()}
            onClick={() => {
              void onConfirm(name.trim(), options);
            }}
          >
            Save Template
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
