"use client";

import { useMemo, useState } from "react";
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
import { GripVertical, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/form";
import { AssetKindIcon } from "@/components/projects/asset-kind-icon";
import { useData } from "@/lib/data/store";
import {
  ASSET_KIND_LABELS,
  inferAssetKind,
} from "@/lib/domain/assets";
import { cn } from "@/lib/cn";
import type { ProjectAsset, ProjectAssetKind } from "@/lib/types";

type FormMode = "link" | "note" | null;

export function ProjectNotebook({ projectId }: { projectId: string }) {
  const { state, canManage, upsertProjectAsset, deleteProjectAsset, newId } =
    useData();
  const assets = useMemo(
    () =>
      state.project_assets
        .filter((a) => a.project_id === projectId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [state.project_assets, projectId],
  );
  const [mode, setMode] = useState<FormMode>(null);
  const [editing, setEditing] = useState<ProjectAsset | null>(null);
  const [kind, setKind] = useState<ProjectAssetKind>("custom");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [editMode, setEditMode] = useState(false);
  const editable = canManage && editMode;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function resetForm() {
    setMode(null);
    setEditing(null);
    setLabel("");
    setUrl("");
    setNoteBody("");
    setKind("custom");
  }

  function startAdd(next: "link" | "note") {
    if (mode === next && !editing) {
      resetForm();
      return;
    }
    setEditing(null);
    setLabel("");
    setUrl("");
    setNoteBody("");
    setKind("custom");
    setMode(next);
  }

  function startEdit(asset: ProjectAsset) {
    const isNote = Boolean(asset.body.trim());
    setEditing(asset);
    setMode(isNote ? "note" : "link");
    setLabel(asset.label);
    setUrl(asset.url);
    setNoteBody(asset.body);
    setKind(asset.kind);
  }

  function saveLink() {
    if (!url.trim()) return;
    const inferred = kind === "custom" ? inferAssetKind(url) : kind;
    if (editing) {
      upsertProjectAsset({
        ...editing,
        kind: inferred,
        label: label.trim() || ASSET_KIND_LABELS[inferred],
        url: url.trim(),
        body: "",
      });
    } else {
      upsertProjectAsset({
        id: newId("asset"),
        organization_id: state.organization.id,
        project_id: projectId,
        kind: inferred,
        label: label.trim() || ASSET_KIND_LABELS[inferred],
        url: url.trim(),
        body: "",
        sort_order: assets.length,
      });
    }
    resetForm();
  }

  function saveNote() {
    if (!label.trim() && !noteBody.trim()) return;
    if (editing) {
      upsertProjectAsset({
        ...editing,
        kind: "custom",
        label: label.trim() || "Note",
        url: "",
        body: noteBody,
      });
    } else {
      upsertProjectAsset({
        id: newId("asset"),
        organization_id: state.organization.id,
        project_id: projectId,
        kind: "custom",
        label: label.trim() || "Note",
        url: "",
        body: noteBody,
        sort_order: assets.length,
      });
    }
    resetForm();
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!editable) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = assets.findIndex((a) => a.id === active.id);
    const newIndex = assets.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(assets, oldIndex, newIndex);
    reordered.forEach((a, i) => {
      if (a.sort_order !== i) upsertProjectAsset({ ...a, sort_order: i });
    });
  }

  function toggleEditMode() {
    setEditMode((v) => {
      if (v) resetForm();
      return !v;
    });
  }

  return (
    <section className="rounded-md border border-[var(--border)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Assets</h2>
        {canManage ? (
          <div className="flex items-center gap-1">
            {editMode ? (
              <>
                <button
                  type="button"
                  className={cn(
                    "inline-flex cursor-pointer rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]",
                    mode === "link" &&
                      !editing &&
                      "bg-[var(--row-hover)] text-[var(--accent)]",
                  )}
                  onClick={() => startAdd("link")}
                  aria-label="Add link"
                  title="Add link"
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex cursor-pointer rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]",
                    mode === "note" &&
                      !editing &&
                      "bg-[var(--row-hover)] text-[var(--accent)]",
                  )}
                  onClick={() => startAdd("note")}
                  aria-label="Add note"
                  title="Add note"
                >
                  <StickyNote size={16} />
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={cn(
                "inline-flex cursor-pointer rounded p-1.5 hover:bg-[var(--row-hover)] hover:text-[var(--accent)]",
                editMode
                  ? "bg-[var(--row-hover)] text-[var(--accent)]"
                  : "text-[var(--text-muted)]",
              )}
              onClick={toggleEditMode}
              aria-label={editMode ? "Done editing assets" : "Edit assets"}
              aria-pressed={editMode}
              title={editMode ? "Done editing assets" : "Edit assets"}
            >
              <Pencil size={16} />
            </button>
          </div>
        ) : null}
      </div>

      {editable && mode === "link" ? (
        <div className="mb-3 grid gap-2 rounded-md border border-[var(--border)] p-3 sm:grid-cols-3">
          <Field label="Type">
            <select
              className={inputClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as ProjectAssetKind)}
            >
              {(Object.keys(ASSET_KIND_LABELS) as ProjectAssetKind[]).map(
                (k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_LABELS[k]}
                  </option>
                ),
              )}
            </select>
          </Field>
          <Field label="Label">
            <input
              className={inputClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="URL">
            <input
              className={inputClass}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
            />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-3">
            <button
              type="button"
              className="h-9 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
              onClick={saveLink}
            >
              {editing ? "Save changes" : "Save link"}
            </button>
            <button
              type="button"
              className="h-9 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm"
              onClick={resetForm}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {editable && mode === "note" ? (
        <div className="mb-3 space-y-2 rounded-md border border-[var(--border)] p-3">
          <Field label="Title">
            <input
              className={inputClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Note title"
            />
          </Field>
          <Field label="Note">
            <textarea
              className={cn(inputClass, "h-24 py-2")}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Write a note…"
            />
          </Field>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="h-9 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
              onClick={saveNote}
            >
              {editing ? "Save changes" : "Save note"}
            </button>
            <button
              type="button"
              className="h-9 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm"
              onClick={resetForm}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {assets.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No assets yet.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={assets.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
            disabled={!editable}
          >
            <ul className="space-y-1.5">
              {assets.map((a) => (
                <SortableAssetRow
                  key={a.id}
                  asset={a}
                  canManage={editable}
                  isEditing={editing?.id === a.id}
                  onEdit={() => startEdit(a)}
                  onDelete={() => deleteProjectAsset(a.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function SortableAssetRow({
  asset,
  canManage,
  isEditing,
  onEdit,
  onDelete,
}: {
  asset: ProjectAsset;
  canManage: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: asset.id, disabled: !canManage });
  const isNote = Boolean(asset.body.trim());

  const actions = canManage ? (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]",
          isEditing && "text-[var(--accent)]",
        )}
        onClick={onEdit}
        aria-label="Edit"
        title="Edit"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--status-over)]"
        onClick={onDelete}
        aria-label="Remove"
        title="Remove"
      >
        <Trash2 size={14} />
      </button>
    </div>
  ) : null;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className={cn(
        "rounded-md border border-[var(--border)] px-3 py-2 text-sm",
        isEditing && "ring-1 ring-[var(--accent)]/40",
      )}
    >
      {isNote ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {canManage ? (
              <button
                type="button"
                className="cursor-grab touch-none text-[var(--text-muted)]"
                aria-label="Drag to reorder"
                {...attributes}
                {...listeners}
              >
                <GripVertical size={14} />
              </button>
            ) : null}
            <span className="min-w-0 flex-1 truncate font-medium">
              {asset.label || "Note"}
            </span>
            {actions}
          </div>
          <p className="whitespace-pre-wrap text-[var(--text-muted)]">
            {asset.body}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {canManage ? (
            <button
              type="button"
              className="cursor-grab touch-none text-[var(--text-muted)]"
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <GripVertical size={14} />
            </button>
          ) : null}
          <AssetKindIcon kind={asset.kind} />
          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-[var(--accent)] hover:underline"
          >
            {asset.label || ASSET_KIND_LABELS[asset.kind]}
          </a>
          {actions}
        </div>
      )}
    </li>
  );
}
