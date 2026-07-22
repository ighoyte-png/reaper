"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data/store";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function ApplyTemplateDialog({
  templateId,
  projectName,
  onConfirm,
  onCancel,
}: {
  templateId: string;
  projectName?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const { state } = useData();
  const mounted = useMounted();
  const template = state.project_templates.find((t) => t.id === templateId);

  const counts = useMemo(() => {
    const milestones = state.template_milestones.filter(
      (m) => m.template_id === templateId,
    ).length;
    const lists = state.template_task_lists.filter(
      (l) => l.template_id === templateId,
    ).length;
    const tasks = state.template_tasks.filter(
      (t) => t.template_id === templateId,
    ).length;
    return { milestones, lists, tasks };
  }, [
    state.template_milestones,
    state.template_task_lists,
    state.template_tasks,
    templateId,
  ]);

  if (!mounted) return null;

  const name = template?.name ?? "This template";
  const target = projectName ? `“${projectName}”` : "this project";

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-4 shadow-xl">
        <h2 className="text-sm font-semibold">Apply Template?</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Apply <strong>{name}</strong> to {target}. This appends undated
          milestones and unassigned tasks. Existing project work is kept.
        </p>
        <ul className="mt-3 space-y-1 text-sm tabular-nums text-[var(--text)]">
          <li>
            {counts.milestones} milestone{counts.milestones === 1 ? "" : "s"}
          </li>
          <li>
            {counts.lists} list{counts.lists === 1 ? "" : "s"}
          </li>
          <li>
            {counts.tasks} task{counts.tasks === 1 ? "" : "s"}
          </li>
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              void onConfirm();
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
  onConfirm: (name: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const mounted = useMounted();
  const [name, setName] = useState(defaultName);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-4 shadow-xl">
        <h2 className="text-sm font-semibold">Save As Template?</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Saves milestones and tasks only. Dates, assignees, comments, team,
          budget, and essentials are not included.
        </p>
        <label className="mt-3 block text-xs text-[var(--text-muted)]">
          Template Name
          <input
            className="mt-1 h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!name.trim()}
            onClick={() => {
              void onConfirm(name.trim());
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
