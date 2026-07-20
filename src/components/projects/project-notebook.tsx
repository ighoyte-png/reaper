"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { Field, inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import {
  ASSET_KIND_LABELS,
  assetIconLabel,
  inferAssetKind,
} from "@/lib/domain/assets";
import type { ProjectAsset, ProjectAssetKind } from "@/lib/types";

export function ProjectNotebook({ projectId }: { projectId: string }) {
  const { state, canManage, upsertProjectAsset, deleteProjectAsset, newId } =
    useData();
  const assets = state.project_assets
    .filter((a) => a.project_id === projectId)
    .sort((a, b) => a.sort_order - b.sort_order);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<ProjectAssetKind>("custom");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  function add() {
    if (!url.trim()) return;
    const inferred = kind === "custom" ? inferAssetKind(url) : kind;
    const asset: ProjectAsset = {
      id: newId("asset"),
      organization_id: state.organization.id,
      project_id: projectId,
      kind: inferred,
      label: label.trim() || ASSET_KIND_LABELS[inferred],
      url: url.trim(),
      sort_order: assets.length,
    };
    upsertProjectAsset(asset);
    setAdding(false);
    setLabel("");
    setUrl("");
    setKind("custom");
  }

  return (
    <section className="rounded-md border border-[var(--border)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Notebook & assets</h2>
        {canManage ? (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--accent)] hover:underline"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus size={12} /> Add link
          </button>
        ) : null}
      </div>
      {adding ? (
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
          <div className="flex gap-2 sm:col-span-3">
            <button
              type="button"
              className="h-8 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
              onClick={add}
            >
              Save link
            </button>
            <button
              type="button"
              className="h-8 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {assets.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No asset links yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {assets.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span className="inline-flex h-6 w-8 shrink-0 items-center justify-center rounded bg-[var(--bg-elevated)] text-[10px] font-semibold text-[var(--text-muted)]">
                {assetIconLabel(a.kind)}
              </span>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[var(--accent)] hover:underline"
              >
                {a.label || ASSET_KIND_LABELS[a.kind]}
              </a>
              <ExternalLink size={12} className="shrink-0 text-[var(--text-muted)]" />
              {canManage ? (
                <button
                  type="button"
                  className="cursor-pointer text-xs text-[var(--status-over)]"
                  onClick={() => deleteProjectAsset(a.id)}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
