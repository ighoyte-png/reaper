"use client";

import { Suspense, useMemo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Copy, Mail, Pencil } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { PersonForm, accessLabel } from "@/components/people/person-form";
import { PodFilterBar } from "@/components/people/pod-filter-bar";
import { PodsEditorModal } from "@/components/people/pods-editor-modal";
import { ContractorTag, ManagerTag } from "@/components/projects/project-manager-person";
import { EmptyState, Field, Modal, ConfirmDialog, inputClass, DateInput } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CardGridPlaceholders } from "@/components/ui/card-grid-placeholders";
import { ListCardsViewToggle } from "@/components/ui/list-cards-view-toggle";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { useViewAs } from "@/lib/view-as";
import {
  useLiveUserViewPrefs,
  writeUserViewPrefs,
} from "@/lib/user-view-prefs";
import { formatHours } from "@/lib/domain/budget";
import {
  availableHoursInRange,
  capacityLevel,
  personBookedHoursInRange,
} from "@/lib/domain/capacity";
import { toDateKey, weekEnd, weekStart } from "@/lib/domain/dates";
import {
  filterPeopleByPod,
  peopleInPod,
  podsForPerson,
  sortPods,
  type PodFilter,
} from "@/lib/domain/pods";
import { cn } from "@/lib/cn";
import { isAdmin } from "@/lib/auth/roles";
import type { LeaveKind, Person, Role } from "@/lib/types";
import {
  LEAVE_KINDS,
  leaveKindLabel,
  normalizeLeaveKind,
} from "@/lib/domain/leave";
import { personAvatarColor, randomAvatarColor, sortPeopleContractorsLast } from "@/lib/domain/people";
import { sortPeopleByName } from "@/lib/domain/sorting";
import { uploadPersonAvatarFile } from "@/lib/storage/avatar-upload";

const PEOPLE_FILTER_DEFAULTS: { pod: string } = { pod: "all" };

const actionIconClass =
  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]";

const mutedActionIconClass =
  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]";

const emptyPerson = (
  costRate: number,
): Omit<Person, "organization_id"> => ({
  id: "",
  profile_id: null,
  name: "",
  email: "",
  role_title: "",
  department: "",
  office: "",
  capacity_hours_week: 40,
  cost_rate: Number.isFinite(costRate) ? costRate : 0,
  timezone: "America/Los_Angeles",
  holiday_calendar_id: null,
  avatar_url: null,
  avatar_attachment_id: null,
  hide_from_schedule: false,
  hide_from_utilization: false,
  is_contractor: false,
  avatar_color: null,
  deleted_at: null,
});

export default function PeoplePage() {
  return (
    <Suspense fallback={null}>
      <PeoplePageContent />
    </Suspense>
  );
}

function PeoplePageContent() {
  const {
    state,
    profile,
    upsertPerson,
    deletePerson,
    upsertLeave,
    updateProfileRole,
    setPersonPods,
    newId,
    isPublicShare,
    mode,
    inviteDemoMember,
    refresh,
    ensureScheduleRange,
  } = useData();
  const { effectiveCanManage } = useViewAs();
  const canManage = effectiveCanManage;
  const { push } = useToast();
  const router = useRouter();
  const appHref = useAppHref();
  const admin = isAdmin(profile?.role);
  const viewPrefs = useLiveUserViewPrefs(profile?.id);
  const directoryLayout = viewPrefs.directoryLayout;

  const start = toDateKey(weekStart(new Date()));
  const end = toDateKey(weekEnd(new Date()));

  const { filters, setFilter } = useUrlFilters(PEOPLE_FILTER_DEFAULTS);
  const pods = sortPods(state.pods);
  const showPods = pods.length >= 1;
  const podFilter: PodFilter = pods.some((p) => p.id === filters.pod)
    ? filters.pod
    : "all";
  const selectedPod =
    podFilter !== "all" ? pods.find((p) => p.id === podFilter) : undefined;
  const [showPodsEditor, setShowPodsEditor] = useState(false);

  useEffect(() => {
    if (mode === "supabase") void ensureScheduleRange(start, end);
  }, [mode, ensureScheduleRange, start, end]);

  const [editing, setEditing] = useState<Omit<Person, "organization_id"> | null>(
    null,
  );
  const [isNewPerson, setIsNewPerson] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [editAccessRole, setEditAccessRole] = useState<Role>("member");
  const [selectedPodIds, setSelectedPodIds] = useState<string[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  /** Attachment id present when the edit form opened — used to detect Remove Photo. */
  const [avatarAttachmentIdAtOpen, setAvatarAttachmentIdAtOpen] = useState<
    string | null
  >(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<Person | null>(null);
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveKind, setLeaveKind] = useState<LeaveKind>("vacation");
  const [inviteTarget, setInviteTarget] = useState<Person | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);
  const [inviteResend, setInviteResend] = useState(false);
  const [inviteDelivery, setInviteDelivery] = useState<"email" | "link">(
    "email",
  );
  const [inviteLinkResult, setInviteLinkResult] = useState<{
    name: string;
    email: string;
    actionLink: string;
    resend: boolean;
  } | null>(null);
  const [originalLoginEmail, setOriginalLoginEmail] = useState("");

  const editingLinkedProfile = editing?.profile_id
    ? state.profiles.find((p) => p.id === editing.profile_id)
    : undefined;
  const adminCount = state.profiles.filter((p) => p.role === "admin").length;
  const editingIsLastAdmin =
    Boolean(editingLinkedProfile) &&
    editingLinkedProfile!.role === "admin" &&
    adminCount <= 1;

  useEffect(() => {
    if (!canManage && !isPublicShare) router.replace(appHref("/schedule"));
  }, [canManage, isPublicShare, router]);

  if (!canManage && !isPublicShare) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting…
      </div>
    );
  }

  function openInviteModal(
    person: Person,
    options: { resend?: boolean; emailOverride?: string } = {},
  ) {
    setInviteTarget(person);
    setInviteResend(Boolean(options.resend));
    setInviteDelivery("email");
    setInviteEmailError(null);
    setInviteEmail(
      (options.emailOverride ?? person.email ?? "").trim().toLowerCase(),
    );
  }

  async function submitInvite() {
    if (!inviteTarget) return;
    const person = inviteTarget;
    const resend = inviteResend;
    const delivery = inviteDelivery;
    setInviteEmailError(null);
    setInviteBusy(true);
    const email =
      (inviteEmail || person.email || "").trim().toLowerCase();
    try {
      if (mode === "demo") {
        if (!resend) {
          if (!email) {
            push("Enter an email first", "warning");
            return;
          }
          inviteDemoMember(person.id, email);
          push(
            `Linked demo login for ${person.name}. Switch account in Settings.`,
            "success",
          );
          setInviteTarget(null);
        } else {
          push("Demo mode: use Settings → Switch account.", "success");
          setInviteTarget(null);
        }
        return;
      }

      if (!resend && !email) {
        setInviteEmailError("Email is required");
        push("Enter an email first", "warning");
        return;
      }

      const res = await fetch("/api/invite", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          resend
            ? { personId: person.id, resend: true, delivery }
            : {
                personId: person.id,
                email,
                fullName: person.name,
                delivery,
              },
        ),
      });
      const data = (await res.json()) as {
        error?: string;
        linkedExisting?: boolean;
        emailSent?: boolean;
        actionLink?: string;
        email?: string;
      };
      if (!res.ok) throw new Error(data.error || "Invite failed");
      await refresh();
      setInviteTarget(null);
      const resultEmail = (data.email || email).trim().toLowerCase();
      const actionLink = data.actionLink?.trim() || "";
      if (delivery === "link" && actionLink) {
        setInviteLinkResult({
          name: person.name,
          email: resultEmail,
          actionLink,
          resend,
        });
        push("Invite link ready — copy it below.", "success");
      } else {
        push(
          resend
            ? `Invite email resent to ${resultEmail || "their login"}.`
            : `Invite email sent to ${resultEmail}.`,
          "success",
        );
      }
    } catch (err) {
      setInviteEmailError(
        err instanceof Error ? err.message : "Invite failed",
      );
      push(err instanceof Error ? err.message : "Invite failed", "warning");
    } finally {
      setInviteBusy(false);
    }
  }

  async function savePerson() {
    if (!editing) return;
    if (!editing.name.trim()) {
      push("Name is required", "warning");
      return;
    }
    const email = editing.email.trim().toLowerCase();
    if (isNewPerson && !email) {
      push("Email is required so we can send an invite", "warning");
      return;
    }

    setSaveBusy(true);
    try {
      let avatar_url = editing.avatar_url;
      let avatar_attachment_id = editing.avatar_attachment_id;
      if (avatarFile) {
        const uploaded = await uploadPersonAvatarFile({
          mode,
          organizationId: state.organization.id,
          personId: editing.id,
          file: avatarFile,
        });
        avatar_url = uploaded.avatarUrl;
        avatar_attachment_id = uploaded.avatarAttachmentId;
      } else if (
        mode === "supabase" &&
        !avatar_attachment_id &&
        avatarAttachmentIdAtOpen
      ) {
        // User clicked Remove Photo (clears attachment id). R2 avatars often
        // have a null avatar_url in state — that must NOT delete the image.
        const res = await fetch(`/api/storage/${avatarAttachmentIdAtOpen}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error || "Could not remove photo");
        }
        avatar_url = null;
        avatar_attachment_id = null;
      }
      const avatar_color = editing.avatar_color ?? randomAvatarColor();
      const row = {
        ...editing,
        email,
        avatar_url,
        avatar_attachment_id,
        avatar_color,
      };
      await upsertPerson(row);
      await setPersonPods(row.id, selectedPodIds);

      if (
        mode === "supabase" &&
        row.profile_id &&
        email &&
        email !== originalLoginEmail
      ) {
        const emailRes = await fetch("/api/account/email", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId: row.id, email }),
        });
        const emailData = (await emailRes.json()) as { error?: string };
        if (!emailRes.ok) {
          throw new Error(emailData.error || "Could not update login email");
        }
      }

      if (
        (admin || canManage) &&
        row.profile_id &&
        editingLinkedProfile &&
        editAccessRole !== editingLinkedProfile.role &&
        (admin || editAccessRole !== "admin")
      ) {
        await updateProfileRole(row.profile_id, editAccessRole);
      }

      setEditing(null);
      setAvatarFile(null);
      setAvatarPreview(null);
      setAvatarAttachmentIdAtOpen(null);

      if (isNewPerson && email && !row.profile_id) {
        openInviteModal(
          { ...row, organization_id: state.organization.id },
          { emailOverride: email },
        );
        setIsNewPerson(false);
        push("Person saved — choose how to invite them.");
      } else {
        setIsNewPerson(false);
        push("Person saved");
      }
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not save person", "warning");
    } finally {
      setSaveBusy(false);
    }
  }

  function openEdit(person: Omit<Person, "organization_id">, isNew: boolean) {
    setIsNewPerson(isNew);
    setEditing(person);
    setAvatarFile(null);
    setAvatarPreview(person.avatar_url);
    setAvatarAttachmentIdAtOpen(person.avatar_attachment_id ?? null);
    setOriginalLoginEmail((person.email ?? "").trim().toLowerCase());
    const linked = person.profile_id
      ? state.profiles.find((p) => p.id === person.profile_id)
      : undefined;
    setEditAccessRole(linked?.role ?? "member");
    setSelectedPodIds(
      podsForPerson(person.id, state.pods, state.pod_members).map(
        (pod) => pod.id,
      ),
    );
  }

  function openNewPerson() {
    openEdit(
      {
        ...emptyPerson(state.organization_settings.default_cost_rate),
        id: newId("person"),
        avatar_color: randomAvatarColor(),
      },
      true,
    );
  }

  const peopleSections = useMemo((): {
    heading?: string;
    cards: { person: Person; isManager: boolean }[];
  }[] => {
    if (selectedPod) {
      const manager = selectedPod.manager_person_id
        ? state.people.find((p) => p.id === selectedPod.manager_person_id)
        : undefined;
      const members = sortPeopleContractorsLast(
        peopleInPod(selectedPod, state.people, state.pod_members).filter(
          (p) => p.id !== selectedPod.manager_person_id,
        ),
      );
      return [
        {
          cards: [
            ...(manager ? [{ person: manager, isManager: true }] : []),
            ...members.map((person) => ({ person, isManager: false })),
          ],
        },
      ];
    }

    const filtered = filterPeopleByPod(
      state.people,
      state.pods,
      state.pod_members,
      podFilter,
    );

    if (podFilter === "all") {
      const nonContractors = sortPeopleByName(
        filtered.filter((p) => !p.is_contractor),
      );
      const contractors = sortPeopleByName(
        filtered.filter((p) => p.is_contractor),
      );
      const sections: {
        heading?: string;
        cards: { person: Person; isManager: boolean }[];
      }[] = [
        {
          cards: nonContractors.map((person) => ({
            person,
            isManager: false,
          })),
        },
      ];
      if (contractors.length > 0) {
        sections.push({
          heading: "Contractors",
          cards: contractors.map((person) => ({ person, isManager: false })),
        });
      }
      return sections;
    }

    return [
      {
        cards: sortPeopleContractorsLast(filtered).map((person) => ({
          person,
          isManager: false,
        })),
      },
    ];
  }, [
    selectedPod,
    state.people,
    state.pods,
    state.pod_members,
    podFilter,
  ]);

  const peopleCardCount = peopleSections.reduce(
    (n, section) => n + section.cards.length,
    0,
  );

  function renderPersonCard(person: Person, isManager: boolean) {
    const booked = personBookedHoursInRange(
      person.id,
      start,
      end,
      state.assignments,
      state.leave_days,
    );
    const available = availableHoursInRange(
      person,
      start,
      end,
      state.leave_days,
    );
    const level = capacityLevel(booked, available, available <= 0);
    const personPods = podsForPerson(
      person.id,
      state.pods,
      state.pod_members,
    );
    const linkedProfile = person.profile_id
      ? state.profiles.find((p) => p.id === person.profile_id)
      : undefined;
    return (
      <article
        key={person.id}
        className="flex h-full flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4"
      >
        <div className="flex items-start gap-3">
          <PersonAvatar
            avatarUrl={person.avatar_url}
            avatarAttachmentId={person.avatar_attachment_id}
            name={person.name}
            color={personAvatarColor(person)}
            personId={person.id}
            size="lg"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">
                {person.name}
              </div>
              {person.role_title ? (
                <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                  {person.role_title}
                </div>
              ) : null}
              {person.office ? (
                <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                  City: {person.office}
                </div>
              ) : null}
              {linkedProfile ? (
                <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                  Access: {accessLabel(linkedProfile.role)}
                </div>
              ) : null}
            </div>
            {isManager || person.is_contractor ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {isManager ? <ManagerTag /> : null}
                {person.is_contractor ? <ContractorTag /> : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                level === "healthy" && "bg-[var(--status-healthy)]",
                level === "near" && "bg-[var(--status-near)]",
                level === "over" && "bg-[var(--status-over)]",
                (level === "unavailable" || level === "low") &&
                  "bg-[var(--status-unavailable)]",
              )}
            />
            {formatHours(booked)} / {formatHours(available)} this week
          </div>
          {canManage || personPods.length > 0 ? (
            <div className="mt-3 flex items-center gap-2 border-t border-[var(--border)] pt-2.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-1">
                {personPods.map((pod) => (
                  <span
                    key={pod.id}
                    className="max-w-full truncate rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]"
                    title={pod.name}
                  >
                    {pod.name}
                  </span>
                ))}
              </div>
              {canManage ? renderPersonActions(person) : null}
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  function renderPersonActions(person: Person) {
    return (
      <div className="flex shrink-0 items-center justify-end gap-0.5">
        {!person.profile_id ? (
          <button
            type="button"
            className={actionIconClass}
            title="Invite"
            aria-label="Invite"
            onClick={() => {
              openInviteModal(person, {
                emailOverride: person.email ?? undefined,
              });
            }}
          >
            <Mail size={14} />
          </button>
        ) : (
          <button
            type="button"
            className={actionIconClass}
            title="Resend invite"
            aria-label="Resend invite"
            disabled={inviteBusy}
            onClick={() => {
              openInviteModal(person, { resend: true });
            }}
          >
            <Mail size={14} />
          </button>
        )}
        <button
          type="button"
          className={actionIconClass}
          title="Edit"
          aria-label="Edit"
          onClick={() => {
            openEdit(person, false);
          }}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className={mutedActionIconClass}
          title="Time off"
          aria-label="Time off"
          onClick={() => {
            setLeaveTarget(person);
            setLeaveDate(start);
            setLeaveKind("vacation");
          }}
        >
          <Clock size={14} />
        </button>
      </div>
    );
  }

  function renderPersonListRow(person: Person, isManager: boolean) {
    const booked = personBookedHoursInRange(
      person.id,
      start,
      end,
      state.assignments,
      state.leave_days,
    );
    const available = availableHoursInRange(
      person,
      start,
      end,
      state.leave_days,
    );
    const level = capacityLevel(booked, available, available <= 0);
    const personPods = podsForPerson(
      person.id,
      state.pods,
      state.pod_members,
    );
    const linkedProfile = person.profile_id
      ? state.profiles.find((p) => p.id === person.profile_id)
      : undefined;
    return (
      <article
        key={person.id}
        className="group flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0 hover:bg-[var(--row-hover)]"
      >
        <PersonAvatar
          avatarUrl={person.avatar_url}
          avatarAttachmentId={person.avatar_attachment_id}
          name={person.name}
          color={personAvatarColor(person)}
          personId={person.id}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold leading-tight">
              {person.name}
            </span>
            {isManager ? <ManagerTag /> : null}
            {person.is_contractor ? <ContractorTag /> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-muted)]">
            {person.role_title ? (
              <span className="truncate">{person.role_title}</span>
            ) : null}
            {person.office ? <span className="truncate">{person.office}</span> : null}
            {linkedProfile ? (
              <span className="truncate">
                {accessLabel(linkedProfile.role)}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  level === "healthy" && "bg-[var(--status-healthy)]",
                  level === "near" && "bg-[var(--status-near)]",
                  level === "over" && "bg-[var(--status-over)]",
                  (level === "unavailable" || level === "low") &&
                    "bg-[var(--status-unavailable)]",
                )}
              />
              {formatHours(booked)} / {formatHours(available)}
            </span>
            {personPods.map((pod) => (
              <span
                key={pod.id}
                className="max-w-[8rem] truncate rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium"
                title={pod.name}
              >
                {pod.name}
              </span>
            ))}
          </div>
        </div>
        {canManage ? (
          <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {renderPersonActions(person)}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader
        title="People"
        actions={
          canManage ? (
            <>
              <Button variant="secondary" onClick={() => setShowPodsEditor(true)}>
                Edit Pods
              </Button>
              <Button variant="primary" onClick={openNewPerson}>
                Add Person
              </Button>
            </>
          ) : undefined
        }
      />
      <div className="py-3 sm:py-5">
        {canManage ? (
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            Add people with their work email — <strong>Add & Invite</strong>{" "}
            saves them, then lets you email an invite or copy a one-time link.
            Members only see My Schedule.
          </p>
        ) : null}
        <div className="mb-4 flex justify-end">
          <ListCardsViewToggle
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
        {showPods ? (
          <PodFilterBar
            pods={pods}
            podFilter={podFilter}
            onSelect={(next) => setFilter("pod", next)}
            className="mb-4"
          />
        ) : null}
        {state.people.length === 0 ? (
          canManage ? (
            <EmptyState
              title="No people yet"
              cta="Add Your First Person"
              onClick={openNewPerson}
            />
          ) : (
            <p className="py-16 text-center text-sm text-[var(--text-muted)]">
              No people yet
            </p>
          )
        ) : peopleCardCount === 0 ? (
          <p className="py-16 text-center text-sm text-[var(--text-muted)]">
            No people in this pod yet.
          </p>
        ) : directoryLayout === "list" ? (
          <div className="space-y-4">
            {peopleSections.map((section, sectionIndex) => (
              <div key={section.heading ?? sectionIndex}>
                {section.heading ? (
                  <h2 className="mb-2 text-sm font-semibold">
                    {section.heading}
                  </h2>
                ) : null}
                <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]">
                  {section.cards.map(({ person, isManager }) =>
                    renderPersonListRow(person, isManager),
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {peopleSections.map((section, sectionIndex) => (
              <div key={section.heading ?? sectionIndex} className="contents">
                {section.heading ? (
                  <h2 className="col-span-full mt-2 text-sm font-semibold first:mt-0">
                    {section.heading}
                  </h2>
                ) : null}
                {section.cards.map(({ person, isManager }) =>
                  renderPersonCard(person, isManager),
                )}
                {canManage && section.heading !== "Contractors" ? (
                  <CardGridPlaceholders
                    count={section.cards.length}
                    xlColumns={4}
                    onAdd={openNewPerson}
                    addLabel="Add Person"
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {canManage && editing && (
        <Modal
          title={isNewPerson ? "Add Person" : "Edit Person"}
          className="max-w-[650px]"
          onClose={() => {
            setEditing(null);
            setIsNewPerson(false);
            setAvatarFile(null);
            setAvatarPreview(null);
          }}
        >
          <PersonForm
            key={editing.id || "new"}
            person={editing}
            isNew={isNewPerson}
            saveBusy={saveBusy}
            avatarPreview={avatarPreview}
            avatarInputRef={avatarInputRef}
            onAvatarFile={(file) => {
              setAvatarFile(file);
              setAvatarPreview(URL.createObjectURL(file));
            }}
            onClearAvatar={() => {
              setAvatarFile(null);
              setAvatarPreview(null);
              setEditing({
                ...editing,
                avatar_url: null,
                avatar_attachment_id: null,
              });
              if (avatarInputRef.current) {
                avatarInputRef.current.value = "";
              }
            }}
            onChange={setEditing}
            accessRole={editAccessRole}
            onAccessRoleChange={setEditAccessRole}
            linkedProfile={editingLinkedProfile}
            canEditAccessAsAdmin={Boolean(admin)}
            canEditAccessAsManager={
              Boolean(canManage && !admin && editingLinkedProfile?.role !== "admin")
            }
            isLastAdmin={editingIsLastAdmin}
            holidayCalendars={state.holiday_calendars}
            pods={pods}
            selectedPodIds={selectedPodIds}
            onSelectedPodIdsChange={setSelectedPodIds}
            onSave={() => void savePerson()}
            onCancel={() => {
              setEditing(null);
              setIsNewPerson(false);
              setAvatarFile(null);
              setAvatarPreview(null);
              setAvatarAttachmentIdAtOpen(null);
            }}
            onDelete={
              !isNewPerson && editing.id
                ? () => setConfirmDelete(true)
                : undefined
            }
            saveLabel={isNewPerson ? "Add & Invite" : "Save"}
          />
        </Modal>
      )}

      {canManage && confirmDelete && editing && (
        <ConfirmDialog
          title="Delete Person?"
          message={`Delete ${editing.name || "this person"}? They’ll be removed from schedules and directories. Tasks and comments they created stay and show as “Deleted user”. Their login is removed. This can’t be undone.`}
          confirmLabel="Delete Person"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void (async () => {
              if (!editing.id) return;
              try {
                await deletePerson(editing.id);
                setConfirmDelete(false);
                setEditing(null);
                setIsNewPerson(false);
                push("Person deleted");
              } catch (err) {
                push(
                  err instanceof Error ? err.message : "Could not delete person",
                  "warning",
                );
              }
            })();
          }}
        />
      )}

      {canManage && leaveTarget && (
        <Modal
          title={`Add leave · ${leaveTarget.name}`}
          onClose={() => setLeaveTarget(null)}
        >
          <div className="grid gap-3">
            <Field label="Date">
              <DateInput
                className={inputClass}
                value={leaveDate}
                onChange={(e) => setLeaveDate(e.target.value)}
              />
            </Field>
            <Field label="Type">
              <Select
                value={leaveKind}
                onChange={(v) => setLeaveKind(normalizeLeaveKind(v))}
                options={LEAVE_KINDS.map((kind) => ({
                  value: kind,
                  label: leaveKindLabel(kind),
                }))}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setLeaveTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
                    push("Choose a valid leave date", "warning");
                    return;
                  }
                  upsertLeave({
                    id: newId("leave"),
                    person_id: leaveTarget.id,
                    date: leaveDate,
                    kind: leaveKind,
                    status: "approved",
                    hours_per_day: null,
                    notes: "",
                  });
                  push(`${leaveKindLabel(leaveKind)} added for ${leaveTarget.name}`);
                  setLeaveTarget(null);
                }}
              >
                Add Leave
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {canManage && inviteTarget && (
        <Modal
          title={
            inviteResend
              ? `Resend invite · ${inviteTarget.name}`
              : `Invite ${inviteTarget.name}`
          }
          onClose={() => {
            if (inviteBusy) return;
            setInviteTarget(null);
            setInviteEmailError(null);
          }}
        >
          <div className="grid gap-3">
            {inviteBusy ? (
              <p className="text-sm text-[var(--text-muted)]">
                {inviteDelivery === "link"
                  ? "Creating invite link…"
                  : "Sending invite email…"}
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--text-muted)]">
                  {inviteResend
                    ? "Send another invite so they can set or reset their password."
                    : "Creates a member login linked to this person so they can set a password."}
                </p>
                {!inviteResend ? (
                  <Field label="Work email">
                    <input
                      type="email"
                      className={inputClass}
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="name@company.com"
                    />
                  </Field>
                ) : inviteTarget.email || inviteEmail ? (
                  <p className="text-sm text-[var(--text)]">
                    {inviteTarget.email || inviteEmail}
                  </p>
                ) : null}
                <fieldset className="grid gap-2">
                  <legend className="text-xs font-medium text-[var(--text-muted)]">
                    How to invite
                  </legend>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--border)] px-3 py-2 has-[:checked]:border-[var(--accent)]">
                    <input
                      type="radio"
                      name="invite-delivery"
                      className="mt-0.5"
                      checked={inviteDelivery === "email"}
                      onChange={() => setInviteDelivery("email")}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        Send email
                      </span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        Uses Supabase Auth email (Custom SMTP).
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--border)] px-3 py-2 has-[:checked]:border-[var(--accent)]">
                    <input
                      type="radio"
                      name="invite-delivery"
                      className="mt-0.5"
                      checked={inviteDelivery === "link"}
                      onChange={() => setInviteDelivery("link")}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        Copy invite link
                      </span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        No email — show a one-time link you can copy.
                      </span>
                    </span>
                  </label>
                </fieldset>
                {inviteEmailError ? (
                  <p className="text-xs text-[var(--danger)]">{inviteEmailError}</p>
                ) : null}
                {mode === "demo" && (
                  <p className="text-xs text-[var(--text-muted)]">
                    Demo mode: no email is sent. After inviting, use Settings →
                    Switch account to view as this member.
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => setInviteTarget(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={
                      inviteBusy || (!inviteResend && !inviteEmail.trim())
                    }
                    onClick={() => {
                      void submitInvite();
                    }}
                  >
                    {inviteDelivery === "link"
                      ? inviteBusy
                        ? "Creating…"
                        : "Create Link"
                      : inviteBusy
                        ? "Sending…"
                        : "Send Invite"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {canManage && inviteLinkResult ? (
        <Modal
          title={`Invite link · ${inviteLinkResult.name}`}
          onClose={() => setInviteLinkResult(null)}
        >
          <div className="grid gap-3">
            <p className="text-sm text-[var(--text-muted)]">
              One-time link for{" "}
              <strong className="text-[var(--text)]">
                {inviteLinkResult.email}
              </strong>
              . Opening it sets their password.
            </p>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
              <p className="break-all font-mono text-xs leading-relaxed text-[var(--text)]">
                {inviteLinkResult.actionLink}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setInviteLinkResult(null)}
              >
                Done
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      inviteLinkResult.actionLink,
                    );
                    push("Invite link copied", "success");
                  } catch {
                    push("Could not copy — select the link manually", "warning");
                  }
                }}
              >
                <Copy size={14} />
                Copy link
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {canManage && showPodsEditor ? (
        <PodsEditorModal onClose={() => setShowPodsEditor(false)} />
      ) : null}
    </PageContainer>
  );
}
