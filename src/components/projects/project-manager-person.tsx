"use client";

import type { ReactNode } from "react";
import { PersonAvatar } from "@/components/people/person-avatar";
import { cn } from "@/lib/cn";
import { personAvatarColor } from "@/lib/domain/people";
import type { Person } from "@/lib/types";

export function ProjectManagerTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]",
        className,
      )}
    >
      Project Manager
    </span>
  );
}

export function ContractorTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]",
        className,
      )}
    >
      Contractor
    </span>
  );
}

export function SandboxTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]",
        className,
      )}
    >
      Sandbox
    </span>
  );
}

/** Same chrome as Project Manager tag; used for pod managers / section labels. */
export function ManagerTag({
  className,
  children = "Manager",
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Compact avatar + name + role_title row used for Project Manager callouts. */
export function ProjectManagerPerson({
  person,
  size = "team",
  showTag = false,
  className,
  nameClassName,
}: {
  person: Pick<
    Person,
    | "id"
    | "name"
    | "role_title"
    | "avatar_url"
    | "avatar_attachment_id"
    | "avatar_color"
  >;
  size?: "team" | "row" | "sm" | "lg";
  /** Show the shared “Project Manager” pill under the name/title column. */
  showTag?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-start gap-2", className)}>
      <PersonAvatar
        avatarUrl={person.avatar_url}
        avatarAttachmentId={person.avatar_attachment_id}
        name={person.name}
        size={size}
        fallback="initials"
        personId={person.id}
        color={personAvatarColor(person)}
      />
      <div className="flex min-w-0 flex-col gap-2 text-left">
        <div className="min-w-0">
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
        {showTag ? <ProjectManagerTag className="self-start" /> : null}
      </div>
    </div>
  );
}
