"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  showPodFilterUi,
  sortPods,
  type PodFilter,
} from "@/lib/domain/pods";
import type { Pod } from "@/lib/types";

export type { PodFilter };

export function usePodFilter(
  pods: Pod[],
  controlled?: {
    value: PodFilter;
    onChange: (next: PodFilter) => void;
  },
): {
  showPods: boolean;
  podTabs: Pod[];
  podFilter: PodFilter;
  setPodFilter: (next: PodFilter) => void;
} {
  const [internal, setInternal] = useState<PodFilter>("all");
  const podFilter = controlled?.value ?? internal;
  const setPodFilter = controlled?.onChange ?? setInternal;
  const podTabs = useMemo(() => sortPods(pods), [pods]);
  const showPods = showPodFilterUi(podTabs);

  useEffect(() => {
    if (podFilter === "all") return;
    if (!podTabs.some((pod) => pod.id === podFilter)) {
      setPodFilter("all");
    }
  }, [podFilter, podTabs, setPodFilter]);

  return { showPods, podTabs, podFilter, setPodFilter };
}

/** Filter bar shown when at least one pod exists. Names only (no avatars). */
export function PodFilterBar({
  pods,
  podFilter,
  onSelect,
  className,
  allLabel = "All People",
}: {
  pods: Pod[];
  podFilter: PodFilter;
  onSelect: (next: PodFilter) => void;
  className?: string;
  allLabel?: string;
}) {
  const podTabs = useMemo(() => sortPods(pods), [pods]);
  if (!showPodFilterUi(podTabs)) return null;

  return (
    <section
      className={cn(
        "rounded-md border border-[var(--border)] bg-[var(--bg)] p-4",
        className,
      )}
      aria-label="Pods"
    >
      <h2 className="mb-3 text-sm font-semibold">Pods</h2>
      <ul className="flex flex-wrap gap-x-3 gap-y-2">
        <li>
          <PodChip
            label={allLabel}
            selected={podFilter === "all"}
            onSelect={() => onSelect("all")}
            showClear={false}
          />
        </li>
        {podTabs.map((pod) => {
          const selected = podFilter === pod.id;
          return (
            <li key={pod.id}>
              <PodChip
                label={pod.name}
                selected={selected}
                onSelect={() => onSelect(pod.id)}
                onClear={() => onSelect("all")}
                showClear={selected}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PodChip({
  label,
  selected,
  onSelect,
  onClear,
  showClear,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  onClear?: () => void;
  showClear: boolean;
}) {
  return (
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
        onClick={onSelect}
        className="min-w-0 cursor-pointer px-1 text-left text-sm font-medium"
      >
        {label}
      </button>
      {showClear && onClear ? (
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
          aria-label={`Clear ${label} filter`}
          onClick={onClear}
        >
          <X size={14} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
