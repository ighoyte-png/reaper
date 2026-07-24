"use client";

import { useMemo, useState } from "react";
import { Field, Modal, inputClass } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data/store";
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

export function PodsEditorModal({ onClose }: { onClose: () => void }) {
  const {
    state,
    upsertPod,
    deletePod,
    setPodMembers,
    newId,
  } = useData();
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
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function addPod() {
    setDrafts((prev) => [
      ...prev,
      {
        id: newId("pod"),
        name: "",
        manager_person_id: null,
        member_ids: [],
        sort_order: prev.length,
      },
    ]);
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
    <Modal title="Edit Pods" onClose={onClose} className="max-w-2xl">
      <div className="grid gap-4">
        {drafts.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No pods yet. Create groups like “Web Pod” or “Marketing Pod”.
          </p>
        ) : null}
        {drafts.map((draft, index) => (
          <div
            key={draft.id}
            className="rounded-md border border-[var(--border)] p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                Pod {index + 1}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={index === 0}
                  onClick={() => {
                    setDrafts((prev) => {
                      const next = [...prev];
                      const tmp = next[index - 1]!;
                      next[index - 1] = next[index]!;
                      next[index] = tmp;
                      return next;
                    });
                  }}
                >
                  Up
                </Button>
                <Button
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={index >= drafts.length - 1}
                  onClick={() => {
                    setDrafts((prev) => {
                      const next = [...prev];
                      const tmp = next[index + 1]!;
                      next[index + 1] = next[index]!;
                      next[index] = tmp;
                      return next;
                    });
                  }}
                >
                  Down
                </Button>
                <Button
                  variant="ghost"
                  className="h-7 px-2 text-xs text-[var(--status-over)]"
                  onClick={() => setDeleteId(draft.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input
                  className={inputClass}
                  value={draft.name}
                  placeholder="Web Pod"
                  onChange={(e) => {
                    const name = e.target.value;
                    setDrafts((prev) =>
                      prev.map((p) =>
                        p.id === draft.id ? { ...p, name } : p,
                      ),
                    );
                  }}
                />
              </Field>
              <Field label="Manager">
                <Select
                  searchable
                  value={draft.manager_person_id ?? ""}
                  onChange={(v) => {
                    const manager_person_id = v || null;
                    setDrafts((prev) =>
                      prev.map((p) => {
                        if (p.id !== draft.id) return p;
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
            </div>
            <Field label="Members" className="mt-3">
              <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--border)] p-2">
                {people.map((person) => {
                  const checked = draft.member_ids.includes(person.id);
                  const isManager = draft.manager_person_id === person.id;
                  return (
                    <label
                      key={person.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[var(--row-hover)]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isManager}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setDrafts((prev) =>
                            prev.map((p) => {
                              if (p.id !== draft.id) return p;
                              const member_ids = on
                                ? [...new Set([...p.member_ids, person.id])]
                                : p.member_ids.filter((id) => id !== person.id);
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
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button variant="ghost" onClick={addPod} disabled={busy}>
            Add Pod
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveAll()} disabled={busy}>
              {busy ? "Saving…" : "Save Pods"}
            </Button>
          </div>
        </div>
      </div>

      {deleteId ? (
        <Modal
          title="Delete pod?"
          onClose={() => setDeleteId(null)}
        >
          <p className="text-sm text-[var(--text-muted)]">
            This removes the pod grouping. People are not deleted.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-[var(--status-over)]"
              onClick={() => {
                setDrafts((prev) => prev.filter((p) => p.id !== deleteId));
                setDeleteId(null);
              }}
            >
              Delete
            </Button>
          </div>
        </Modal>
      ) : null}
    </Modal>
  );
}
