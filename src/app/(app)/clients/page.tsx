"use client";

import { useMemo, useState } from "react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { EmptyState, Field, Modal, ConfirmDialog, inputClass } from "@/components/ui/form";
import { ColorPicker } from "@/components/ui/color-picker";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { sortClientsByName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { Client, ClientStatus } from "@/lib/types";

type StatusFilter = "active" | "archived" | "all";

export default function ClientsPage() {
  const { state, upsertClient, deleteClient, newId, canManage } = useData();
  const { push } = useToast();
  const [editing, setEditing] = useState<Omit<Client, "organization_id"> | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const clients = sortClientsByName(state.clients);

  const filteredClients = useMemo(() => {
    if (statusFilter === "all") return clients;
    return clients.filter((c) => (c.status ?? "active") === statusFilter);
  }, [clients, statusFilter]);

  const archivedCount = clients.filter((c) => c.status === "archived").length;

  function emptyClient(): Omit<Client, "organization_id"> {
    return {
      id: newId("client"),
      name: "",
      notes: "",
      color: "#3498DB",
      status: "active",
    };
  }

  function toggleArchive(client: Client) {
    const next: ClientStatus = client.status === "archived" ? "active" : "archived";
    upsertClient({ ...client, status: next });
    push(next === "archived" ? "Client archived" : "Client restored");
  }

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader
        title="Clients"
        actions={
          canManage ? (
            <button
              type="button"
              className="h-8 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
              onClick={() => setEditing(emptyClient())}
            >
              Add client
            </button>
          ) : undefined
        }
      />
      <div className="p-5">
        <div className="mb-4 flex gap-1">
          {(["active", "archived", "all"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs capitalize transition-colors",
                statusFilter === f
                  ? "border-[var(--text)] bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)]",
              )}
            >
              {f}
              {f === "archived" && archivedCount > 0 ? ` (${archivedCount})` : ""}
            </button>
          ))}
        </div>

        {state.clients.length === 0 ? (
          canManage ? (
            <EmptyState
              title="No clients yet"
              cta="Create your first client"
              onClick={() => setEditing(emptyClient())}
            />
          ) : (
            <p className="py-16 text-center text-sm text-[var(--text-muted)]">
              No clients yet
            </p>
          )
        ) : filteredClients.length === 0 ? (
          <p className="py-16 text-center text-sm text-[var(--text-muted)]">
            No {statusFilter} clients.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Projects</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                  {canManage ? (
                    <th className="px-3 py-2 font-medium" />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => {
                  const count = state.projects.filter(
                    (p) => p.client_id === client.id,
                  ).length;
                  const archived = client.status === "archived";
                  return (
                    <tr
                      key={client.id}
                      className={cn(
                        "border-t border-[var(--border)] hover:bg-[var(--row-hover)]",
                        archived && "opacity-60",
                      )}
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
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide",
                            archived
                              ? "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                              : "bg-[var(--status-healthy)]/15 text-[var(--status-healthy)]",
                          )}
                        >
                          {client.status ?? "active"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{count}</td>
                      <td className="px-3 py-2.5 text-[var(--text-muted)]">
                        {client.notes || "—"}
                      </td>
                      {canManage ? (
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                            onClick={() => toggleArchive(client)}
                          >
                            {archived ? "Unarchive" : "Archive"}
                          </button>
                          <button
                            type="button"
                            className="ml-3 cursor-pointer text-xs text-[var(--accent)]"
                            onClick={() => setEditing(client)}
                          >
                            Edit
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canManage && editing && (
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
            <Field label="Status">
              <select
                className={inputClass}
                value={editing.status}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    status: e.target.value as ClientStatus,
                  })
                }
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
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

      {canManage && confirmDelete && editing && (
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
    </PageContainer>
  );
}
