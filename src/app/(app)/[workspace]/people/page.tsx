"use client";

import { Suspense, useMemo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Mail, Pencil } from "lucide-react";
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
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { useViewAs } from "@/lib/view-as";
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

const emptyPerson = (): Omit<Person, "organization_id"> => ({
  id: "",
  profile_id: null,
  name: "",
  email: "",
  role_title: "",
  department: "",
  office: "",
  capacity_hours_week: 40,
  cost_rate: 70,
  bill_rate: 140,
  timezone: "America/Los_Angeles",
  holiday_calendar_id: null,
  avatar_url: null,
  avatar_attachment_id: null,
  hide_from_schedule: false,
  hide_from_utilization: false,
  is_contractor: false,
  avatar_color: null,
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
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [resendTarget, setResendTarget] = useState<Person | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<Person | null>(null);
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveKind, setLeaveKind] = useState<LeaveKind>("vacation");
  const [inviteTarget, setInviteTarget] = useState<Person | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);
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

  async function createInviteLink(
    person: Person,
    options: {
      resend?: boolean;
      emailOverride?: string;
    } = {},
  ) {
    const resend = Boolean(options.resend);
    setInviteTarget(person);
    setInviteEmailError(null);
    setInviteBusy(true);
    const email =
      (options.emailOverride ?? inviteEmail ?? person.email ?? "")
        .trim()
        .toLowerCase();
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

      const res = await fetch("/api/invite", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          resend
            ? { personId: person.id, resend: true }
            : {
                personId: person.id,
                email,
                fullName: person.name,
              },
        ),
      });
      const data = (await res.json()) as {
        error?: string;
        linkedExisting?: boolean;
        emailSent?: boolean;
      };
      if (!res.ok) throw new Error(data.error || "Invite failed");
      await refresh();
      if (data.emailSent) {
        push(
          resend
            ? "Invite email resent. They can set a password from the link."
            : "Invite email sent. They can set a password from the link.",
          "success",
        );
      } else {
        push("Invite processed.", "success");
      }
      setInviteTarget(null);
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
        !avatar_url &&
        avatar_attachment_id &&
        mode === "supabase"
      ) {
        const res = await fetch(`/api/storage/${avatar_attachment_id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error || "Could not remove photo");
        }
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

      if (isNewPerson && email && !row.profile_id) {
        setInviteEmail(email);
        await createInviteLink(
          { ...row, organization_id: state.organization.id },
          { emailOverride: email },
        );
        setIsNewPerson(false);
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
        className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4"
      >
        <div className="flex items-start gap-3">
          <PersonAvatar
            avatarUrl={person.avatar_url}
            avatarAttachmentId={person.avatar_attachment_id}
            name={person.name}
            color={personAvatarColor(person)}
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
        <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
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
            {canManage ? (
              <div className="flex shrink-0 items-center justify-end gap-0.5">
                {!person.profile_id ? (
                  <button
                    type="button"
                    className={actionIconClass}
                    title="Invite"
                    aria-label="Invite"
                    onClick={() => {
                      if (person.email?.trim()) {
                        void createInviteLink(person, {
                          emailOverride: person.email,
                        });
                      } else {
                        setInviteTarget(person);
                        setInviteEmail("");
                      }
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
                    onClick={() => setResendTarget(person)}
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
            ) : null}
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
              <Button
                variant="primary"
                onClick={() => {
                  openEdit(
                    {
                      ...emptyPerson(),
                      id: newId("person"),
                      avatar_color: randomAvatarColor(),
                    },
                    true,
                  );
                }}
              >
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
            emails them. <strong>Invite</strong> / Create Invite Link only gives
            you a copyable link. Members only see My Schedule.
          </p>
        ) : null}
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
              onClick={() => {
                openEdit(
                  {
                    ...emptyPerson(),
                    id: newId("person"),
                    avatar_color: randomAvatarColor(),
                  },
                  true,
                );
              }}
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
          message={`Delete ${editing.name || "this person"}? Their assignments and leave will be removed. This can’t be undone.`}
          confirmLabel="Delete Person"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            if (editing.id) deletePerson(editing.id);
            setConfirmDelete(false);
            setEditing(null);
            setIsNewPerson(false);
            push("Person deleted");
          }}
        />
      )}

      {canManage && resendTarget && (
        <ConfirmDialog
          title="Resend Invite?"
          message={`Send another invite email to ${resendTarget.name}${resendTarget.email ? ` (${resendTarget.email})` : ""}?`}
          confirmLabel="Resend Invite"
          tone="accent"
          onCancel={() => setResendTarget(null)}
          onConfirm={() => {
            const person = resendTarget;
            setResendTarget(null);
            void createInviteLink(person, {
              resend: true,
            });
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
            inviteBusy && inviteTarget.profile_id
              ? `Resending · ${inviteTarget.name}`
              : `Invite ${inviteTarget.name}`
          }
          onClose={() => {
            setInviteTarget(null);
            setInviteEmailError(null);
          }}
        >
          <div className="grid gap-3">
            {inviteBusy ? (
              <p className="text-sm text-[var(--text-muted)]">
                Sending invite email…
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--text-muted)]">
                  Creates a <strong>member</strong> login linked to this person
                  and emails them a secure invite. They set a password from that
                  email.
                </p>
                <Field label="Work email">
                  <input
                    type="email"
                    className={inputClass}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@company.com"
                  />
                </Field>
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
                    disabled={inviteBusy || !inviteEmail.trim()}
                    onClick={() => {
                      if (inviteTarget) {
                        void createInviteLink(inviteTarget);
                      }
                    }}
                  >
                    {inviteBusy ? "Sending…" : "Send Invite Email"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {canManage && showPodsEditor ? (
        <PodsEditorModal onClose={() => setShowPodsEditor(false)} />
      ) : null}
    </PageContainer>
  );
}
