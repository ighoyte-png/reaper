"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/nav/topbar";
import { EmptyState, Field, Modal, ConfirmDialog, inputClass } from "@/components/ui/form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { formatHours } from "@/lib/domain/budget";
import {
  availableHoursInRange,
  capacityLevel,
  personBookedHoursInRange,
} from "@/lib/domain/capacity";
import { toDateKey, weekEnd, weekStart } from "@/lib/domain/dates";
import { cn } from "@/lib/cn";
import type { LeaveKind, Person } from "@/lib/types";

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
});

export default function PeoplePage() {
  const {
    state,
    upsertPerson,
    deletePerson,
    upsertLeave,
    newId,
    canManage,
    mode,
    inviteDemoMember,
    refresh,
  } = useData();
  const { push } = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<Omit<Person, "organization_id"> | null>(
    null,
  );
  const [isNewPerson, setIsNewPerson] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<Person | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState<boolean | null>(null);
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);
  const start = toDateKey(weekStart(new Date()));
  const end = toDateKey(weekEnd(new Date()));

  useEffect(() => {
    if (!canManage) router.replace("/schedule");
  }, [canManage, router]);

  if (!canManage) {
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
      const row = { ...editing, email };
      await upsertPerson(row);
      setEditing(null);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Topbar
        title="People"
        actions={
          <button
            type="button"
            className="h-8 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
            onClick={() => {
              setIsNewPerson(true);
              setEditing({ ...emptyPerson(), id: newId("person") });
            }}
          >
            Add person
          </button>
        }
      />
      <div className="p-5">
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          Add people with their work email — <strong>Add & invite</strong>{" "}
          emails them. <strong>Invite</strong> / Create invite link only gives
          you a copyable link. Members only see My schedule.
        </p>
        {state.people.length === 0 ? (
          <EmptyState
            title="No people yet"
            cta="Add your first person"
            onClick={() => {
              setIsNewPerson(true);
              setEditing({ ...emptyPerson(), id: newId("person") });
            }}
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Access</th>
                  <th className="px-3 py-2 font-medium">This week</th>
                  <th className="px-3 py-2 font-medium">Rates</th>
                  <th className="px-3 py-2 font-medium" />
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
                        <div className="font-medium">{person.name}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {person.department || "—"} · {person.office || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{person.role_title || "—"}</td>
                      <td className="px-3 py-2.5">
                        {linked ? (
                          <span className="text-xs text-[var(--status-healthy)]">
                            Member · {linked.email}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">
                            No login
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              level === "healthy" && "bg-[var(--status-healthy)]",
                              level === "near" && "bg-[var(--status-near)]",
                              level === "over" && "bg-[var(--status-over)]",
                              level === "unavailable" &&
                                "bg-[var(--status-unavailable)]",
                            )}
                          />
                          {formatHours(booked)} / {formatHours(available)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-muted)]">
                        ${person.cost_rate} / ${person.bill_rate}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {!person.profile_id ? (
                          <button
                            type="button"
                            className="text-xs text-[var(--accent)]"
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
                            Invite
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-[var(--accent)]"
                            disabled={inviteBusy}
                            onClick={() =>
                              void createInviteLink(person, {
                                resend: true,
                                sendEmail: true,
                              })
                            }
                          >
                            Resend invite
                          </button>
                        )}
                        <button
                          type="button"
                          className="ml-3 text-xs text-[var(--accent)]"
                          onClick={() => {
                            setIsNewPerson(false);
                            setEditing(person);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ml-3 text-xs text-[var(--text-muted)]"
                          onClick={() => {
                            const date = window.prompt(
                              "Leave date (YYYY-MM-DD)",
                              start,
                            );
                            if (!date) return;
                            const kind = (window.prompt(
                              "Kind: vacation, holiday, sick, training",
                              "vacation",
                            ) || "vacation") as LeaveKind;
                            upsertLeave({
                              id: newId("leave"),
                              person_id: person.id,
                              date,
                              kind,
                              status: "approved",
                            });
                            push("Leave added");
                          }}
                        >
                          Leave
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
          title={isNewPerson ? "Add person" : "Edit person"}
          onClose={() => {
            setEditing(null);
            setIsNewPerson(false);
          }}
        >
          <div className="grid gap-3">
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
              <button
                type="button"
                className="text-sm text-[var(--status-over)]"
                onClick={() => {
                  if (!editing.id || isNewPerson) return;
                  setConfirmDelete(true);
                }}
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
                  onClick={() => {
                    setEditing(null);
                    setIsNewPerson(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saveBusy}
                  className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)] disabled:opacity-60"
                  onClick={() => void savePerson()}
                >
                  {saveBusy
                    ? "Saving…"
                    : isNewPerson
                      ? "Add & invite"
                      : "Save"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && editing && (
        <ConfirmDialog
          title="Delete person?"
          message={`Delete ${editing.name || "this person"}? Their assignments and leave will be removed. This can’t be undone.`}
          confirmLabel="Delete person"
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

      {inviteTarget && (
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
                  <button
                    type="button"
                    className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
                    onClick={() => {
                      setInviteTarget(null);
                      setInviteUrl(null);
                      setInviteEmailSent(null);
                      setInviteEmailError(null);
                    }}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
                    onClick={async () => {
                      await navigator.clipboard.writeText(inviteUrl);
                      push("Invite link copied", "success");
                    }}
                  >
                    Copy link
                  </button>
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
                    <strong>Add & invite</strong> when creating a person if you
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
                  <button
                    type="button"
                    className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
                    onClick={() => setInviteTarget(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={inviteBusy || !inviteEmail.trim()}
                    className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)] disabled:opacity-60"
                    onClick={() => {
                      if (inviteTarget) {
                        void createInviteLink(inviteTarget, {
                          sendEmail: false,
                        });
                      }
                    }}
                  >
                    {inviteBusy ? "Creating…" : "Create invite link"}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
