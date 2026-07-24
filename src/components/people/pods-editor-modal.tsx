"use client";

import { useEffect, useMemo, useState } from "react";
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
import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  ConfirmDialog,
  Field,
  Modal,
  inputClass,
} from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useData } from "@/lib/data/store";
import { cn } from "@/lib/cn";
import { sortPods, personIdsInPod } from "@/lib/domain/pods";
import { sortPeopleByName } from "@/lib/domain/sorting";
import type { Pod } from "@/lib/types";

type DraftPod = {
  id: string;
  name: string;
  manager_person_id: string | null;
  member_ids: string[];
  sort_order: number;
};

function podSidebarLabel(draft: DraftPod): string {
  const name = draft.name.trim();
  return name || "Untitled";
}

export function PodsEditorModal({ onClose }: { onClose: () => void }) {
  const { state, upsertPod, deletePod, setPodMembers, newId } = useData();
  const people = useMemo(
    () => sortPeopleByName(state.people),
    [state.people],
  );
  const [drafts, setDrafts] = useState<DraftPod[]>(() =>
    sortPods(state.pods).map((pod) => ({
      id: pod.id,
      name: pod.name,
      manager_person_id: pod.manager_person_id,
      member_ids: [...personIdsInPod(pod, state.pod_members)],
      sort_order: pod.sort_order,
    })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () => drafts[0]?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && drafts.some((d) => d.id === selectedId)) return;
    setSelectedId(drafts[0]?.id ?? null);
  }, [drafts, selectedId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function addPod() {
    const id = newId("pod");
    setDrafts((prev) => [
      ...prev,
      {
        id,
        name: "",
        manager_person_id: null,
        member_ids: [],
        sort_order: prev.length,
      },
    ]);
    setSelectedId(id);
  }

  function updateSelected(patch: Partial<DraftPod>) {
    if (!selectedId) return;
    setDrafts((prev) =>
      prev.map((p) => (p.id === selectedId ? { ...p, ...patch } : p)),
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDrafts((prev) => {
      const oldIndex = prev.findIndex((d) => d.id === active.id);
      const newIndex = prev.findIndex((d) => d.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function saveAll() {
    setBusy(true);
    try {
      const keptIds = new Set(drafts.map((d) => d.id));
      for (const existing of state.pods) {
        if (!keptIds.has(existing.id)) {
          await deletePod(existing.id);
        }
      }
      for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i]!;
        const name = d.name.trim();
        if (!name) continue;
        const pod: Omit<Pod, "organization_id"> & {
          organization_id?: string;
        } = {
          id: d.id,
          name,
          manager_person_id: d.manager_person_id,
          sort_order: i,
        };
        await upsertPod(pod);
        const members = [
          ...new Set([
            ...d.member_ids,
            ...(d.manager_person_id ? [d.manager_person_id] : []),
          ]),
        ];
        await setPodMembers(d.id, members);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit Pods" onClose={onClose} className="max-w-3xl">
      <div className="flex min-h-[22rem] flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-0">
          <nav
            className="flex shrink-0 flex-col border-b border-[var(--border)] pb-2 sm:w-44 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3"
            aria-label="Pods"
          >
            {drafts.length === 0 ? (
              <p className="px-2.5 py-1.5 text-sm text-[var(--text-muted)]">
                No pods yet
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={drafts.map((d) => d.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto sm:max-h-[18rem]">
                    {drafts.map((draft) => (
                      <SortablePodNavItem
                        key={draft.id}
                        draft={draft}
                        selected={draft.id === selectedId}
                        onSelect={() => setSelectedId(draft.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <button
              type="button"
              className="mt-1 flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
              onClick={addPod}
              disabled={busy}
            >
              <Plus size={14} strokeWidth={1.75} />
              Add Pod
            </button>
          </nav>

          <div className="min-h-0 min-w-0 flex-1 space-y-3 sm:pl-4">
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <Field label="Name" className="min-w-0 flex-1">
                    <input
                      className={inputClass}
                      value={selected.name}
                      placeholder="Web Pod"
                      autoFocus={!selected.name.trim()}
                      onChange={(e) => updateSelected({ name: e.target.value })}
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    className="mt-5 h-8 w-8 shrink-0 px-0 text-[var(--status-over)] hover:bg-[var(--status-over)]/10 hover:text-[var(--status-over)]"
                    onClick={() => setDeleteId(selected.id)}
                    aria-label={`Delete ${podSidebarLabel(selected)}`}
                    title="Delete pod"
                  >
                    <Trash2 size={15} strokeWidth={1.75} />
                  </Button>
                </div>
                <Field label="Manager">
                  <Select
                    searchable
                    value={selected.manager_person_id ?? ""}
                    onChange={(v) => {
                      const manager_person_id = v || null;
                      setDrafts((prev) =>
                        prev.map((p) => {
                          if (p.id !== selected.id) return p;
                          const member_ids = manager_person_id
                            ? [
                                ...new Set([
                                  ...p.member_ids,
                                  manager_person_id,
                                ]),
                              ]
                            : p.member_ids;
                          return { ...p, manager_person_id, member_ids };
                        }),
                      );
                    }}
                    options={[
                      { value: "", label: "None" },
                      ...people.map((person) => ({
                        value: person.id,
                        label: person.name,
                      })),
                    ]}
                  />
                </Field>
                <Field label="Members">
                  <div className="max-h-52 overflow-y-auto rounded-md border border-[var(--border)] p-2">
                    {people.map((person) => {
                      const checked = selected.member_ids.includes(person.id);
                      const isManager =
                        selected.manager_person_id === person.id;
                      return (
                        <label
                          key={person.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[var(--row-hover)]"
                        >
                          <Checkbox
                            size="sm"
                            checked={checked}
                            disabled={isManager}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setDrafts((prev) =>
                                prev.map((p) => {
                                  if (p.id !== selected.id) return p;
                                  const member_ids = on
                                    ? [
                                        ...new Set([
                                          ...p.member_ids,
                                          person.id,
                                        ]),
                                      ]
                                    : p.member_ids.filter(
                                        (id) => id !== person.id,
                                      );
                                  return { ...p, member_ids };
                                }),
                              );
                            }}
                          />
                          <span className="min-w-0 truncate">{person.name}</span>
                          {isManager ? (
                            <span className="text-[10px] uppercase text-[var(--text-muted)]">
                              Manager
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </Field>
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Create a pod to group people for filters and reports.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-[var(--border)] pt-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void saveAll()}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save Pods"}
          </Button>
        </div>
      </div>

      {deleteId ? (
        <ConfirmDialog
          title="Delete pod?"
          message="This removes the pod grouping. People are not deleted."
          confirmLabel="Delete"
          onCancel={() => setDeleteId(null)}
          onConfirm={() => {
            setDrafts((prev) => prev.filter((p) => p.id !== deleteId));
            setDeleteId(null);
          }}
        />
      ) : null}
    </Modal>
  );
}

function SortablePodNavItem({
  draft,
  selected,
  onSelect,
}: {
  draft: DraftPod;
  selected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: draft.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex items-center gap-0.5 rounded-md",
        isDragging && "z-10 opacity-80",
        selected
          ? "bg-[var(--row-hover)] font-medium text-[var(--text)]"
          : "text-[var(--text-muted)]",
      )}
    >
      <button
        type="button"
        className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center touch-none text-[var(--text-muted)] hover:text-[var(--text)] active:cursor-grabbing"
        aria-label={`Reorder ${podSidebarLabel(draft)}`}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className={cn(
          "min-w-0 flex-1 cursor-pointer truncate rounded-md py-1.5 pr-2.5 text-left text-sm transition-colors",
          !selected && "hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
        )}
        aria-current={selected ? "page" : undefined}
        onClick={onSelect}
      >
        {podSidebarLabel(draft)}
      </button>
    </div>
  );
}
