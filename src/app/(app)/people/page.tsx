"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Mail, Pencil } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { EmptyState, Field, Modal, ConfirmDialog, inputClass, DateInput } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useViewAs } from "@/lib/view-as";
import { formatHours } from "@/lib/domain/budget";
import {
  availableHoursInRange,
  capacityLevel,
  personBookedHoursInRange,
} from "@/lib/domain/capacity";
import { toDateKey, weekEnd, weekStart } from "@/lib/domain/dates";
import { cn } from "@/lib/cn";
import { isAdmin } from "@/lib/auth/roles";
import type { LeaveKind, Person, Role } from "@/lib/types";
import {
  LEAVE_KINDS,
  leaveKindLabel,
  normalizeLeaveKind,
} from "@/lib/domain/leave";
import { createClient } from "@/lib/supabase/client";
import {
  readFileAsDataUrl,
  uploadPersonAvatar,
} from "@/lib/supabase/avatar";

const actionIconClass =
  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--accent)] hover:bg-[var(--row-hover)]";

const mutedActionIconClass =
  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]";

function accessLabel(role: Role): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "manager":
      return "Manager";
    default:
      return "Member";
  }
}

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
});

export default function PeoplePage() {
  const {
    state,
    profile,
    upsertPerson,
    deletePerson,
    upsertLeave,
    updateProfileRole,
    newId,
    isPublicShare,
    mode,
    inviteDemoMember,
    refresh,
  } = useData();
  const { effectiveCanManage } = useViewAs();
  const canManage = effectiveCanManage;
  const { push } = useToast();
  const router = useRouter();
  const admin = isAdmin(profile?.role);
  const [editing, setEditing] = useState<Omit<Person, "organization_id"> | null>(
    null,
  );
  const [isNewPerson, setIsNewPerson] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [editAccessRole, setEditAccessRole] = useState<Role>("member");
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
  const start = toDateKey(weekStart(new Date()));
  const end = toDateKey(weekEnd(new Date()));

  const editingLinkedProfile = editing?.profile_id
    ? state.profiles.find((p) => p.id === editing.profile_id)
    : undefined;
  const adminCount = state.profiles.filter((p) => p.role === "admin").length;
  const editingIsLastAdmin =
    Boolean(editingLinkedProfile) &&
    editingLinkedProfile!.role === "admin" &&
    adminCount <= 1;

  useEffect(() => {
    if (!canManage && !isPublicShare) router.replace("/schedule");
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
      const row = { ...editing, email, avatar_url };
      await upsertPerson(row);

      if (
        admin &&
        row.profile_id &&
        editingLinkedProfile &&
        editAccessRole !== editingLinkedProfile.role
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
  }

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader
        title="People"
        actions={
          canManage ? (
            <Button
              variant="primary"
              onClick={() => {
                openEdit({ ...emptyPerson(), id: newId("person") }, true);
              }}
            >
              Add Person
            </Button>
          ) : undefined
        }
      />
      <div className="p-3 sm:p-5">
        {canManage ? (
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            Add people with their work email — <strong>Add & Invite</strong>{" "}
            emails them. <strong>Invite</strong> / Create Invite Link only gives
            you a copyable link. Members only see My Schedule.
          </p>
        ) : null}
        {state.people.length === 0 ? (
          canManage ? (
            <EmptyState
              title="No people yet"
              cta="Add Your First Person"
              onClick={() => {
                openEdit({ ...emptyPerson(), id: newId("person") }, true);
              }}
            />
          ) : (
            <p className="py-16 text-center text-sm text-[var(--text-muted)]">
              No people yet
            </p>
          )
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  {canManage ? (
                    <th className="px-3 py-2 font-medium">Access</th>
                  ) : null}
                  <th className="px-3 py-2 font-medium">This week</th>
                  {canManage ? (
                    <th className="px-3 py-2 font-medium">Rates</th>
                  ) : null}
                  {canManage ? (
                    <th className="px-3 py-2 font-medium" />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {state.people.map((person) => {
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
                  const linked = state.profiles.find(
                    (p) => p.id === person.profile_id,
                  );
                  return (
                    <tr
                      key={person.id}
                      className="border-t border-[var(--border)] hover:bg-[var(--row-hover)]"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <PersonAvatar
                            avatarUrl={person.avatar_url}
                            name={person.name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="font-medium">{person.name}</div>
                            <div className="text-xs text-[var(--text-muted)]">
                              {person.department || "—"} · {person.office || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{person.role_title || "—"}</td>
                      {canManage ? (
                        <td className="px-3 py-2.5">
                          {linked ? (
                            <span className="text-xs">
                              <span className="font-medium text-[var(--status-healthy)]">
                                {accessLabel(linked.role)}
                              </span>
                              {linked.email ? (
                                <span className="text-[var(--text-muted)]">
                                  {" "}
                                  · {linked.email}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">
                              No login
                            </span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              level === "healthy" && "bg-[var(--status-healthy)]",
                              level === "near" && "bg-[var(--status-near)]",
                              level === "over" && "bg-[var(--status-over)]",
                              (level === "unavailable" || level === "low") &&
                                "bg-[var(--status-unavailable)]",
                            )}
                          />
                          {formatHours(booked)} / {formatHours(available)}
                        </span>
                      </td>
                      {canManage ? (
                        <td className="px-3 py-2.5 text-[var(--text-muted)]">
                          ${person.cost_rate} / ${person.bill_rate}
                        </td>
                      ) : null}
                      {canManage ? (
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-0.5">
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
          title={isNewPerson ? "Add Person" : "Edit Person"}
          onClose={() => {
            setEditing(null);
            setIsNewPerson(false);
            setAvatarFile(null);
            setAvatarPreview(null);
          }}
        >
          <div className="grid gap-3">
            <Field label="Photo">
              <div className="flex items-center gap-3">
                <PersonAvatar
                  avatarUrl={avatarPreview}
                  name={editing.name}
                  size="lg"
                />
                <div className="flex flex-col gap-1.5">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (!file) return;
                      setAvatarFile(file);
                      const url = URL.createObjectURL(file);
                      setAvatarPreview(url);
                    }}
                  />
                  <button
                    type="button"
                    className="h-8 w-fit rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 text-xs"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {avatarPreview ? "Change Photo" : "Upload Photo"}
                  </button>
                  {avatarPreview ? (
                    <button
                      type="button"
                      className="w-fit text-xs text-[var(--text-muted)]"
                      onClick={() => {
                        setAvatarFile(null);
                        setAvatarPreview(null);
                        setEditing({ ...editing, avatar_url: null });
                        if (avatarInputRef.current) {
                          avatarInputRef.current.value = "";
                        }
                      }}
                    >
                      Remove Photo
                    </button>
                  ) : null}
                </div>
              </div>
            </Field>
            <Field label="Name">
              <input
                className={inputClass}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Work email">
              <input
                type="email"
                required={isNewPerson}
                className={inputClass}
                value={editing.email}
                onChange={(e) =>
                  setEditing({ ...editing, email: e.target.value })
                }
                placeholder="alex@company.com"
              />
            </Field>
            {isNewPerson && (
              <p className="text-xs text-[var(--text-muted)]">
                We’ll create their account and show an invite link to set a
                password.
              </p>
            )}
            <Field label="Role title">
              <input
                className={inputClass}
                value={editing.role_title}
                onChange={(e) =>
                  setEditing({ ...editing, role_title: e.target.value })
                }
              />
            </Field>
            {editing.profile_id && editingLinkedProfile ? (
              <Field label="Access">
                {admin ? (
                  <>
                    <select
                      className={inputClass}
                      value={editAccessRole}
                      disabled={editingIsLastAdmin}
                      onChange={(e) =>
                        setEditAccessRole(e.target.value as Role)
                      }
                    >
                      <option value="member">Member</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    {editingIsLastAdmin ? (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Keep at least one admin on the workspace.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Controls what this login can manage in the app.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm">
                    {accessLabel(editingLinkedProfile.role)}
                    {editingLinkedProfile.email
                      ? ` · ${editingLinkedProfile.email}`
                      : ""}
                  </p>
                )}
              </Field>
            ) : !isNewPerson ? (
              <p className="text-xs text-[var(--text-muted)]">
                No login linked yet — invite them to set Access.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Department">
                <input
                  className={inputClass}
                  value={editing.department}
                  onChange={(e) =>
                    setEditing({ ...editing, department: e.target.value })
                  }
                />
              </Field>
              <Field label="Office">
                <input
                  className={inputClass}
                  value={editing.office}
                  onChange={(e) =>
                    setEditing({ ...editing, office: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Holiday calendar">
              <select
                className={inputClass}
                value={editing.holiday_calendar_id ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    holiday_calendar_id: e.target.value || null,
                  })
                }
              >
                <option value="">None</option>
                {state.holiday_calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.name}
                    {cal.region ? ` (${cal.region})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Capacity hrs/week">
                <input
                  type="number"
                  className={inputClass}
                  value={editing.capacity_hours_week}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      capacity_hours_week: Number(e.target.value) || 0,
                    })
                  }
                />
              </Field>
              <Field label="Cost rate">
                <input
                  type="number"
                  className={inputClass}
                  value={editing.cost_rate}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      cost_rate: Number(e.target.value) || 0,
                    })
                  }
                />
              </Field>
              <Field label="Bill rate">
                <input
                  type="number"
                  className={inputClass}
                  value={editing.bill_rate}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      bill_rate: Number(e.target.value) || 0,
                    })
                  }
                />
              </Field>
            </div>
            <div className="flex justify-between pt-2">
              <Button
                variant="ghost"
                className="text-[var(--status-over)] hover:text-[var(--status-over)]"
                onClick={() => {
                  if (!editing.id || isNewPerson) return;
                  setConfirmDelete(true);
                }}
              >
                Delete
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setEditing(null);
                    setIsNewPerson(false);
                    setAvatarFile(null);
                    setAvatarPreview(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  disabled={saveBusy}
                  onClick={() => void savePerson()}
                >
                  {saveBusy
                    ? "Saving…"
                    : isNewPerson
                      ? "Add & Invite"
                      : "Save"}
                </Button>
              </div>
            </div>
          </div>
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
              <select
                className={inputClass}
                value={leaveKind}
                onChange={(e) =>
                  setLeaveKind(normalizeLeaveKind(e.target.value))
                }
              >
                {LEAVE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {leaveKindLabel(kind)}
                  </option>
                ))}
              </select>
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
    </PageContainer>
  );
}
