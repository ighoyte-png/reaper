"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { useTheme, type Theme } from "@/components/theme/theme-provider";
import { useToast } from "@/components/toast/toast-provider";
import { Field, Modal, ConfirmDialog, inputClass, DateInput } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { usePwaInstall } from "@/components/pwa/pwa-provider";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { useViewAs } from "@/lib/view-as";
import { clientSiteOrigin, publicShareUrl } from "@/lib/share/token";
import { uploadPersonAvatarFile } from "@/lib/storage/avatar-upload";
import { isAdmin } from "@/lib/auth/roles";
import { personAvatarColor } from "@/lib/domain/people";
import { sortPeopleByName } from "@/lib/domain/sorting";
import type { HolidayCalendar, HolidayCalendarDay } from "@/lib/types";
import { AdminBudgetSettingsForm } from "@/components/settings/admin-budget-settings-form";
import { NotificationDevicesSettings } from "@/components/settings/notification-devices-settings";
import { normalizeOrgBudgetSettings } from "@/lib/domain/org-settings";
import {
  CONTENT_WIDTH_OPTIONS,
  SCHEDULE_VIEW_OFFSET_OPTIONS,
  readUserViewPrefs,
  startPageOptions,
  useUserViewPrefs,
  type ContentWidth,
  type DefaultStartPage,
  type ScheduleViewOffset,
  type UserViewPrefs,
} from "@/lib/user-view-prefs";

type SettingsTab =
  | "account"
  | "preferences"
  | "sharing"
  | "holidays"
  | "admin"
  | "advanced";

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
    updatePersonAvatar,
    updateOrganizationName,
    updateOrganizationSlug,
    upsertOrganizationSettings,
    enableOrgMultiCurrency,
    disableOrgMultiCurrency,
    createAdditionalWorkspace,
    newId,
    updateDemoShare,
  } = useData();
  const { clearViewAs } = useViewAs();
  const { theme, setTheme } = useTheme();
  const { push } = useToast();
  const {
    isInstalled: pwaInstalled,
    canInstall: pwaCanInstall,
    install: installPwa,
    showInstallPrompt,
  } = usePwaInstall();
  const router = useRouter();
  const appHref = useAppHref();
  const admin = isAdmin(profile?.role);
  const { prefs, setPrefs, savePrefs } = useUserViewPrefs(profile?.id);
  const [tab, setTab] = useState<SettingsTab>("account");
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState<UserViewPrefs>(() =>
    readUserViewPrefs(profile?.id),
  );
  const [themeDraft, setThemeDraft] = useState<Theme>(theme);
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [orgName, setOrgName] = useState(state.organization.name);
  const [orgBusy, setOrgBusy] = useState(false);
  const [slugModalOpen, setSlugModalOpen] = useState(false);
  const [workspaceSlugDraft, setWorkspaceSlugDraft] = useState(
    state.organization.slug,
  );
  const [slugBusy, setSlugBusy] = useState(false);
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [createWsName, setCreateWsName] = useState("");
  const [createWsBusy, setCreateWsBusy] = useState(false);
  const [allowWorkspaceSignup, setAllowWorkspaceSignup] = useState(true);
  const [pwBusy, setPwBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [calBusy, setCalBusy] = useState(false);
  const [editingCalId, setEditingCalId] = useState<string | null>(null);
  const [confirmDeleteCal, setConfirmDeleteCal] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [newCalName, setNewCalName] = useState("");
  const [newCalRegion, setNewCalRegion] = useState("US");
  const [calNameDraft, setCalNameDraft] = useState("");
  const [calRegionDraft, setCalRegionDraft] = useState("");
  const [dayDate, setDayDate] = useState("");
  const [dayName, setDayName] = useState("");
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editDayDate, setEditDayDate] = useState("");
  const [editDayName, setEditDayName] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!orgModalOpen) setOrgName(state.organization.name);
  }, [state.organization.name, orgModalOpen]);

  useEffect(() => {
    if (!slugModalOpen) setWorkspaceSlugDraft(state.organization.slug);
  }, [state.organization.slug, slugModalOpen]);

  useEffect(() => {
    setThemeDraft(theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/platform/me");
        if (!res.ok) return;
        const body = (await res.json()) as { isPlatformAdmin?: boolean };
        if (!cancelled) setIsPlatformAdmin(Boolean(body.isPlatformAdmin));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/platform/settings");
        if (!res.ok) return;
        const body = (await res.json()) as {
          allow_workspace_signup?: boolean;
        };
        if (cancelled) return;
        const allow = body.allow_workspace_signup !== false;
        setAllowWorkspaceSignup(allow);
        if (!allow) setCreateWsOpen(false);
      } catch {
        /* default allow */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fromStore = readUserViewPrefs(profile?.id);
    setPrefs(fromStore);
    setSavedPrefs(fromStore);
  }, [profile?.id, setPrefs]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    async function loadShare() {
      if (mode === "demo") {
        const enabled = Boolean(state.organization.share_enabled);
        const token = state.organization.share_token ?? null;
        if (!cancelled) {
          setShareEnabled(enabled);
          setShareUrl(
            enabled && token
              ? publicShareUrl(clientSiteOrigin(), token)
              : null,
          );
        }
        return;
      }
      try {
        const res = await fetch("/api/share");
        const body = (await res.json()) as {
          enabled?: boolean;
          token?: string | null;
          url?: string | null;
          error?: string;
        };
        if (!res.ok) {
          if (!cancelled && body.error) {
            setShareEnabled(false);
            setShareUrl(null);
          }
          return;
        }
        if (!cancelled) {
          const enabled = Boolean(body.enabled);
          const token = body.token ?? null;
          setShareEnabled(enabled);
          setShareUrl(
            enabled && token
              ? publicShareUrl(clientSiteOrigin(), token)
              : null,
          );
        }
      } catch {
        /* ignore */
      }
    }
    void loadShare();
    return () => {
      cancelled = true;
    };
  }, [
    canManage,
    mode,
    state.organization.share_enabled,
    state.organization.share_token,
  ]);

  const showAdvancedTab =
    (mode === "demo" && state.profiles.length > 1) ||
    canManage ||
    isPlatformAdmin;

  const tabs = useMemo(() => {
    const items: { id: SettingsTab; label: string }[] = [
      { id: "account", label: "Account" },
      { id: "preferences", label: "Preferences" },
    ];
    if (canManage) {
      items.push(
        { id: "sharing", label: "Sharing" },
        { id: "holidays", label: "Holidays" },
        { id: "admin", label: "Admin" },
      );
    }
    if (showAdvancedTab) {
      items.push({ id: "advanced", label: "Advanced" });
    }
    return items;
  }, [canManage, showAdvancedTab]);

  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab("account");
  }, [tabs, tab]);

  const prefsDirty =
    themeDraft !== theme ||
    prefs.defaultStartPage !== savedPrefs.defaultStartPage ||
    prefs.scheduleViewOffset !== savedPrefs.scheduleViewOffset ||
    prefs.contentWidth !== savedPrefs.contentWidth;

  function savePreferences() {
    setPrefsBusy(true);
    try {
      savePrefs();
      setTheme(themeDraft);
      setSavedPrefs(prefs);
      push("Settings saved", "success");
    } finally {
      setPrefsBusy(false);
    }
  }

  async function setShare(action: "enable" | "disable" | "rotate") {
    setShareBusy(true);
    try {
      if (mode === "demo") {
        const result = updateDemoShare(action);
        setShareEnabled(result.enabled);
        setShareUrl(result.url);
        push(
          action === "disable"
            ? "Public Link turned off"
            : action === "rotate"
              ? "Public Link regenerated"
              : "Public Link turned on",
        );
        return;
      }
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json()) as {
        enabled?: boolean;
        token?: string | null;
        url?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Could not update public link");
      const enabled = Boolean(body.enabled);
      const token = body.token ?? null;
      setShareEnabled(enabled);
      setShareUrl(
        enabled && token
          ? publicShareUrl(clientSiteOrigin(), token)
          : null,
      );
      push(
        action === "disable"
          ? "Public Link turned off"
          : action === "rotate"
            ? "Public Link regenerated"
            : "Public Link turned on",
      );
    } catch (err) {
      push(
        err instanceof Error ? err.message : "Could not update public link",
        "warning",
      );
    } finally {
      setShareBusy(false);
    }
  }

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

  async function saveAvatarFile(file: File) {
    if (!myPerson) return;
    setAvatarBusy(true);
    try {
      const { avatarUrl, avatarAttachmentId } = await uploadPersonAvatarFile({
        mode,
        organizationId: state.organization.id,
        personId: myPerson.id,
        file,
      });
      await updatePersonAvatar(
        myPerson.id,
        avatarUrl,
        avatarAttachmentId,
      );
      push("Photo updated", "success");
    } catch (err) {
      push(
        err instanceof Error ? err.message : "Could not update photo",
        "warning",
      );
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function clearAvatar() {
    if (!myPerson) return;
    setAvatarBusy(true);
    try {
      await updatePersonAvatar(myPerson.id, null);
      push("Photo removed");
    } catch (err) {
      push(
        err instanceof Error ? err.message : "Could not remove photo",
        "warning",
      );
    } finally {
      setAvatarBusy(false);
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

  function saveCalendar() {
    if (!editingCal) return;
    const name = calNameDraft.trim();
    if (!name) {
      push("Calendar name required", "warning");
      return;
    }
    upsertHolidayCalendar({
      id: editingCal.id,
      name,
      region: calRegionDraft.trim(),
    });
    push("Calendar saved");
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

  function beginEditDay(day: HolidayCalendarDay) {
    setEditingDayId(day.id);
    setEditDayDate(day.date);
    setEditDayName(day.name);
  }

  function cancelEditDay() {
    setEditingDayId(null);
    setEditDayDate("");
    setEditDayName("");
  }

  function saveCalendarDay(calendarId: string) {
    if (!editingDayId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDayDate)) {
      push("Use date format YYYY-MM-DD", "warning");
      return;
    }
    const conflict = state.holiday_calendar_days.find(
      (d) =>
        d.calendar_id === calendarId &&
        d.date === editDayDate &&
        d.id !== editingDayId,
    );
    if (conflict) {
      push("That date is already on this calendar", "warning");
      return;
    }
    upsertHolidayCalendarDay({
      id: editingDayId,
      calendar_id: calendarId,
      date: editDayDate,
      name: editDayName.trim() || "Holiday",
    });
    cancelEditDay();
    push("Holiday date saved");
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
        push(
          `Applied ${n} statutory leave day(s). Existing holidays were refreshed; other leave on those days was left alone.`,
          "success",
        );
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

  useEffect(() => {
    const cal = state.holiday_calendars.find((c) => c.id === editingCalId);
    if (!cal) {
      setCalNameDraft("");
      setCalRegionDraft("");
      setEditingDayId(null);
      setEditDayDate("");
      setEditDayName("");
      return;
    }
    setCalNameDraft(cal.name);
    setCalRegionDraft(cal.region);
    setEditingDayId(null);
    setEditDayDate("");
    setEditDayName("");
    // Only when selecting a different calendar — don't clobber drafts on save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCalId]);

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title="Settings" />
      <div className="mx-auto flex max-w-5xl flex-col gap-4 py-3 sm:flex-row sm:items-start sm:gap-0 sm:py-5">
        <nav
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border)] pb-2 sm:w-44 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3"
          aria-label="Settings sections"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors",
                tab === item.id
                  ? "bg-[var(--row-hover)] font-medium text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
              )}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-4 sm:pl-5">
          {tab === "account" ? (
            <>
              <Panel>
                <h2 className="text-sm font-semibold">Organization</h2>
                <div className="mt-2 flex items-center gap-1.5">
                  <p className="text-sm">{state.organization.name || "—"}</p>
                  {admin ? (
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                      title="Edit organization name"
                      aria-label="Edit organization name"
                      onClick={() => {
                        setOrgName(state.organization.name);
                        setOrgModalOpen(true);
                      }}
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                  ) : null}
                </div>
                <div className="mt-3">
                  <p className="text-xs font-medium text-[var(--text-muted)]">
                    Workspace URL
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <p className="font-mono text-sm text-[var(--text)]">
                      /{state.organization.slug || "—"}
                    </p>
                    {admin ? (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                        title="Edit workspace URL"
                        aria-label="Edit workspace URL"
                        onClick={() => {
                          setWorkspaceSlugDraft(state.organization.slug);
                          setSlugModalOpen(true);
                        }}
                      >
                        <Pencil size={14} strokeWidth={1.75} />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Changing this updates all signed-in app links. Organization
                    name renames do not change the URL.
                  </p>
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Signed in as {profile?.full_name} ({profile?.role})
                  {myPerson ? ` · linked to ${myPerson.name}` : ""} ·{" "}
                  {mode === "supabase" ? "Supabase" : "Local demo"}
                </p>
                {mode === "supabase" ? (
                  <div className="mt-4 border-t border-[var(--border)] pt-3">
                    <h3 className="text-xs font-semibold text-[var(--text)]">
                      Another workspace
                    </h3>
                    {allowWorkspaceSignup ? (
                      <>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Your login can belong to more than one workspace.
                          Create a new one as admin without leaving this
                          account.
                        </p>
                        <Button
                          className="mt-2"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setCreateWsName("");
                            setCreateWsOpen(true);
                          }}
                        >
                          Create workspace
                        </Button>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        New workspace creation is currently closed by the
                        platform admin. You can still switch to workspaces you
                        already belong to.
                      </p>
                    )}
                  </div>
                ) : null}
              </Panel>

              {myPerson ? (
                <Panel>
                  <h2 className="text-sm font-semibold">Profile Photo</h2>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Shown on your dashboard and client portals when you&apos;re
                    on a project team.
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <PersonAvatar
                      avatarUrl={myPerson.avatar_url}
                      avatarAttachmentId={myPerson.avatar_attachment_id}
                      name={myPerson.name}
                      size="lg"
                      personId={myPerson.id}
                      color={personAvatarColor(myPerson)}
                    />
                    <div className="flex flex-col gap-1.5">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={avatarBusy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void saveAvatarFile(file);
                        }}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={avatarBusy}
                        className="w-fit"
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        {avatarBusy
                          ? "Saving…"
                          : myPerson.avatar_url || myPerson.avatar_attachment_id
                            ? "Change Photo"
                            : "Upload Photo"}
                      </Button>
                      {myPerson.avatar_url || myPerson.avatar_attachment_id ? (
                        <button
                          type="button"
                          disabled={avatarBusy}
                          className="w-fit cursor-pointer text-xs text-[var(--text-muted)] disabled:opacity-60"
                          onClick={() => void clearAvatar()}
                        >
                          Remove Photo
                        </button>
                      ) : null}
                    </div>
                  </div>
                </Panel>
              ) : null}

              {mode === "supabase" ? (
                <Panel>
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
                    {pwError ? (
                      <p className="text-sm text-[var(--status-over)]">
                        {pwError}
                      </p>
                    ) : null}
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      disabled={pwBusy}
                    >
                      {pwBusy ? "Updating…" : "Update Password"}
                    </Button>
                  </form>
                </Panel>
              ) : null}

              <Button
                variant="secondary"
                size="lg"
                onClick={async () => {
                  await logout();
                  router.push("/login");
                }}
              >
                Sign Out
              </Button>
            </>
          ) : null}

          {tab === "preferences" ? (
            <Panel>
              <h2 className="text-sm font-semibold">Preferences</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Theme and default views are saved on this device for your
                account. Changes apply when you save.
              </p>

              <div className="mt-4 space-y-4">
                <Field label="Theme">
                  <Select
                    value={themeDraft}
                    onChange={(v) => setThemeDraft(v as Theme)}
                    options={[
                      { value: "light", label: "Light" },
                      { value: "dark", label: "Dark" },
                    ]}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Default Start Page">
                    <p className="mt-0.5 text-[11px] font-normal leading-snug text-[var(--text-muted)]">
                      Start page is used after login and when opening the app
                      root.
                    </p>
                    <Select
                      value={prefs.defaultStartPage}
                      onChange={(v) =>
                        setPrefs((prev) => ({
                          ...prev,
                          defaultStartPage: v as DefaultStartPage,
                        }))
                      }
                      options={startPageOptions(canManage)}
                    />
                  </Field>
                  <Field label="Schedule View Offset">
                    <p className="mt-0.5 text-[11px] font-normal leading-snug text-[var(--text-muted)]">
                      Schedule offset shifts the first visible week earlier when
                      you open the schedule.
                    </p>
                    <Select
                      value={prefs.scheduleViewOffset}
                      onChange={(v) =>
                        setPrefs((prev) => ({
                          ...prev,
                          scheduleViewOffset: v as ScheduleViewOffset,
                        }))
                      }
                      options={SCHEDULE_VIEW_OFFSET_OPTIONS}
                    />
                  </Field>
                </div>
                <Field label="Page Width">
                  <p className="mt-0.5 text-[11px] font-normal leading-snug text-[var(--text-muted)]">
                    Page width constrains most pages to 1400px or expands them;
                    the schedule is always full width.
                  </p>
                  <Select
                    value={prefs.contentWidth}
                    onChange={(v) =>
                      setPrefs((prev) => ({
                        ...prev,
                        contentWidth: v as ContentWidth,
                      }))
                    }
                    options={CONTENT_WIDTH_OPTIONS}
                  />
                </Field>

                <div className="rounded-md border border-[var(--border)] p-3">
                  <p className="text-sm font-medium text-[var(--text)]">
                    Desktop app
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Install Reaper on this device for a dedicated window and
                    quicker access from your desktop.
                  </p>
                  <div className="mt-3">
                    {pwaInstalled ? (
                      <p className="text-sm text-[var(--text-muted)]">
                        You&apos;re using the installed Reaper app.
                      </p>
                    ) : pwaCanInstall ? (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => {
                          void (async () => {
                            const ok = await installPwa();
                            if (ok) {
                              push("Install started", "success");
                            } else {
                              showInstallPrompt();
                              push(
                                "Use the install prompt, or Chrome’s Install option in the address bar.",
                              );
                            }
                          })();
                        }}
                      >
                        Install Reaper app
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-[var(--text-muted)]">
                          Your browser doesn&apos;t have an install prompt ready
                          yet. Try Chrome or Edge, or use the browser menu →
                          Install app / Install page as app.
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            showInstallPrompt();
                            push(
                              "If Chrome offers Install in the address bar, use that. Otherwise check the browser menu.",
                            );
                          }}
                        >
                          Show install tip
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <NotificationDevicesSettings />
              </div>

              <div className="mt-4 flex items-center justify-end border-t border-[var(--border)] pt-3">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={prefsBusy || !prefsDirty}
                  onClick={savePreferences}
                >
                  {prefsBusy ? "Saving…" : "Save"}
                </Button>
              </div>
            </Panel>
          ) : null}

          {tab === "sharing" && canManage ? (
            <Panel>
              <h2 className="text-sm font-semibold">Public Link</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Share a read-only board with schedule, people, projects,
                clients, and reports. Anyone with the link can view — nothing is
                editable.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={shareBusy}
                  onClick={() =>
                    void setShare(shareEnabled ? "disable" : "enable")
                  }
                >
                  {shareBusy
                    ? "Updating…"
                    : shareEnabled
                      ? "Turn Off Public Link"
                      : "Turn On Public Link"}
                </Button>
                {shareEnabled ? (
                  <Button
                    variant="secondary"
                    size="lg"
                    disabled={shareBusy}
                    onClick={() => void setShare("rotate")}
                  >
                    Regenerate Link
                  </Button>
                ) : null}
              </div>
              {shareEnabled && shareUrl ? (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs text-[var(--text-muted)]">
                    Public URL
                    <input
                      readOnly
                      className={inputClass}
                      value={shareUrl}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </label>
                  <button
                    type="button"
                    className="cursor-pointer text-xs text-[var(--accent)]"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareUrl);
                        push("Public Link copied", "success");
                      } catch {
                        push(
                          "Could not copy — select the URL manually",
                          "warning",
                        );
                      }
                    }}
                  >
                    Copy Link
                  </button>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {tab === "holidays" && canManage ? (
            <Panel>
              <h2 className="text-sm font-semibold">Holiday Calendars</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Global calendars (e.g. US vs Canada). Assign on People, then
                apply to create statutory leave days and clear overlapping
                bookings.
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
                      className={`cursor-pointer rounded-md border px-3 py-1.5 text-left text-xs ${
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
                <Button variant="secondary" size="lg" onClick={addCalendar}>
                  Add
                </Button>
              </div>

              {editingCal ? (
                <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_6rem_auto]">
                      <Field label="Calendar name">
                        <input
                          className={inputClass}
                          value={calNameDraft}
                          onChange={(e) => setCalNameDraft(e.target.value)}
                        />
                      </Field>
                      <Field label="Region">
                        <input
                          className={inputClass}
                          value={calRegionDraft}
                          onChange={(e) => setCalRegionDraft(e.target.value)}
                        />
                      </Field>
                      <div className="flex items-end">
                        <Button
                          variant="secondary"
                          size="lg"
                          className="w-full sm:w-auto"
                          onClick={saveCalendar}
                          disabled={
                            calNameDraft.trim() === editingCal.name &&
                            calRegionDraft.trim() === editingCal.region
                          }
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-5">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={calBusy}
                        onClick={() => void applyCalendar(editingCal.id)}
                      >
                        {calBusy ? "Applying…" : "Apply To Assigned People"}
                      </Button>
                      <Button
                        variant="destructiveOutline"
                        size="sm"
                        onClick={() =>
                          setConfirmDeleteCal({
                            id: editingCal.id,
                            name: editingCal.name,
                          })
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  <Field label="Assign people">
                    <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] p-2">
                      {state.people.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          No people yet.
                        </p>
                      ) : (
                        sortPeopleByName(state.people).map((person) => (
                          <label
                            key={person.id}
                            className="flex cursor-pointer items-center gap-2 text-sm"
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
                          editingDays.map((day) => {
                            const isEditing = editingDayId === day.id;
                            return (
                              <tr
                                key={day.id}
                                className="border-t border-[var(--border)]"
                              >
                                {isEditing ? (
                                  <>
                                    <td className="px-3 py-2">
                                      <DateInput
                                        className={cn(inputClass, "mt-0 h-8")}
                                        value={editDayDate}
                                        onChange={(e) =>
                                          setEditDayDate(e.target.value)
                                        }
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        className={cn(inputClass, "mt-0 h-8")}
                                        value={editDayName}
                                        onChange={(e) =>
                                          setEditDayName(e.target.value)
                                        }
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <div className="flex justify-end gap-2">
                                        <button
                                          type="button"
                                          className="cursor-pointer text-xs font-medium text-[var(--accent)]"
                                          onClick={() =>
                                            saveCalendarDay(editingCal.id)
                                          }
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          className="cursor-pointer text-xs text-[var(--text-muted)]"
                                          onClick={cancelEditDay}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-3 py-2">{day.date}</td>
                                    <td className="px-3 py-2">
                                      {day.name || "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <div className="flex justify-end gap-2">
                                        <button
                                          type="button"
                                          className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                                          title="Edit"
                                          aria-label="Edit holiday date"
                                          onClick={() => beginEditDay(day)}
                                        >
                                          <Pencil
                                            size={12}
                                            strokeWidth={1.75}
                                          />
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          className="cursor-pointer text-xs text-[var(--text-muted)]"
                                          onClick={() => {
                                            if (editingDayId === day.id) {
                                              cancelEditDay();
                                            }
                                            deleteHolidayCalendarDay(day.id);
                                            push("Date removed");
                                          }}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
                    <DateInput
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
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => addCalendarDay(editingCal.id)}
                    >
                      Add Date
                    </Button>
                  </div>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {tab === "admin" && canManage ? (
            <Panel>
              <h2 className="text-sm font-semibold">Admin</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Workspace defaults for rates, project budget health colors, and
                capacity utilization thresholds.
              </p>
              <div className="mt-4">
                <AdminBudgetSettingsForm
                  initial={normalizeOrgBudgetSettings(
                    state.organization_settings,
                    state.organization.id,
                  )}
                  onSave={async (next) => {
                    await upsertOrganizationSettings(next);
                    push("Admin settings saved", "success");
                  }}
                  onEnableMultiCurrency={async (next) => {
                    await upsertOrganizationSettings({
                      ...next,
                      currency_enabled: false,
                    });
                    await enableOrgMultiCurrency(next.usd_to_cad_rate);
                    push("Multi-currency enabled", "success");
                  }}
                  onDisableMultiCurrency={async (next, saveAs) => {
                    await upsertOrganizationSettings({
                      ...next,
                      currency_enabled: true,
                    });
                    await disableOrgMultiCurrency(saveAs);
                    push(
                      saveAs === "cad"
                        ? "Saved as CAD and turned off multi-currency"
                        : "Saved as USD and turned off multi-currency",
                      "success",
                    );
                  }}
                />
              </div>
            </Panel>
          ) : null}

          {tab === "advanced" ? (
            <>
              {mode === "demo" && state.profiles.length > 1 ? (
                <Panel>
                  <h2 className="text-sm font-semibold">
                    Switch Account (Demo)
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    After inviting a person, switch here to see My Schedule as
                    that member.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {state.profiles.map((p) => (
                      <Button
                        key={p.id}
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          clearViewAs();
                          switchDemoProfile(p.id);
                          push(
                            `Switched to ${p.full_name} (${p.role})`,
                            "success",
                          );
                          router.push(appHref("/schedule"));
                        }}
                      >
                        {p.full_name} · {p.role}
                      </Button>
                    ))}
                  </div>
                </Panel>
              ) : null}

              {canManage ? (
                <Panel>
                  <h2 className="text-sm font-semibold">Demo Data</h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {mode === "supabase"
                      ? "Clears this organization’s planning data in Supabase and loads the sample schedule narrative."
                      : "Reset the local workspace to the seeded schedule narrative."}
                  </p>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="mt-3"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await resetDemo();
                        push("Demo Data restored", "success");
                      } catch (err) {
                        push(
                          err instanceof Error
                            ? err.message
                            : "Failed to load demo",
                          "warning",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? "Loading…" : "Load Demo Data"}
                  </Button>
                </Panel>
              ) : null}

              {isPlatformAdmin ? (
                <Panel>
                  <h2 className="text-sm font-semibold">Backend</h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {mode === "supabase"
                      ? "Using Supabase. Invites need SUPABASE_SERVICE_ROLE_KEY in .env (server-only)."
                      : "Local demo store. Set Supabase env vars for real auth + invites."}
                  </p>
                  {authError ? (
                    <p className="mt-2 text-sm text-[var(--status-over)]">
                      {authError}
                    </p>
                  ) : null}
                </Panel>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {orgModalOpen ? (
        <Modal
          title="Edit Organization Name"
          onClose={() => {
            if (orgBusy) return;
            setOrgModalOpen(false);
            setOrgName(state.organization.name);
          }}
        >
          <div className="space-y-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                maxLength={120}
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={orgBusy}
                onClick={() => {
                  setOrgModalOpen(false);
                  setOrgName(state.organization.name);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={
                  orgBusy ||
                  !orgName.trim() ||
                  orgName.trim() === state.organization.name
                }
                onClick={() => {
                  void (async () => {
                    setOrgBusy(true);
                    try {
                      await updateOrganizationName(orgName);
                      push("Organization name saved");
                      setOrgModalOpen(false);
                    } catch (err) {
                      push(
                        err instanceof Error
                          ? err.message
                          : "Could not save organization name",
                        "warning",
                      );
                    } finally {
                      setOrgBusy(false);
                    }
                  })();
                }}
              >
                {orgBusy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {createWsOpen && allowWorkspaceSignup ? (
        <Modal
          title="Create workspace"
          onClose={() => {
            if (!createWsBusy) setCreateWsOpen(false);
          }}
        >
          <div className="space-y-3">
            <Field label="Workspace name">
              <input
                className={inputClass}
                value={createWsName}
                onChange={(e) => setCreateWsName(e.target.value)}
                maxLength={120}
                placeholder="e.g. New studio"
                autoFocus
              />
            </Field>
            <p className="text-xs text-[var(--text-muted)]">
              You&apos;ll be an admin. Switch between workspaces from your
              profile menu.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={createWsBusy}
                onClick={() => setCreateWsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={createWsBusy || !createWsName.trim()}
                onClick={() => {
                  void (async () => {
                    setCreateWsBusy(true);
                    try {
                      await createAdditionalWorkspace(createWsName.trim());
                      push("Workspace created");
                      setCreateWsOpen(false);
                    } catch (err) {
                      const message =
                        err instanceof Error && err.message.trim()
                          ? err.message
                          : "Could not create workspace";
                      push(message, "warning");
                    } finally {
                      setCreateWsBusy(false);
                    }
                  })();
                }}
              >
                {createWsBusy ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {slugModalOpen ? (
        <Modal
          title="Edit Workspace URL"
          onClose={() => {
            if (slugBusy) return;
            setSlugModalOpen(false);
            setWorkspaceSlugDraft(state.organization.slug);
          }}
        >
          <div className="space-y-3">
            <Field label="URL slug">
              <div className="flex items-center gap-1">
                <span className="text-sm text-[var(--text-muted)]">/</span>
                <input
                  className={inputClass}
                  value={workspaceSlugDraft}
                  onChange={(e) =>
                    setWorkspaceSlugDraft(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]+/g, "-")
                        .replace(/-{2,}/g, "-"),
                    )
                  }
                  maxLength={64}
                  autoFocus
                  spellCheck={false}
                />
              </div>
            </Field>
            <p className="text-xs text-[var(--text-muted)]">
              Letters, numbers, and hyphens. This must be unique across all
              workspaces.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={slugBusy}
                onClick={() => {
                  setSlugModalOpen(false);
                  setWorkspaceSlugDraft(state.organization.slug);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={
                  slugBusy ||
                  !workspaceSlugDraft.trim() ||
                  workspaceSlugDraft.trim() === state.organization.slug
                }
                onClick={() => {
                  void (async () => {
                    setSlugBusy(true);
                    try {
                      const next = workspaceSlugDraft.trim();
                      await updateOrganizationSlug(next);
                      push("Workspace URL saved");
                      setSlugModalOpen(false);
                      router.replace(`/${next}/settings`);
                    } catch (err) {
                      push(
                        err instanceof Error
                          ? err.message
                          : "Could not save workspace URL — it may already be taken",
                        "warning",
                      );
                    } finally {
                      setSlugBusy(false);
                    }
                  })();
                }}
              >
                {slugBusy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {confirmDeleteCal ? (
        <ConfirmDialog
          title="Delete calendar?"
          message={`Delete calendar “${confirmDeleteCal.name}”?`}
          confirmLabel="Delete"
          onCancel={() => setConfirmDeleteCal(null)}
          onConfirm={() => {
            deleteHolidayCalendar(confirmDeleteCal.id);
            if (editingCalId === confirmDeleteCal.id) setEditingCalId(null);
            setConfirmDeleteCal(null);
            push("Calendar deleted");
          }}
        />
      ) : null}
    </PageContainer>
  );
}
