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
import { ExternalLink, GripVertical, Plus } from "lucide-react";
import { Field, inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import {
  ASSET_KIND_LABELS,
  assetIconLabel,
  inferAssetKind,
} from "@/lib/domain/assets";
import { cn } from "@/lib/cn";
import type { ProjectAsset, ProjectAssetKind } from "@/lib/types";

type AddMode = "link" | "note" | null;

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
  const [mode, setMode] = useState<AddMode>(null);
  const [kind, setKind] = useState<ProjectAssetKind>("custom");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function resetForm() {
    setMode(null);
    setLabel("");
    setUrl("");
    setNoteBody("");
    setKind("custom");
  }

  function addLink() {
    if (!url.trim()) return;
    const inferred = kind === "custom" ? inferAssetKind(url) : kind;
    const asset: ProjectAsset = {
      id: newId("asset"),
      organization_id: state.organization.id,
      project_id: projectId,
      kind: inferred,
      label: label.trim() || ASSET_KIND_LABELS[inferred],
      url: url.trim(),
      body: "",
      sort_order: assets.length,
    };
    upsertProjectAsset(asset);
    resetForm();
  }

  function addNote() {
    if (!label.trim() && !noteBody.trim()) return;
    const asset: ProjectAsset = {
      id: newId("asset"),
      organization_id: state.organization.id,
      project_id: projectId,
      kind: "custom",
      label: label.trim() || "Note",
      url: "",
      body: noteBody,
      sort_order: assets.length,
    };
    upsertProjectAsset(asset);
    resetForm();
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!canManage) return;
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

  return (
    <section className="rounded-md border border-[var(--border)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Assets</h2>
        {canManage ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--accent)] hover:underline"
              onClick={() => setMode(mode === "link" ? null : "link")}
            >
              <Plus size={12} /> Add link
            </button>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--accent)] hover:underline"
              onClick={() => setMode(mode === "note" ? null : "note")}
            >
              <Plus size={12} /> Add note
            </button>
          </div>
        ) : null}
      </div>

      {mode === "link" ? (
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
              onClick={addLink}
            >
              Save link
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

      {mode === "note" ? (
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
              onClick={addNote}
            >
              Save note
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
            disabled={!canManage}
          >
            <ul className="space-y-1.5">
              {assets.map((a) => (
                <SortableAssetRow
                  key={a.id}
                  asset={a}
                  canManage={canManage}
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
  onDelete,
}: {
  asset: ProjectAsset;
  canManage: boolean;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: asset.id, disabled: !canManage });
  const isNote = Boolean(asset.body.trim());

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
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
            {canManage ? (
              <button
                type="button"
                className="shrink-0 cursor-pointer text-xs text-[var(--status-over)]"
                onClick={onDelete}
              >
                Remove
              </button>
            ) : null}
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
          <span className="inline-flex h-6 w-8 shrink-0 items-center justify-center rounded bg-[var(--bg-elevated)] text-[10px] font-semibold text-[var(--text-muted)]">
            {assetIconLabel(asset.kind)}
          </span>
          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-[var(--accent)] hover:underline"
          >
            {asset.label || ASSET_KIND_LABELS[asset.kind]}
          </a>
          <ExternalLink
            size={12}
            className="shrink-0 text-[var(--text-muted)]"
          />
          {canManage ? (
            <button
              type="button"
              className="cursor-pointer text-xs text-[var(--status-over)]"
              onClick={onDelete}
            >
              Remove
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}
