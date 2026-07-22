"use client";

import { PersonAvatar } from "@/components/people/person-avatar";
import { cn } from "@/lib/cn";
import type { Person } from "@/lib/types";

/** Compact avatar + name + role_title row used for Project Manager callouts. */
export function ProjectManagerPerson({
  person,
  size = "team",
  className,
  nameClassName,
}: {
  person: Pick<Person, "name" | "role_title" | "avatar_url">;
  size?: "team" | "row" | "sm" | "lg";
  className?: string;
  nameClassName?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <PersonAvatar
        avatarUrl={person.avatar_url}
        name={person.name}
        size={size}
        fallback="initials"
      />
      <div className="min-w-0 text-left">
        <div
          className={cn(
            "truncate text-left text-sm font-medium leading-tight",
            nameClassName,
          )}
        >
          {person.name}
        </div>
        {person.role_title ? (
          <div className="truncate text-left text-xs text-[var(--text-muted)]">
            {person.role_title}
          </div>
        ) : null}
      </div>
    </div>
  );
}
