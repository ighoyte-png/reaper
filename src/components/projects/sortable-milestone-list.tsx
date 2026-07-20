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
import { GripVertical } from "lucide-react";
import { ProgressBar } from "@/components/projects/progress-bar";
import { milestoneDateProgress } from "@/lib/domain/progress";
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
  formatDisplayDate: (dateKey: string) => string;
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
        <div className="space-y-3">
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
  formatDisplayDate: (dateKey: string) => string;
  onToggleApproved: (milestone: Milestone, approved: boolean) => void;
  onEdit: (milestone: Milestone) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: milestone.id, disabled: !canManage });
  const pct = milestoneDateProgress(milestone, project, today) ?? 0;

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
            pct={pct}
            label={`${milestone.name} · ${formatDisplayDate(milestone.due_date)}`}
            approved={milestone.client_approved}
          />
        </div>
      </div>
      {canManage ? (
        <div className="flex items-center justify-between gap-2 pl-5">
          <label className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={milestone.client_approved}
              onChange={(e) =>
                onToggleApproved(milestone, e.target.checked)
              }
            />
            Approved
          </label>
          <button
            type="button"
            className="cursor-pointer text-[10px] text-[var(--accent)]"
            onClick={() => onEdit(milestone)}
          >
            Edit
          </button>
        </div>
      ) : null}
    </div>
  );
}
