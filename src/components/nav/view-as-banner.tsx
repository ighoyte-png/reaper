"use client";

import { Select } from "@/components/ui/select";
import { useData } from "@/lib/data/store";
import { sortPeopleByName } from "@/lib/domain/sorting";
import { useViewAs } from "@/lib/view-as";

export function ViewAsBanner() {
  const { canManage, isPublicShare, state } = useData();
  const { viewAsPersonId, setViewAsPersonId, clearViewAs } = useViewAs();

  if ((!canManage && !isPublicShare) || !viewAsPersonId) return null;

  const people = sortPeopleByName(state.people);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-1.5 text-sm">
      <span className="font-medium text-[var(--accent)]">Viewing as</span>
      <Select
        searchable
        className="mt-0 h-7 max-w-[200px] py-0 text-xs"
        value={viewAsPersonId}
        onChange={(v) => setViewAsPersonId(v || null)}
        aria-label="View as user"
        options={people.map((p) => ({ value: p.id, label: p.name }))}
      />
      <button
        type="button"
        className="ml-auto cursor-pointer text-xs font-medium text-[var(--accent)] hover:underline"
        onClick={clearViewAs}
      >
        Exit
      </button>
    </div>
  );
}
