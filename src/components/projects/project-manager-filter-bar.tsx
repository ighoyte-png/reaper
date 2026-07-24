"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { ProjectManagerPerson } from "@/components/projects/project-manager-person";
import { cn } from "@/lib/cn";
import { showProjectManagerUi } from "@/lib/domain/project-access";
import type { Person, Project } from "@/lib/types";

export type ManagerFilter = "all" | string;

/** Distinct assigned PMs for a project set — empty unless ≥2 (same rule as Projects). */
export function projectManagerFilterTabs(
  projects: Project[],
  people: Person[],
): Person[] {
  if (!showProjectManagerUi(projects)) return [];
  const ids = new Set<string>();
  for (const p of projects) {
    if (p.manager_person_id) ids.add(p.manager_person_id);
  }
  return people
    .filter((person) => ids.has(person.id))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

export function useProjectManagerFilter(
  projects: Project[],
  people: Person[],
  controlled?: {
    value: ManagerFilter;
    onChange: (next: ManagerFilter) => void;
  },
): {
  showManagers: boolean;
  managerTabs: Person[];
  managerFilter: ManagerFilter;
  setManagerFilter: (next: ManagerFilter) => void;
} {
  const [internal, setInternal] = useState<ManagerFilter>("all");
  const managerFilter = controlled?.value ?? internal;
  const setManagerFilter = controlled?.onChange ?? setInternal;
  const managerTabs = useMemo(
    () => projectManagerFilterTabs(projects, people),
    [projects, people],
  );
  const showManagers = managerTabs.length >= 2;

  useEffect(() => {
    if (managerFilter === "all") return;
    if (!managerTabs.some((person) => person.id === managerFilter)) {
      setManagerFilter("all");
    }
  }, [managerFilter, managerTabs, setManagerFilter]);

  return { showManagers, managerTabs, managerFilter, setManagerFilter };
}

/** Filter bar shown only when two or more distinct project managers are assigned. */
export function ProjectManagerFilterBar({
  managerTabs,
  managerFilter,
  onSelect,
  className,
}: {
  managerTabs: Person[];
  managerFilter: ManagerFilter;
  onSelect: (next: ManagerFilter) => void;
  className?: string;
}) {
  if (managerTabs.length < 2) return null;

  return (
    <section
      className={cn(
        "rounded-md border border-[var(--border)] bg-[var(--bg)] p-4",
        className,
      )}
      aria-label="Project managers"
    >
      <h2 className="mb-3 text-sm font-semibold">Project Manager</h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {managerTabs.map((person) => {
          const selected = managerFilter === person.id;
          return (
            <li key={person.id}>
              <div
                className={cn(
                  "flex items-center gap-1 rounded-md border px-1.5 py-1 transition-colors",
                  selected
                    ? "border-[var(--text)] bg-[var(--bg-elevated)]"
                    : "border-transparent hover:bg-[var(--row-hover)]",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onSelect(person.id)}
                  className="min-w-0 cursor-pointer text-left"
                >
                  <ProjectManagerPerson person={person} />
                </button>
                {selected ? (
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                    aria-label={`Clear ${person.name} filter`}
                    onClick={() => onSelect("all")}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
