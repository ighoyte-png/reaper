"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { CardGridPlaceholders } from "@/components/ui/card-grid-placeholders";
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

function normalizeClientContact(
  client: Omit<Client, "organization_id">,
): Omit<Client, "organization_id"> {
  return {
    ...client,
    contact_first_name: client.contact_first_name ?? "",
    contact_last_name: client.contact_last_name ?? "",
    contact_email: client.contact_email ?? "",
    contact_phone: client.contact_phone ?? "",
    company_website: client.company_website ?? "",
  };
}

function contactDisplayName(client: Client): string {
  return [client.contact_first_name, client.contact_last_name]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

function websiteHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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
  const projectCountByClient = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of state.projects) {
      if (!p.client_id) continue;
      map.set(p.client_id, (map.get(p.client_id) ?? 0) + 1);
    }
    return map;
  }, [state.projects]);

  useEffect(() => {
    if (!canManage && !isPublicShare) router.replace(appHref("/dashboard"));
  }, [canManage, isPublicShare, router, appHref]);

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
      contact_first_name: "",
      contact_last_name: "",
      contact_email: "",
      contact_phone: "",
      company_website: "",
    };
  }

  function toggleArchive(client: Client) {
    const next: ClientStatus =
      client.status === "archived" ? "active" : "archived";
    upsertClient({ ...normalizeClientContact(client), status: next });
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
              {f === "archived" && archivedCount > 0
                ? ` (${archivedCount})`
                : ""}
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {filteredClients.map((client) => {
              const count = projectCountByClient.get(client.id) ?? 0;
              const archived = client.status === "archived";
              const pocName = contactDisplayName(client);
              const site = websiteHref(client.company_website ?? "");
              return (
                <article
                  key={client.id}
                  className={cn(
                    "flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4",
                    archived && "opacity-60",
                  )}
                >
                  <div className="mb-3 flex min-w-0 items-start gap-2">
                    <ProjectColorBar color={client.color} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold leading-tight">
                        {client.name}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
                        <span className="text-xs text-[var(--text-muted)]">
                          {count} {count === 1 ? "project" : "projects"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto space-y-1.5 text-xs text-[var(--text-muted)]">
                    {pocName ? (
                      <p className="truncate text-[var(--text)]">{pocName}</p>
                    ) : null}
                    {client.contact_email?.trim() ? (
                      <a
                        href={`mailto:${client.contact_email.trim()}`}
                        className="block truncate hover:text-[var(--text)]"
                      >
                        {client.contact_email.trim()}
                      </a>
                    ) : null}
                    {client.contact_phone?.trim() ? (
                      <a
                        href={`tel:${client.contact_phone.trim()}`}
                        className="block truncate hover:text-[var(--text)]"
                      >
                        {client.contact_phone.trim()}
                      </a>
                    ) : null}
                    {site ? (
                      <a
                        href={site}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate hover:text-[var(--text)]"
                      >
                        {(client.company_website || site).replace(
                          /^https?:\/\//i,
                          "",
                        )}
                      </a>
                    ) : null}
                    {client.notes?.trim() ? (
                      <p className="line-clamp-2 pt-0.5">{client.notes}</p>
                    ) : null}
                  </div>

                  {canManage ? (
                    <div className="mt-3 flex items-center justify-end gap-3 border-t border-[var(--border)] pt-2.5">
                      <button
                        type="button"
                        className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                        onClick={() => toggleArchive(client)}
                      >
                        {archived ? "Unarchive" : "Archive"}
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer text-xs text-[var(--accent)]"
                        onClick={() =>
                          setEditing(normalizeClientContact(client))
                        }
                      >
                        Edit
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {canManage ? (
              <CardGridPlaceholders
                count={filteredClients.length}
                smColumns={2}
                xlColumns={4}
                className="min-h-[11rem]"
                onAdd={() => setEditing(emptyClient())}
                addLabel="Add Client"
              />
            ) : (
              <CardGridPlaceholders
                count={filteredClients.length}
                smColumns={2}
                xlColumns={4}
                className="min-h-[11rem]"
              />
            )}
          </div>
        )}
      </div>

      {canManage && editing && (
        <Modal
          title={editing.name ? "Edit Client" : "Add Client"}
          className="max-w-xl"
          onClose={() => setEditing(null)}
        >
          <div className="grid gap-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
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

            <div className="border-t border-[var(--border)] pt-3">
              <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                Main point of contact
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">
                  <input
                    className={inputClass}
                    value={editing.contact_first_name}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        contact_first_name: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Last name">
                  <input
                    className={inputClass}
                    value={editing.contact_last_name}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        contact_last_name: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Email">
                  <input
                    type="email"
                    className={inputClass}
                    value={editing.contact_email}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        contact_email: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Phone">
                  <input
                    type="tel"
                    className={inputClass}
                    value={editing.contact_phone}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        contact_phone: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Company website">
                  <input
                    type="url"
                    className={inputClass}
                    placeholder="https://"
                    value={editing.company_website}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        company_website: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
            </div>

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
                    const isNew = !state.clients.some(
                      (c) => c.id === editing.id,
                    );
                    const saved = normalizeClientContact({
                      ...editing,
                      name: editing.name.trim(),
                      contact_first_name: editing.contact_first_name.trim(),
                      contact_last_name: editing.contact_last_name.trim(),
                      contact_email: editing.contact_email.trim(),
                      contact_phone: editing.contact_phone.trim(),
                      company_website: editing.company_website.trim(),
                    });
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
