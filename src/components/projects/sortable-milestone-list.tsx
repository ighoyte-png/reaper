"use client";

import { useEffect } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Pencil } from "lucide-react";
import { ProgressBar } from "@/components/projects/progress-bar";
import { milestoneDateProgress } from "@/lib/domain/progress";
import { cn } from "@/lib/cn";
import { scrollIntoNearest } from "@/lib/scroll-into-nearest";
import { useIsPhone } from "@/lib/hooks/use-media-query";
import type { Milestone, Project } from "@/lib/types";
import { format, parseISO } from "date-fns";

function approvedByline(milestone: Milestone): string | null {
  if (!milestone.approved_by_client || !milestone.approved_by_name) {
    return null;
  }
  const when = milestone.approved_at
    ? (() => {
        try {
          return format(parseISO(milestone.approved_at), "MMM d, yyyy");
        } catch {
          return milestone.approved_at.slice(0, 10);
        }
      })()
    : null;
  return when
    ? `Approved by ${milestone.approved_by_name} on ${when}`
    : `Approved by ${milestone.approved_by_name}`;
}

export function SortableMilestoneList({
  milestones,
  project,
  today,
  canManage,
  formatDisplayDate,
  onReorder,
  onToggleApproved,
  onEdit,
  focusMilestoneId = null,
}: {
  milestones: Milestone[];
  project: Project;
  today: string;
  canManage: boolean;
  formatDisplayDate: (dateKey: string | null) => string;
  onReorder: (reordered: Milestone[]) => void;
  onToggleApproved: (milestone: Milestone, approved: boolean) => void;
  onEdit: (milestone: Milestone) => void;
  focusMilestoneId?: string | null;
}) {
  const isPhone = useIsPhone();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!focusMilestoneId) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`milestone-row-${focusMilestoneId}`);
      if (el) {
        scrollIntoNearest(el, { behavior: "smooth", block: "center" });
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [focusMilestoneId]);

  function handleDragEnd(event: DragEndEvent) {
    if (!canManage) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = milestones.findIndex((m) => m.id === active.id);
    const newIndex = milestones.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(milestones, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={milestones.map((m) => m.id)}
        strategy={verticalListSortingStrategy}
        disabled={!canManage || isPhone}
      >
        <div className="space-y-6">
          {milestones.map((m) => (
            <SortableMilestoneRow
              key={m.id}
              milestone={m}
              project={project}
              today={today}
              canManage={canManage}
              formatDisplayDate={formatDisplayDate}
              onToggleApproved={onToggleApproved}
              onEdit={onEdit}
              focused={focusMilestoneId === m.id}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableMilestoneRow({
  milestone,
  project,
  today,
  canManage,
  formatDisplayDate,
  onToggleApproved,
  onEdit,
  focused = false,
}: {
  milestone: Milestone;
  project: Project;
  today: string;
  canManage: boolean;
  formatDisplayDate: (dateKey: string | null) => string;
  onToggleApproved: (milestone: Milestone, approved: boolean) => void;
  onEdit: (milestone: Milestone) => void;
  focused?: boolean;
}) {
  const isPhone = useIsPhone();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: milestone.id, disabled: !canManage || isPhone });
  const pct = milestoneDateProgress(milestone, project, today);
  const dateLabel = milestone.due_date
    ? formatDisplayDate(milestone.due_date)
    : "No date";
  const label = `${milestone.name} · ${dateLabel}`;
  const byline = approvedByline(milestone);
  const locked = milestone.approved_by_client;

  return (
    <div
      id={`milestone-row-${milestone.id}`}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className={cn(
        "min-w-0 space-y-1.5 rounded-md",
        focused &&
          "bg-[var(--accent)]/15 p-2 ring-1 ring-[var(--accent)]/25",
      )}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        {canManage && !isPhone ? (
          <button
            type="button"
            className="mt-1 cursor-grab touch-none text-[var(--text-muted)]"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 overflow-hidden">
          <ProgressBar
            pct={pct ?? 0}
            label={label}
            approved={milestone.client_approved}
            readyForApproval={
              milestone.approval_enabled && !milestone.client_approved
            }
            footerStart={byline}
            essential={{
              kind: milestone.essential_kind,
              label: milestone.essential_label,
              url: milestone.essential_url,
            }}
          />
        </div>
      </div>
      {canManage ? (
        <div className="flex items-center justify-end gap-0.5 pl-5">
          <button
            type="button"
            className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
            onClick={() => onEdit(milestone)}
            aria-label="Edit milestone"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex rounded p-1",
              locked
                ? "cursor-not-allowed text-[var(--status-healthy)] opacity-70"
                : "cursor-pointer hover:bg-[var(--row-hover)]",
              !locked &&
                (milestone.client_approved
                  ? "text-[var(--status-healthy)]"
                  : "text-[var(--text-muted)] hover:text-[var(--status-healthy)]"),
            )}
            onClick={() => {
              if (locked) return;
              onToggleApproved(milestone, !milestone.client_approved);
            }}
            disabled={locked}
            aria-label={
              locked
                ? "Client approved — locked"
                : milestone.client_approved
                  ? "Mark milestone unapproved"
                  : "Mark milestone approved"
            }
            aria-pressed={milestone.client_approved}
            title={
              locked
                ? "Locked after client approval"
                : milestone.client_approved
                  ? "Approved"
                  : "Mark approved"
            }
          >
            <Check size={14} strokeWidth={2.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
