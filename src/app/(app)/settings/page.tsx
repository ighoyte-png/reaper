"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/nav/topbar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useToast } from "@/components/toast/toast-provider";
import { Field, inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import type { HolidayCalendar, HolidayCalendarDay } from "@/lib/types";

export default function SettingsPage() {
  const {
    state,
    profile,
    resetDemo,
    logout,
    mode,
    authError,
    canManage,
    switchDemoProfile,
    myPerson,
    changePassword,
    upsertHolidayCalendar,
    deleteHolidayCalendar,
    upsertHolidayCalendarDay,
    deleteHolidayCalendarDay,
    applyHolidayCalendar,
    upsertPerson,
    newId,
  } = useData();
  const { push } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [calBusy, setCalBusy] = useState(false);
  const [editingCalId, setEditingCalId] = useState<string | null>(null);
  const [newCalName, setNewCalName] = useState("");
  const [newCalRegion, setNewCalRegion] = useState("US");
  const [dayDate, setDayDate] = useState("");
  const [dayName, setDayName] = useState("");

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      push("Password updated", "success");
    } catch (err) {
      setPwError(
        err instanceof Error ? err.message : "Could not update password",
      );
    } finally {
      setPwBusy(false);
    }
  }

  function addCalendar() {
    const name = newCalName.trim();
    if (!name) {
      push("Calendar name required", "warning");
      return;
    }
    const row: Omit<HolidayCalendar, "organization_id"> = {
      id: newId("cal"),
      name,
      region: newCalRegion.trim(),
    };
    upsertHolidayCalendar(row);
    setNewCalName("");
    setEditingCalId(row.id);
    push("Calendar created");
  }

  function addCalendarDay(calendarId: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) {
      push("Use date format YYYY-MM-DD", "warning");
      return;
    }
    const existing = state.holiday_calendar_days.find(
      (d) => d.calendar_id === calendarId && d.date === dayDate,
    );
    const row: Omit<HolidayCalendarDay, "organization_id"> = {
      id: existing?.id ?? newId("calday"),
      calendar_id: calendarId,
      date: dayDate,
      name: dayName.trim() || "Holiday",
    };
    upsertHolidayCalendarDay(row);
    setDayDate("");
    setDayName("");
    push("Holiday date added");
  }

  async function applyCalendar(calendarId: string) {
    setCalBusy(true);
    try {
      const n = await applyHolidayCalendar(calendarId);
      if (n === 0) {
        push(
          "No dates applied — assign people to this calendar and add holiday dates first.",
          "warning",
        );
      } else {
        push(`Applied ${n} statutory leave day(s)`, "success");
      }
    } catch (err) {
      push(err instanceof Error ? err.message : "Apply failed", "warning");
    } finally {
      setCalBusy(false);
    }
  }

  const editingCal = state.holiday_calendars.find((c) => c.id === editingCalId);
  const editingDays = state.holiday_calendar_days
    .filter((d) => d.calendar_id === editingCalId)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Topbar title="Settings" />
      <div className="mx-auto max-w-2xl space-y-4 p-5">
        <section className="rounded-md border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">Organization</h2>
          <p className="mt-2 text-sm">{state.organization.name || "—"}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Signed in as {profile?.full_name} ({profile?.role})
            {myPerson ? ` · linked to ${myPerson.name}` : ""} ·{" "}
            {mode === "supabase" ? "Supabase" : "Local demo"}
          </p>
        </section>

        {mode === "supabase" && (
          <section className="rounded-md border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold">Password</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Change the password for {profile?.email || "your account"}.
            </p>
            <form onSubmit={onChangePassword} className="mt-3 space-y-3">
              <label className="block text-xs text-[var(--text-muted)]">
                Current password
                <input
                  type="password"
                  required
                  className={inputClass}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                New password
                <input
                  type="password"
                  required
                  minLength={6}
                  className={inputClass}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                Confirm new password
                <input
                  type="password"
                  required
                  minLength={6}
                  className={inputClass}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              {pwError && (
                <p className="text-sm text-[var(--status-over)]">{pwError}</p>
              )}
              <button
                type="submit"
                disabled={pwBusy}
                className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-60"
              >
                {pwBusy ? "Updating…" : "Update password"}
              </button>
            </form>
          </section>
        )}

        <section className="rounded-md border border-[var(--border)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Theme</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Light / dark preference is saved locally.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </section>

        {canManage && (
          <section className="rounded-md border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold">Holiday calendars</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Global calendars (e.g. US vs Canada). Assign on People, then apply
              to create statutory leave days and clear overlapping bookings.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {state.holiday_calendars.map((cal) => {
                const assigned = state.people.filter(
                  (p) => p.holiday_calendar_id === cal.id,
                ).length;
                const dayCount = state.holiday_calendar_days.filter(
                  (d) => d.calendar_id === cal.id,
                ).length;
                return (
                  <button
                    key={cal.id}
                    type="button"
                    className={`rounded-md border px-3 py-1.5 text-left text-xs ${
                      editingCalId === cal.id
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--border)] hover:bg-[var(--row-hover)]"
                    }`}
                    onClick={() => setEditingCalId(cal.id)}
                  >
                    <div className="font-medium">
                      {cal.name}
                      {cal.region ? ` · ${cal.region}` : ""}
                    </div>
                    <div className="text-[var(--text-muted)]">
                      {dayCount} date{dayCount === 1 ? "" : "s"} · {assigned}{" "}
                      people
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_6rem_auto]">
              <input
                className={inputClass}
                placeholder="New calendar name"
                value={newCalName}
                onChange={(e) => setNewCalName(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="Region"
                value={newCalRegion}
                onChange={(e) => setNewCalRegion(e.target.value)}
              />
              <button
                type="button"
                className="h-9 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
                onClick={addCalendar}
              >
                Add
              </button>
            </div>

            {editingCal && (
              <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{editingCal.name}</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={calBusy}
                      className="h-8 rounded-md bg-[var(--accent)] px-3 text-xs text-[var(--accent-fg)] disabled:opacity-60"
                      onClick={() => void applyCalendar(editingCal.id)}
                    >
                      {calBusy ? "Applying…" : "Apply to assigned people"}
                    </button>
                    <button
                      type="button"
                      className="h-8 rounded-md border border-[var(--border)] px-3 text-xs text-[var(--status-over)]"
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Delete calendar “${editingCal.name}”?`,
                          )
                        ) {
                          return;
                        }
                        deleteHolidayCalendar(editingCal.id);
                        setEditingCalId(null);
                        push("Calendar deleted");
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <Field label="Assign people">
                  <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] p-2">
                    {state.people.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        No people yet.
                      </p>
                    ) : (
                      state.people.map((person) => (
                        <label
                          key={person.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={
                              person.holiday_calendar_id === editingCal.id
                            }
                            onChange={(e) => {
                              void upsertPerson({
                                ...person,
                                holiday_calendar_id: e.target.checked
                                  ? editingCal.id
                                  : null,
                              });
                            }}
                          />
                          {person.name}
                        </label>
                      ))
                    )}
                  </div>
                </Field>

                <div className="overflow-x-auto rounded-md border border-[var(--border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {editingDays.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3 py-3 text-xs text-[var(--text-muted)]"
                          >
                            No holiday dates yet.
                          </td>
                        </tr>
                      ) : (
                        editingDays.map((day) => (
                          <tr
                            key={day.id}
                            className="border-t border-[var(--border)]"
                          >
                            <td className="px-3 py-2">{day.date}</td>
                            <td className="px-3 py-2">{day.name || "—"}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                className="text-xs text-[var(--text-muted)]"
                                onClick={() => {
                                  deleteHolidayCalendarDay(day.id);
                                  push("Date removed");
                                }}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
                  <input
                    type="date"
                    className={inputClass}
                    value={dayDate}
                    onChange={(e) => setDayDate(e.target.value)}
                  />
                  <input
                    className={inputClass}
                    placeholder="Holiday name"
                    value={dayName}
                    onChange={(e) => setDayName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="h-9 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
                    onClick={() => addCalendarDay(editingCal.id)}
                  >
                    Add date
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {mode === "demo" && state.profiles.length > 1 && (
          <section className="rounded-md border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold">Switch account (demo)</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              After inviting a person, switch here to see My schedule as that
              member.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {state.profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="h-8 rounded-md border border-[var(--border)] px-3 text-xs hover:bg-[var(--row-hover)]"
                  onClick={() => {
                    switchDemoProfile(p.id);
                    push(`Switched to ${p.full_name} (${p.role})`, "success");
                    router.push("/schedule");
                  }}
                >
                  {p.full_name} · {p.role}
                </button>
              ))}
            </div>
          </section>
        )}

        {canManage && (
          <section className="rounded-md border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold">Demo data</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {mode === "supabase"
                ? "Clears this organization’s planning data in Supabase and loads the sample schedule narrative."
                : "Reset the local workspace to the seeded schedule narrative."}
            </p>
            <button
              type="button"
              disabled={busy}
              className="mt-3 h-9 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)] disabled:opacity-60"
              onClick={async () => {
                setBusy(true);
                try {
                  await resetDemo();
                  push("Demo data restored", "success");
                } catch (err) {
                  push(
                    err instanceof Error ? err.message : "Failed to load demo",
                    "warning",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Loading…" : "Load demo data"}
            </button>
          </section>
        )}

        <section className="rounded-md border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">Backend</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {mode === "supabase"
              ? "Using Supabase. Invites need SUPABASE_SERVICE_ROLE_KEY in .env (server-only)."
              : "Local demo store. Set Supabase env vars for real auth + invites."}
          </p>
          {authError && (
            <p className="mt-2 text-sm text-[var(--status-over)]">{authError}</p>
          )}
        </section>

        <button
          type="button"
          className="h-9 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
          onClick={async () => {
            await logout();
            router.push("/login");
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
