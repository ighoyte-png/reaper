"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Mail, Pencil } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { PersonForm } from "@/components/people/person-form";
import { PodFilterBar } from "@/components/people/pod-filter-bar";
import { PodsEditorModal } from "@/components/people/pods-editor-modal";
import { ManagerTag } from "@/components/projects/project-manager-person";
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
import { personAvatarColor, randomAvatarColor } from "@/lib/domain/people";
import { createClient } from "@/lib/supabase/client";
import {
  readFileAsDataUrl,
  uploadPersonAvatar,
} from "@/lib/supabase/avatar";

const PEOPLE_FILTER_DEFAULTS: { pod: string } = { pod: "all" };

const actionIconClass =
  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--accent)] hover:bg-[var(--row-hover)]";

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
  hide_from_schedule: false,
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
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState<boolean | null>(null);
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);

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
      sendEmail?: boolean;
      emailOverride?: string;
    } = {},
  ) {
    const resend = Boolean(options.resend);
    const sendEmail = Boolean(options.sendEmail);
    setInviteTarget(person);
    setInviteUrl(null);
    setInviteEmailSent(null);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          resend
            ? { personId: person.id, resend: true, sendEmail }
            : {
                personId: person.id,
                email,
                fullName: person.name,
                sendEmail,
              },
        ),
      });
      const data = (await res.json()) as {
        error?: string;
        linkedExisting?: boolean;
        inviteUrl?: string | null;
        emailSent?: boolean;
        emailError?: string | null;
      };
      if (!res.ok) throw new Error(data.error || "Invite failed");
      await refresh();
      setInviteEmailSent(Boolean(data.emailSent));
      setInviteEmailError(data.emailError ?? null);
      if (data.inviteUrl) {
        setInviteUrl(data.inviteUrl);
        if (data.emailSent) {
          push("Invite email sent. You can also copy the link below.", "success");
        } else if (data.emailError) {
          const rateLimited = /rate.?limit/i.test(data.emailError);
          push(
            rateLimited
              ? "Email rate limit hit (Supabase free tier is ~2/hour). User was still created — copy the link below."
              : `Email not sent (${data.emailError}). User was created — copy the link below.`,
            "warning",
          );
        } else {
          push("Invite link ready — copy and share it.", "success");
        }
      } else if (data.emailSent) {
        push("Invite email sent. They can set a password from the link.", "success");
        setInviteTarget(null);
      } else {
        push(
          data.linkedExisting
            ? "Account linked. They can sign in if they already have a password."
            : "No invite URL returned. Check Supabase Auth → Users.",
          "warning",
        );
        setInviteTarget(null);
      }
    } catch (err) {
      push(err instanceof Error ? err.message : "Invite failed", "warning");
      if (resend) setInviteTarget(null);
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
      if (avatarFile) {
        if (mode === "supabase") {
          const supabase = createClient();
          avatar_url = await uploadPersonAvatar(
            supabase,
            editing.id,
            avatarFile,
          );
        } else {
          avatar_url = await readFileAsDataUrl(avatarFile);
        }
      }
      const avatar_color = editing.avatar_color ?? randomAvatarColor();
      const row = { ...editing, email, avatar_url, avatar_color };
      await upsertPerson(row);
      await setPersonPods(row.id, selectedPodIds);

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
          { sendEmail: true, emailOverride: email },
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

  const peopleCards: { person: Person; isManager: boolean }[] = selectedPod
    ? (() => {
        const manager = selectedPod.manager_person_id
          ? state.people.find((p) => p.id === selectedPod.manager_person_id)
          : undefined;
        const members = peopleInPod(
          selectedPod,
          state.people,
          state.pod_members,
        ).filter((p) => p.id !== selectedPod.manager_person_id);
        return [
          ...(manager ? [{ person: manager, isManager: true }] : []),
          ...members.map((person) => ({ person, isManager: false })),
        ];
      })()
    : filterPeopleByPod(
        state.people,
        state.pods,
        state.pod_members,
        podFilter,
      ).map((person) => ({ person, isManager: false }));

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
    return (
      <article
        key={person.id}
        className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4"
      >
        <div className="flex items-start gap-3">
          <PersonAvatar
            avatarUrl={person.avatar_url}
            name={person.name}
            color={personAvatarColor(person)}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="truncate text-sm font-semibold leading-tight">
                {person.name}
              </div>
              {isManager ? <ManagerTag /> : null}
            </div>
            {person.role_title ? (
              <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                {person.role_title}
              </div>
            ) : null}
            <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
              {person.department || "—"} · {person.office || "—"}
            </div>
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
        {canManage ? (
          <div className="mt-3 flex items-center justify-end gap-0.5 border-t border-[var(--border)] pt-2.5">
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
                    setInviteUrl(null);
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
        ) : peopleCards.length === 0 ? (
          <p className="py-16 text-center text-sm text-[var(--text-muted)]">
            No people in this pod yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {peopleCards.map(({ person, isManager }) =>
              renderPersonCard(person, isManager),
            )}
          </div>
        )}
      </div>

      {canManage && editing && (
        <Modal
          title={isNewPerson ? "Add Person" : "Edit Person"}
          className="max-w-3xl"
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
              setEditing({ ...editing, avatar_url: null });
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
              sendEmail: true,
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
            inviteUrl
              ? `Invite link · ${inviteTarget.name}`
              : inviteBusy && inviteTarget.profile_id
                ? `Resending · ${inviteTarget.name}`
                : `Invite ${inviteTarget.name}`
          }
          onClose={() => {
            setInviteTarget(null);
            setInviteUrl(null);
            setInviteEmailSent(null);
            setInviteEmailError(null);
          }}
        >
          <div className="grid gap-3">
            {inviteBusy && !inviteUrl ? (
              <p className="text-sm text-[var(--text-muted)]">
                Preparing invite…
              </p>
            ) : inviteUrl ? (
              <>
                <p className="text-sm text-[var(--text-muted)]">
                  {inviteEmailSent
                    ? "Invite email was sent. Copyable link below as backup."
                    : inviteEmailError
                      ? `No email sent (${inviteEmailError}). Share this link so they can set a password.`
                      : "No email was sent — copy and share this link so they can set a password."}
                </p>
                <textarea
                  className={`${inputClass} h-28 py-2 font-mono text-xs`}
                  readOnly
                  value={inviteUrl}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => {
                      setInviteTarget(null);
                      setInviteUrl(null);
                      setInviteEmailSent(null);
                      setInviteEmailError(null);
                    }}
                  >
                    Done
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={async () => {
                      await navigator.clipboard.writeText(inviteUrl);
                      push("Invite link copied", "success");
                    }}
                  >
                    Copy Link
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--text-muted)]">
                  Creates a <strong>member</strong> login linked to this person.
                  They can view their own schedule only.
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
                {mode === "supabase" && (
                  <p className="text-xs text-[var(--text-muted)]">
                    Creates a copyable invite link only (no email). Use{" "}
                    <strong>Add & Invite</strong> when creating a person if you
                    want Supabase to email them.
                  </p>
                )}
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
                        void createInviteLink(inviteTarget, {
                          sendEmail: false,
                        });
                      }
                    }}
                  >
                    {inviteBusy ? "Creating…" : "Create Invite Link"}
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
