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
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import type { TemplateMilestone } from "@/lib/types";

export function TemplateMilestoneList({
  templateId,
  editMode,
}: {
  templateId: string;
  editMode: boolean;
}) {
  const {
    state,
    newId,
    upsertTemplateMilestone,
    deleteTemplateMilestone,
  } = useData();

  const milestones = state.template_milestones
    .filter((m) => m.template_id === templateId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const [editing, setEditing] = useState<TemplateMilestone | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!editMode) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = milestones.findIndex((m) => m.id === active.id);
    const newIndex = milestones.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(milestones, oldIndex, newIndex);
    reordered.forEach((m, i) => {
      if (m.sort_order !== i) upsertTemplateMilestone({ ...m, sort_order: i });
    });
  }

  function addMilestone() {
    const m: TemplateMilestone = {
      id: newId("tms"),
      organization_id: state.organization.id,
      template_id: templateId,
      name: "New Milestone",
      offset_days: 0,
      sort_order: milestones.length,
    };
    upsertTemplateMilestone(m);
    setEditing(m);
  }

  if (milestones.length === 0 && !editMode) {
    return (
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        No milestones yet. Turn on edit to add some.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[var(--text-muted)]">
          Milestones
        </h3>
        {editMode ? (
          <button
            type="button"
            className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
            onClick={addMilestone}
            aria-label="Add milestone"
            title="Add Milestone"
          >
            <span className="text-xs font-medium">+ Add</span>
          </button>
        ) : null}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={milestones.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
          disabled={!editMode}
        >
          <div className="space-y-2">
            {milestones.map((m) => (
              <TemplateMilestoneRow
                key={m.id}
                milestone={m}
                editMode={editMode}
                onEdit={() => setEditing(m)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editing ? (
        <Modal title="Edit Milestone" onClose={() => setEditing(null)}>
          <div className="grid gap-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                autoFocus
              />
            </Field>
            <p className="text-xs text-[var(--text-muted)]">
              Dates are not stored on templates. Applied milestones start
              undated.
            </p>
            <div className="flex justify-between pt-2">
              <Button
                variant="destructiveOutline"
                size="sm"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Delete this milestone? Its task lists become unassigned.",
                    )
                  ) {
                    return;
                  }
                  deleteTemplateMilestone(editing.id);
                  setEditing(null);
                }}
              >
                <Trash2 size={14} strokeWidth={1.75} /> Delete
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    if (!editing.name.trim()) return;
                    upsertTemplateMilestone({
                      ...editing,
                      name: editing.name.trim(),
                    });
                    setEditing(null);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function TemplateMilestoneRow({
  milestone,
  editMode,
  onEdit,
}: {
  milestone: TemplateMilestone;
  editMode: boolean;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: milestone.id, disabled: !editMode });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]/40 px-2 py-2"
    >
      {editMode ? (
        <button
          type="button"
          className="cursor-grab touch-none text-[var(--text-muted)]"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} strokeWidth={1.75} />
        </button>
      ) : null}
      <div className="min-w-0 flex-1 truncate text-sm font-medium">
        {milestone.name}
      </div>
      {editMode ? (
        <button
          type="button"
          className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
          onClick={onEdit}
          aria-label="Edit milestone"
        >
          <Pencil size={14} strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}
