"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { EmptyState, Field, Modal, ConfirmDialog, inputClass } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { ApplyTemplateDialog } from "@/components/templates/apply-template-dialog";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { useViewAs } from "@/lib/view-as";
import { sortClientsByName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { Client, ClientStatus, Project } from "@/lib/types";

type StatusFilter = "active" | "archived" | "all";

function emptyProject(
  id: string,
  clientId: string,
): Omit<Project, "organization_id"> {
  return {
    id,
    client_id: clientId,
    name: "",
    slug: "",
    status: "active",
    priority: 3,
    color: "#3498DB",
    start_date: null,
    end_date: null,
    budget_hours: 80,
    budget_amount: null,
    budget_mode: "hours",
    budget_monthly_reset: false,
    notes: "",
    manager_person_id: null,
    hide_from_public_share: false,
  };
}

export default function ClientsPage() {
  const {
    state,
    upsertClient,
    deleteClient,
    upsertProject,
    setProjectMembers,
    applyProjectTemplate,
    newId,
    isPublicShare,
  } = useData();
  const { effectiveCanManage } = useViewAs();
  const canManage = effectiveCanManage;
  const { push } = useToast();
  const router = useRouter();
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const [editing, setEditing] = useState<Omit<Client, "organization_id"> | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [offerProjectForClient, setOfferProjectForClient] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [projectDraft, setProjectDraft] = useState<Omit<
    Project,
    "organization_id"
  > | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [createTemplateId, setCreateTemplateId] = useState("");
  const [pendingCreateApply, setPendingCreateApply] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const clients = sortClientsByName(state.clients);

  const filteredClients = useMemo(() => {
    if (statusFilter === "all") return clients;
    return clients.filter((c) => (c.status ?? "active") === statusFilter);
  }, [clients, statusFilter]);

  const archivedCount = clients.filter((c) => c.status === "archived").length;

  useEffect(() => {
    if (!canManage && !isPublicShare) router.replace(appHref("/dashboard"));
  }, [canManage, isPublicShare, router]);

  if (!canManage && !isPublicShare) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting…
      </div>
    );
  }

  function emptyClient(): Omit<Client, "organization_id"> {
    return {
      id: newId("client"),
      name: "",
      slug: "",
      notes: "",
      color: "#3498DB",
      status: "active",
      hide_from_public_share: false,
    };
  }

  function toggleArchive(client: Client) {
    const next: ClientStatus = client.status === "archived" ? "active" : "archived";
    upsertClient({ ...client, status: next });
    push(next === "archived" ? "Client archived" : "Client restored");
  }

  function startProjectForClient(clientId: string) {
    setMemberIds([]);
    setCreateTemplateId("");
    setPendingCreateApply(false);
    setProjectDraft(emptyProject(newId("proj"), clientId));
  }

  async function saveFollowUpProject(
    project: Omit<Project, "organization_id">,
    members: string[],
    templateToApply: string,
  ) {
    try {
      const saved = await upsertProject({
        ...project,
        budget_hours:
          project.budget_mode === "hours" ? project.budget_hours : null,
        budget_amount:
          project.budget_mode === "amount" ? project.budget_amount : null,
        budget_monthly_reset:
          project.budget_mode === "hours"
            ? project.budget_monthly_reset
            : false,
      });
      await setProjectMembers(saved.id, members);
      if (templateToApply) {
        await applyProjectTemplate(saved.id, templateToApply);
      }
      setProjectDraft(null);
      setMemberIds([]);
      setCreateTemplateId("");
      push(
        templateToApply ? "Project created from template" : "Project saved",
      );
      router.push(projectHref(saved));
    } catch (err) {
      push(
        err instanceof Error ? err.message : "Could not save project",
        "warning",
      );
    }
  }

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader
        title="Clients"
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setEditing(emptyClient())}>
              Add Client
            </Button>
          ) : undefined
        }
      />
      <div className="p-3 sm:p-5">
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
              cta="Create Your First Client"
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
          <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg)]">
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
                          <ProjectColorBar color={client.color} />
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
          title={editing.name ? "Edit Client" : "Add Client"}
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
              <Select
                value={editing.status}
                onChange={(v) =>
                  setEditing({
                    ...editing,
                    status: v as ClientStatus,
                  })
                }
                options={[
                  { value: "active", label: "Active" },
                  { value: "archived", label: "Archived" },
                ]}
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
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(editing.hide_from_public_share)}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    hide_from_public_share: e.target.checked,
                  })
                }
              />
              <span>
                Hide Client From Public Share
                <span className="block text-xs text-[var(--text-muted)]">
                  Omit this client and its projects from the org-wide public
                  schedule and reports link
                </span>
              </span>
            </label>
            <div className="flex justify-between pt-2">
              <Button
                variant="ghost"
                className="text-[var(--status-over)] hover:text-[var(--status-over)]"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
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
                    const isNew = !state.clients.some((c) => c.id === editing.id);
                    const saved = {
                      ...editing,
                      name: editing.name.trim(),
                    };
                    upsertClient(saved);
                    setEditing(null);
                    push("Client saved");
                    if (isNew) {
                      setOfferProjectForClient({
                        id: saved.id,
                        name: saved.name,
                      });
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {canManage && confirmDelete && editing && (
        <ConfirmDialog
          title="Delete Client?"
          message={`Delete ${editing.name || "this client"}? Linked projects will keep their work, but the client association is removed. This can’t be undone.`}
          confirmLabel="Delete Client"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            deleteClient(editing.id);
            setConfirmDelete(false);
            setEditing(null);
            push("Client deleted");
          }}
        />
      )}

      {canManage && offerProjectForClient ? (
        <ConfirmDialog
          title="Create a project?"
          message={`Create a project for ${offerProjectForClient.name} now?`}
          confirmLabel="Create project"
          tone="accent"
          onCancel={() => setOfferProjectForClient(null)}
          onConfirm={() => {
            const clientId = offerProjectForClient.id;
            setOfferProjectForClient(null);
            startProjectForClient(clientId);
          }}
        />
      ) : null}

      {canManage && projectDraft ? (
        <Modal
          title="Add Project"
          className="max-w-3xl"
          onClose={() => {
            setProjectDraft(null);
            setMemberIds([]);
            setCreateTemplateId("");
            setPendingCreateApply(false);
          }}
        >
          <ProjectForm
            project={projectDraft}
            clients={state.clients}
            people={state.people}
            memberIds={memberIds}
            onMemberIdsChange={setMemberIds}
            onChange={setProjectDraft}
            showTemplateSelect
            templates={state.project_templates}
            templateId={createTemplateId}
            onTemplateIdChange={setCreateTemplateId}
            onSave={() => {
              if (!projectDraft.name.trim()) return;
              if (!projectDraft.client_id) {
                push("Choose a client for this project", "warning");
                return;
              }
              if (
                projectDraft.budget_mode === "hours" &&
                !(projectDraft.budget_hours && projectDraft.budget_hours > 0)
              ) {
                return;
              }
              if (
                projectDraft.budget_mode === "amount" &&
                (projectDraft.budget_amount == null ||
                  projectDraft.budget_amount < 0)
              ) {
                return;
              }
              if (createTemplateId) {
                setPendingCreateApply(true);
                return;
              }
              void saveFollowUpProject(projectDraft, memberIds, "");
            }}
            onCancel={() => {
              setProjectDraft(null);
              setMemberIds([]);
              setCreateTemplateId("");
              setPendingCreateApply(false);
            }}
          />
        </Modal>
      ) : null}

      {pendingCreateApply && projectDraft && createTemplateId ? (
        <ApplyTemplateDialog
          templateId={createTemplateId}
          projectName={projectDraft.name}
          onCancel={() => setPendingCreateApply(false)}
          onConfirm={() => {
            const templateToApply = createTemplateId;
            setPendingCreateApply(false);
            void saveFollowUpProject(projectDraft, memberIds, templateToApply);
          }}
        />
      ) : null}
    </PageContainer>
  );
}
