"use client";

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
import type { Milestone, Project } from "@/lib/types";

export function SortableMilestoneList({
  milestones,
  project,
  today,
  canManage,
  formatDisplayDate,
  onReorder,
  onToggleApproved,
  onEdit,
}: {
  milestones: Milestone[];
  project: Project;
  today: string;
  canManage: boolean;
  formatDisplayDate: (dateKey: string | null) => string;
  onReorder: (reordered: Milestone[]) => void;
  onToggleApproved: (milestone: Milestone, approved: boolean) => void;
  onEdit: (milestone: Milestone) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
        disabled={!canManage}
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
}: {
  milestone: Milestone;
  project: Project;
  today: string;
  canManage: boolean;
  formatDisplayDate: (dateKey: string | null) => string;
  onToggleApproved: (milestone: Milestone, approved: boolean) => void;
  onEdit: (milestone: Milestone) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: milestone.id, disabled: !canManage });
  const pct = milestoneDateProgress(milestone, project, today);
  const dateLabel = milestone.due_date
    ? formatDisplayDate(milestone.due_date)
    : "No date";
  const label = `${milestone.name} · ${dateLabel}`;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="space-y-1.5"
    >
      <div className="flex items-start gap-1.5">
        {canManage ? (
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
        <div className="min-w-0 flex-1">
          <ProgressBar
            pct={pct ?? 0}
            label={label}
            approved={milestone.client_approved}
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
              "inline-flex cursor-pointer rounded p-1 hover:bg-[var(--row-hover)]",
              milestone.client_approved
                ? "text-[var(--status-healthy)]"
                : "text-[var(--text-muted)] hover:text-[var(--status-healthy)]",
            )}
            onClick={() =>
              onToggleApproved(milestone, !milestone.client_approved)
            }
            aria-label={
              milestone.client_approved
                ? "Mark milestone unapproved"
                : "Mark milestone approved"
            }
            aria-pressed={milestone.client_approved}
            title={
              milestone.client_approved ? "Approved" : "Mark approved"
            }
          >
            <Check size={14} strokeWidth={2.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
