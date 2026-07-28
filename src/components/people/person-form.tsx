"use client";

import { useMemo, useState, type ChangeEvent, type RefObject } from "react";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Field, inputClass } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { personAvatarColor } from "@/lib/domain/people";
import { podsManagedBy, sortPods } from "@/lib/domain/pods";
import type { HolidayCalendar, Person, Pod, Profile, Role } from "@/lib/types";

const BASE_TABS = [
  { id: "details", label: "Details" },
  { id: "access", label: "Access" },
  { id: "capacity", label: "Capacity" },
  { id: "pods", label: "Pods" },
] as const;

type TabId = (typeof BASE_TABS)[number]["id"];

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

export { accessLabel };

export function PersonForm({
  person,
  isNew,
  saveBusy,
  avatarPreview,
  avatarInputRef,
  onAvatarFile,
  onClearAvatar,
  onChange,
  accessRole,
  onAccessRoleChange,
  linkedProfile,
  canEditAccessAsAdmin,
  canEditAccessAsManager,
  isLastAdmin,
  holidayCalendars,
  pods,
  selectedPodIds,
  onSelectedPodIdsChange,
  onSave,
  onCancel,
  onDelete,
  saveLabel,
}: {
  person: Omit<Person, "organization_id">;
  isNew: boolean;
  saveBusy: boolean;
  avatarPreview: string | null;
  avatarInputRef: RefObject<HTMLInputElement | null>;
  onAvatarFile: (file: File) => void;
  onClearAvatar: () => void;
  onChange: (person: Omit<Person, "organization_id">) => void;
  accessRole: Role;
  onAccessRoleChange: (role: Role) => void;
  linkedProfile: Profile | undefined;
  canEditAccessAsAdmin: boolean;
  canEditAccessAsManager: boolean;
  isLastAdmin: boolean;
  holidayCalendars: HolidayCalendar[];
  pods: Pod[];
  selectedPodIds: string[];
  onSelectedPodIdsChange: (ids: string[]) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saveLabel: string;
}) {
  const podsSorted = useMemo(() => sortPods(pods), [pods]);
  const showPodsTab = podsSorted.length > 0;
  const tabs = useMemo(
    () =>
      showPodsTab
        ? [...BASE_TABS]
        : BASE_TABS.filter((t) => t.id !== "pods"),
    [showPodsTab],
  );
  const [tab, setTab] = useState<TabId>("details");
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "details";

  const managedPods = useMemo(
    () => podsManagedBy(person.id, podsSorted),
    [person.id, podsSorted],
  );

  return (
    <div className="flex min-h-[22rem] flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-0">
        <nav
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border)] pb-2 sm:w-40 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3"
          aria-label="Person sections"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors",
                activeTab === item.id
                  ? "bg-[var(--row-hover)] font-medium text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
              )}
              aria-current={activeTab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 min-w-0 flex-1 space-y-3 sm:pl-4">
          {activeTab === "details" ? (
            <>
              <Field label="Photo">
                <div className="mt-2 flex items-center gap-3">
                  <PersonAvatar
                    avatarUrl={avatarPreview}
                    name={person.name}
                    color={personAvatarColor(person)}
                    size="lg"
                  />
                  <div className="flex flex-col gap-1.5">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0] ?? null;
                        if (!file) return;
                        onAvatarFile(file);
                      }}
                    />
                    <button
                      type="button"
                      className="h-8 w-fit cursor-pointer rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 text-xs"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {avatarPreview ? "Change Photo" : "Upload Photo"}
                    </button>
                    {avatarPreview ? (
                      <button
                        type="button"
                        className="w-fit cursor-pointer text-xs text-[var(--text-muted)]"
                        onClick={onClearAvatar}
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
                  value={person.name}
                  onChange={(e) =>
                    onChange({ ...person, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Work email">
                <input
                  type="email"
                  required={isNew}
                  className={inputClass}
                  value={person.email}
                  onChange={(e) =>
                    onChange({ ...person, email: e.target.value })
                  }
                  placeholder="alex@company.com"
                />
              </Field>
              {isNew ? (
                <p className="text-xs text-[var(--text-muted)]">
                  We’ll create their account and show an invite link to set a
                  password.
                </p>
              ) : null}
              <Field label="Role title">
                <input
                  className={inputClass}
                  value={person.role_title}
                  onChange={(e) =>
                    onChange({ ...person, role_title: e.target.value })
                  }
                />
              </Field>
              <Field label="City">
                <input
                  className={inputClass}
                  value={person.office}
                  onChange={(e) =>
                    onChange({ ...person, office: e.target.value })
                  }
                />
              </Field>
            </>
          ) : null}

          {activeTab === "access" ? (
            <>
              {person.profile_id && linkedProfile ? (
                <Field label="Access">
                  {canEditAccessAsAdmin ? (
                    <>
                      <Select
                        value={accessRole}
                        disabled={isLastAdmin}
                        onChange={(v) => onAccessRoleChange(v as Role)}
                        options={[
                          { value: "member", label: "Member" },
                          { value: "manager", label: "Manager" },
                          { value: "admin", label: "Admin" },
                        ]}
                      />
                      {isLastAdmin ? (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Keep at least one admin on the workspace.
                        </p>
                      ) : null}
                    </>
                  ) : canEditAccessAsManager ? (
                    <Select
                      value={accessRole}
                      onChange={(v) => onAccessRoleChange(v as Role)}
                      options={[
                        { value: "member", label: "Member" },
                        { value: "manager", label: "Manager" },
                      ]}
                    />
                  ) : (
                    <p className="text-sm">{accessLabel(linkedProfile.role)}</p>
                  )}
                </Field>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  {isNew
                    ? "Access is set after they accept the invite."
                    : "No login linked yet — invite them to set Access."}
                </p>
              )}
            </>
          ) : null}

          {activeTab === "capacity" ? (
            <>
              <Field label="Holiday calendar">
                <Select
                  searchable
                  value={person.holiday_calendar_id ?? ""}
                  onChange={(v) =>
                    onChange({
                      ...person,
                      holiday_calendar_id: v || null,
                    })
                  }
                  options={[
                    { value: "", label: "None" },
                    ...holidayCalendars.map((cal) => ({
                      value: cal.id,
                      label: cal.region
                        ? `${cal.name} (${cal.region})`
                        : cal.name,
                    })),
                  ]}
                />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(person.hide_from_schedule)}
                  onChange={(e) =>
                    onChange({
                      ...person,
                      hide_from_schedule: e.target.checked,
                    })
                  }
                />
                <span>
                  Hide from schedule &amp; capacity
                  <span className="block text-xs text-[var(--text-muted)]">
                    Management-only accounts stay off the schedule and out of
                    utilization capacity.
                  </span>
                </span>
              </label>
              <Field label="Capacity hrs/week">
                <input
                  type="number"
                  className={inputClass}
                  value={person.capacity_hours_week}
                  onChange={(e) =>
                    onChange({
                      ...person,
                      capacity_hours_week: Number(e.target.value) || 0,
                    })
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cost rate">
                  <input
                    type="number"
                    className={inputClass}
                    value={person.cost_rate}
                    onChange={(e) =>
                      onChange({
                        ...person,
                        cost_rate: Number(e.target.value) || 0,
                      })
                    }
                  />
                </Field>
                <Field label="Bill rate">
                  <input
                    type="number"
                    className={inputClass}
                    value={person.bill_rate}
                    onChange={(e) =>
                      onChange({
                        ...person,
                        bill_rate: Number(e.target.value) || 0,
                      })
                    }
                  />
                </Field>
              </div>
            </>
          ) : null}

          {activeTab === "pods" && showPodsTab ? (
            <>
              <Field label="Pods">
                <div className="mt-1 max-h-52 overflow-y-auto rounded-md border border-[var(--border)] p-2">
                  {podsSorted.map((pod) => {
                    const isPodManager = pod.manager_person_id === person.id;
                    const checked =
                      isPodManager || selectedPodIds.includes(pod.id);
                    return (
                      <label
                        key={pod.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[var(--row-hover)]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isPodManager}
                          onChange={(e) => {
                            const on = e.target.checked;
                            onSelectedPodIdsChange(
                              on
                                ? [...new Set([...selectedPodIds, pod.id])]
                                : selectedPodIds.filter((id) => id !== pod.id),
                            );
                          }}
                        />
                        <span className="min-w-0 truncate">{pod.name}</span>
                        {isPodManager ? (
                          <span className="text-[10px] uppercase text-[var(--text-muted)]">
                            Manager
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </Field>
              {managedPods.length > 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Manages {managedPods.map((p) => p.name).join(", ")} — kept as
                  a member of{" "}
                  {managedPods.length === 1 ? "that pod" : "those pods"}{" "}
                  automatically.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex justify-between border-t border-[var(--border)] pt-3">
        {onDelete ? (
          <button
            type="button"
            className="cursor-pointer text-sm text-[var(--status-over)]"
            onClick={onDelete}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className="h-9 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-9 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)] disabled:opacity-40"
            disabled={saveBusy}
            onClick={onSave}
          >
            {saveBusy ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
