"use client";

import { Suspense, useEffect, useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Globe,
  Mail,
  Pencil,
  Phone,
  Search,
  User,
  type LucideIcon,
} from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { applyProjectManagerScheduleTime } from "@/components/projects/apply-pm-schedule";
import { PmSchedulePromptModal } from "@/components/projects/pm-schedule-prompt-modal";
import { CardGridPlaceholders } from "@/components/ui/card-grid-placeholders";
import { ListCardsViewToggle } from "@/components/ui/list-cards-view-toggle";
import { EmptyState, Field, Modal, ConfirmDialog, inputClass } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { ApplyTemplateDialog } from "@/components/templates/apply-template-dialog";
import type { TemplateApplyOptions } from "@/lib/domain/project-templates";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { useViewAs } from "@/lib/view-as";
import {
  findPmProjectAssignments,
  resolvePmScheduleIntent,
} from "@/lib/domain/project-manager-schedule";
import { sortClientsByName } from "@/lib/domain/sorting";
import {
  buildProjectMembersPayload,
  type ContractorTerms,
} from "@/lib/domain/contractor";
import { reapplyContractorWindowsOnProjectSave, deleteNonDollarContractorExpensesOnSave } from "@/lib/domain/contractor-window-reapply";
import { cn } from "@/lib/cn";
import {
  useLiveUserViewPrefs,
  writeUserViewPrefs,
} from "@/lib/user-view-prefs";
import type { Client, ClientStatus, Project } from "@/lib/types";

type StatusFilter = "active" | "archived" | "all";

const CLIENT_FILTER_DEFAULTS: { status: string; q: string } = {
  status: "active",
  q: "",
};
const VALID_CLIENT_STATUS = new Set<string>(["active", "archived", "all"]);

function IconInput({
  icon: Icon,
  className,
  ...props
}: ComponentPropsWithoutRef<"input"> & { icon: LucideIcon }) {
  return (
    <span className="relative block">
      <Icon
        size={14}
        strokeWidth={1.75}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        aria-hidden
      />
      <input className={cn(inputClass, "pl-8", className)} {...props} />
    </span>
  );
}

function ContactLine({
  icon: Icon,
  children,
  href,
  external,
}: {
  icon: LucideIcon;
  children: ReactNode;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <>
      <Icon
        size={12}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0 text-[var(--text-muted)]"
        aria-hidden
      />
      <span className="min-w-0 truncate">{children}</span>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
        className="flex min-w-0 items-start gap-1.5 hover:text-[var(--text)]"
      >
        {content}
      </a>
    );
  }
  return (
    <p className="flex min-w-0 items-start gap-1.5 text-[var(--text)]">
      {content}
    </p>
  );
}

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
    bill_rate: 150,
    budget_monthly_reset: false,
    notes: "",
    manager_person_id: null,
    hide_from_public_share: false,
    sandbox_mode: false,
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
  return (
    <Suspense fallback={null}>
      <ClientsPageContent />
    </Suspense>
  );
}

function ClientsPageContent() {
  const {
    state,
    profile,
    upsertClient,
    deleteClient,
    upsertProject,
    setProjectMembers,
    applyProjectTemplate,
    upsertAssignment,
    deleteAssignment,
    ensureScheduleRange,
    newId,
    isPublicShare,
    upsertProjectContractorExpense,
    deleteProjectContractorExpense,
  } = useData();
  const { effectiveCanManage } = useViewAs();
  const canManage = effectiveCanManage;
  const { push } = useToast();
  const viewPrefs = useLiveUserViewPrefs(profile?.id);
  const directoryLayout = viewPrefs.directoryLayout;
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
  const [contractorTerms, setContractorTerms] = useState<
    Record<string, ContractorTerms>
  >({});
  const [createTemplateId, setCreateTemplateId] = useState("");
  const [pendingCreateApply, setPendingCreateApply] = useState(false);
  const [pmDailyHours, setPmDailyHours] = useState<number | null>(null);
  const [pmPrompt, setPmPrompt] = useState<{
    kind: "overwrite" | "align";
    hours: number;
    project: Omit<Project, "organization_id">;
  } | null>(null);
  const { filters, setFilter, setFilters } = useUrlFilters(
    CLIENT_FILTER_DEFAULTS,
    { debounceMs: { q: 250 } },
  );
  const statusFilter = (
    VALID_CLIENT_STATUS.has(filters.status) ? filters.status : "active"
  ) as StatusFilter;
  const query = filters.q;

  useEffect(() => {
    if (!VALID_CLIENT_STATUS.has(filters.status)) {
      setFilters({ status: "active" });
    }
  }, [filters.status, setFilters]);

  const clients = sortClientsByName(state.clients);

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (statusFilter !== "all" && (c.status ?? "active") !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        c.name,
        c.status ?? "active",
        c.notes ?? "",
        c.contact_email ?? "",
        c.contact_first_name ?? "",
        c.contact_last_name ?? "",
        c.contact_phone ?? "",
        c.company_website ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [clients, statusFilter, query]);

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
    setContractorTerms({});
    setCreateTemplateId("");
    setPendingCreateApply(false);
    setPmDailyHours(null);
    setProjectDraft(emptyProject(newId("proj"), clientId));
  }

  async function applyPmSchedule(
    project: Omit<Project, "organization_id">,
    hours: number,
  ) {
    if (!project.manager_person_id || !project.start_date || !project.end_date) {
      return;
    }
    const result = await applyProjectManagerScheduleTime({
      organizationId: state.organization.id,
      projectId: project.id,
      managerPersonId: project.manager_person_id,
      startDate: project.start_date,
      endDate: project.end_date,
      hoursPerDay: hours,
      assignments: state.assignments,
      leaveDays: state.leave_days,
      newId,
      upsertAssignment,
      deleteAssignment,
      ensureScheduleRange,
    });
    if (!result.created && result.reason) {
      push(result.reason, "warning");
    } else if (result.leaveTrimmed) {
      push("Trimmed around time off to avoid overlap", "warning");
    }
  }

  async function saveFollowUpProject(
    project: Omit<Project, "organization_id">,
    members: string[],
    terms: Record<string, ContractorTerms>,
    templateToApply: string,
    templateOptions?: TemplateApplyOptions,
  ) {
    try {
      const saved = await upsertProject({
        ...project,
        budget_hours:
          project.budget_mode === "hours" ? project.budget_hours : null,
        budget_amount:
          project.budget_mode === "amount" ? project.budget_amount : null,
        budget_monthly_reset:
          project.budget_mode === "hours" || project.budget_mode === "amount"
            ? project.budget_monthly_reset
            : false,
      });
      const memberPayload = buildProjectMembersPayload(
        members,
        terms,
        state.people,
      );
      await setProjectMembers(saved.id, memberPayload);
      await deleteNonDollarContractorExpensesOnSave({
        projectId: saved.id,
        members: memberPayload,
        expenses: state.project_contractor_expenses,
        deleteExpense: deleteProjectContractorExpense,
      });
      const applyToast = await reapplyContractorWindowsOnProjectSave({
        project: { ...project, id: saved.id },
        members: memberPayload,
        expenses: state.project_contractor_expenses,
        newId,
        upsertExpense: upsertProjectContractorExpense,
      });
      if (templateToApply && templateOptions) {
        await applyProjectTemplate(
          saved.id,
          templateToApply,
          templateOptions,
        );
      }

      const managerId = project.manager_person_id;
      const existing = managerId
        ? findPmProjectAssignments(state.assignments, managerId, saved.id)
        : [];
      const hoursForIntent =
        pmDailyHours != null && pmDailyHours > 0 ? pmDailyHours : null;
      const intent = resolvePmScheduleIntent({
        pmDailyHours: hoursForIntent,
        managerPersonId: managerId,
        startDate: project.start_date,
        endDate: project.end_date,
        existing,
        datesChanged: false,
      });

      const finish = () => {
        setProjectDraft(null);
        setMemberIds([]);
        setContractorTerms({});
        setCreateTemplateId("");
        setPmDailyHours(null);
      };

      if (intent.kind === "need_dates") {
        push(
          "Set start and completion dates to book project manager schedule time",
          "warning",
        );
        if (applyToast) push(applyToast);
      } else if (intent.kind === "overwrite" || intent.kind === "align") {
        finish();
        setPmPrompt({
          kind: intent.kind,
          hours: intent.hours,
          project: { ...project, id: saved.id },
        });
        push(
          templateToApply ? "Project created from template" : "Project saved",
        );
        if (applyToast) push(applyToast);
        router.push(projectHref(saved));
        return;
      } else if (intent.kind === "create") {
        await applyPmSchedule({ ...project, id: saved.id }, intent.hours);
      }

      finish();
      push(
        templateToApply ? "Project created from template" : "Project saved",
      );
      if (applyToast) push(applyToast);
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
      <div className="py-3 sm:py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="relative block w-full min-w-[12rem] max-w-xs sm:w-56">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setFilter("q", e.target.value)}
              placeholder="Search…"
              className={cn(inputClass, "h-8 pl-8 text-sm")}
              aria-label="Search clients"
            />
          </label>
          <div className="flex gap-1 overflow-x-auto">
            {(["active", "archived", "all"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter("status", f)}
                className={cn(
                  "inline-flex h-8 shrink-0 cursor-pointer items-center rounded-md border px-3 text-xs capitalize transition-colors",
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
          <ListCardsViewToggle
            className="ml-auto"
            value={directoryLayout}
            onChange={(next) => {
              if (!profile?.id) return;
              writeUserViewPrefs(profile.id, {
                ...viewPrefs,
                directoryLayout: next,
              });
            }}
          />
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
            {query.trim()
              ? "No clients match your search."
              : `No ${statusFilter} clients.`}
          </p>
        ) : directoryLayout === "list" ? (
          <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]">
            {filteredClients.map((client) => {
              const count = projectCountByClient.get(client.id) ?? 0;
              const archived = client.status === "archived";
              const pocName = contactDisplayName(client);
              return (
                <article
                  key={client.id}
                  className={cn(
                    "group flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0 hover:bg-[var(--row-hover)]",
                    archived && "opacity-60",
                  )}
                >
                  <ProjectColorBar color={client.color} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold leading-tight">
                      {client.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-muted)]">
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
                      <span>
                        {count} {count === 1 ? "project" : "projects"}
                      </span>
                      {pocName ? <span className="truncate">{pocName}</span> : null}
                    </div>
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                        onClick={() => toggleArchive(client)}
                        aria-label={
                          archived
                            ? `Unarchive ${client.name}`
                            : `Archive ${client.name}`
                        }
                        title={archived ? "Unarchive" : "Archive"}
                      >
                        {archived ? (
                          <ArchiveRestore size={14} strokeWidth={1.75} />
                        ) : (
                          <Archive size={14} strokeWidth={1.75} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                        onClick={() =>
                          setEditing(normalizeClientContact(client))
                        }
                        aria-label={`Edit ${client.name}`}
                        title="Edit"
                      >
                        <Pencil size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
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
                    "group flex gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-4",
                    archived && "opacity-60",
                  )}
                >
                  <ProjectColorBar color={client.color} size="stretch" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="mb-3 min-w-0">
                      <div className="flex items-start gap-1">
                        <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
                          {client.name}
                        </div>
                        {canManage ? (
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <button
                              type="button"
                              className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                              onClick={() => toggleArchive(client)}
                              aria-label={
                                archived
                                  ? `Unarchive ${client.name}`
                                  : `Archive ${client.name}`
                              }
                              title={archived ? "Unarchive" : "Archive"}
                            >
                              {archived ? (
                                <ArchiveRestore size={14} strokeWidth={1.75} />
                              ) : (
                                <Archive size={14} strokeWidth={1.75} />
                              )}
                            </button>
                            <button
                              type="button"
                              className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                              onClick={() =>
                                setEditing(normalizeClientContact(client))
                              }
                              aria-label={`Edit ${client.name}`}
                              title="Edit"
                            >
                              <Pencil size={14} strokeWidth={1.75} />
                            </button>
                          </div>
                        ) : null}
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

                    <div className="mt-auto space-y-1.5 text-xs text-[var(--text-muted)]">
                      {pocName ? (
                        <ContactLine icon={User}>{pocName}</ContactLine>
                      ) : null}
                      {client.contact_email?.trim() ? (
                        <ContactLine
                          icon={Mail}
                          href={`mailto:${client.contact_email.trim()}`}
                        >
                          {client.contact_email.trim()}
                        </ContactLine>
                      ) : null}
                      {client.contact_phone?.trim() ? (
                        <ContactLine
                          icon={Phone}
                          href={`tel:${client.contact_phone.trim()}`}
                        >
                          {client.contact_phone.trim()}
                        </ContactLine>
                      ) : null}
                      {site ? (
                        <ContactLine icon={Globe} href={site} external>
                          {(client.company_website || site).replace(
                            /^https?:\/\//i,
                            "",
                          )}
                        </ContactLine>
                      ) : null}
                      {client.notes?.trim() ? (
                        <p className="line-clamp-2 pt-0.5">{client.notes}</p>
                      ) : null}
                    </div>
                  </div>
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
                  <IconInput
                    icon={User}
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
                  <IconInput
                    icon={User}
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
                  <IconInput
                    icon={Mail}
                    type="email"
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
                  <IconInput
                    icon={Phone}
                    type="tel"
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
                  <IconInput
                    icon={Globe}
                    type="url"
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
            setContractorTerms({});
            setCreateTemplateId("");
            setPendingCreateApply(false);
          }}
        >
          <ProjectForm
            project={projectDraft}
            clients={state.clients}
            people={state.people}
            pods={state.pods}
            podMembers={state.pod_members}
            memberIds={memberIds}
            onMemberIdsChange={setMemberIds}
            contractorTerms={contractorTerms}
            onContractorTermsChange={setContractorTerms}
            onChange={setProjectDraft}
            canManage={canManage}
            pmDailyHours={pmDailyHours}
            onPmDailyHoursChange={setPmDailyHours}
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
              void saveFollowUpProject(
                projectDraft,
                memberIds,
                contractorTerms,
                "",
              );
            }}
            onCancel={() => {
              setProjectDraft(null);
              setMemberIds([]);
              setContractorTerms({});
              setCreateTemplateId("");
              setPendingCreateApply(false);
              setPmDailyHours(null);
            }}
          />
        </Modal>
      ) : null}

      {pendingCreateApply && projectDraft && createTemplateId ? (
        <ApplyTemplateDialog
          templateId={createTemplateId}
          projectName={projectDraft.name}
          onCancel={() => setPendingCreateApply(false)}
          onConfirm={(options) => {
            const templateToApply = createTemplateId;
            setPendingCreateApply(false);
            void saveFollowUpProject(
              projectDraft,
              memberIds,
              contractorTerms,
              templateToApply,
              options,
            );
          }}
        />
      ) : null}

      {pmPrompt ? (
        <PmSchedulePromptModal
          kind={pmPrompt.kind}
          onSkip={() => setPmPrompt(null)}
          onConfirm={async () => {
            const pending = pmPrompt;
            setPmPrompt(null);
            await applyPmSchedule(pending.project, pending.hours);
            push("Project manager schedule updated");
          }}
        />
      ) : null}
    </PageContainer>
  );
}
