"use client";

import { PersonAvatar } from "@/components/people/person-avatar";
import { formatHours } from "@/lib/domain/budget";
import { personAvatarColor } from "@/lib/domain/people";

export type TeamHoursRow = {
  id: string;
  personId: string;
  name: string;
  avatar_url: string | null;
  avatar_attachment_id?: string | null;
  avatar_color?: string | null;
  usedHours: number;
  plannedHours: number;
  totalHours: number;
  /** When true, Used/Planned show em dash (commitment-only rows). */
  dashUsedPlanned?: boolean;
};

function TeamHoursRowView({ row }: { row: TeamHoursRow }) {
  const dashPartial = Boolean(row.dashUsedPlanned);
  return (
    <tr className="border-b border-[var(--border)]/60">
      <td className="py-2 pr-2">
        <div className="flex items-center gap-2">
          <PersonAvatar
            avatarUrl={row.avatar_url}
            avatarAttachmentId={row.avatar_attachment_id}
            name={row.name}
            size="xs"
            fallback="initials"
            personId={row.personId}
            color={personAvatarColor({
              id: row.personId,
              avatar_color: row.avatar_color ?? null,
            })}
          />
          <span className="min-w-0 truncate">{row.name}</span>
        </div>
      </td>
      <td className="py-2 text-right tabular-nums">
        {dashPartial ? "—" : formatHours(row.usedHours)}
      </td>
      <td className="py-2 text-right tabular-nums">
        {dashPartial ? "—" : formatHours(row.plannedHours)}
      </td>
      <td className="py-2 text-right tabular-nums">
        {formatHours(row.totalHours)}
      </td>
    </tr>
  );
}

/** Hours-only team table (no money, no contractor badges). */
export function TeamHoursTable({
  rows,
  emptyLabel = "No one assigned yet.",
}: {
  rows: TeamHoursRow[];
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[16rem] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
            <th className="pb-2 font-medium">Person</th>
            <th className="pb-2 text-right font-medium text-[var(--accent)]">Used</th>
            <th className="pb-2 text-right font-medium text-[var(--status-near)]">Planned</th>
            <th className="pb-2 text-right font-medium text-[var(--status-healthy)]">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <TeamHoursRowView key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
