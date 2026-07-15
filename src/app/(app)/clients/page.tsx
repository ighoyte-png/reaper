"use client";

import { useState } from "react";
import { Topbar } from "@/components/nav/topbar";
import { EmptyState, Field, Modal, ConfirmDialog, inputClass } from "@/components/ui/form";
import { ColorPicker } from "@/components/ui/color-picker";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { sortClientsByName } from "@/lib/domain/sorting";
import type { Client } from "@/lib/types";

export default function ClientsPage() {
  const { state, upsertClient, deleteClient, newId } = useData();
  const { push } = useToast();
  const [editing, setEditing] = useState<Omit<Client, "organization_id"> | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const clients = sortClientsByName(state.clients);

  function emptyClient(): Omit<Client, "organization_id"> {
    return {
      id: newId("client"),
      name: "",
      notes: "",
      color: "#3498DB",
    };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Topbar
        title="Clients"
        actions={
          <button
            type="button"
            className="h-8 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
            onClick={() => setEditing(emptyClient())}
          >
            Add client
          </button>
        }
      />
      <div className="p-5">
        {state.clients.length === 0 ? (
          <EmptyState
            title="No clients yet"
            cta="Create your first client"
            onClick={() => setEditing(emptyClient())}
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Projects</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const count = state.projects.filter(
                    (p) => p.client_id === client.id,
                  ).length;
                  return (
                    <tr
                      key={client.id}
                      className="border-t border-[var(--border)] hover:bg-[var(--row-hover)]"
                    >
                      <td className="px-3 py-2.5 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: client.color }}
                          />
                          {client.name}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{count}</td>
                      <td className="px-3 py-2.5 text-[var(--text-muted)]">
                        {client.notes || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          className="text-xs text-[var(--accent)]"
                          onClick={() => setEditing(client)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal
          title={editing.name ? "Edit client" : "Add client"}
          onClose={() => setEditing(null)}
        >
          <div className="grid gap-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Color" className="w-full">
              <ColorPicker
                value={editing.color}
                onChange={(color) => setEditing({ ...editing, color })}
              />
            </Field>
            <Field label="Notes">
              <textarea
                className={`${inputClass} h-24 py-2`}
                value={editing.notes}
                onChange={(e) =>
                  setEditing({ ...editing, notes: e.target.value })
                }
              />
            </Field>
            <div className="flex justify-between pt-2">
              <button
                type="button"
                className="text-sm text-[var(--status-over)]"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
                  onClick={() => {
                    if (!editing.name.trim()) return;
                    upsertClient(editing);
                    setEditing(null);
                    push("Client saved");
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && editing && (
        <ConfirmDialog
          title="Delete client?"
          message={`Delete ${editing.name || "this client"}? Linked projects will keep their work, but the client association is removed. This can’t be undone.`}
          confirmLabel="Delete client"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            deleteClient(editing.id);
            setConfirmDelete(false);
            setEditing(null);
            push("Client deleted");
          }}
        />
      )}
    </div>
  );
}
