"use client";

import { Check } from "lucide-react";
import { AssetKindIcon } from "@/components/projects/asset-kind-icon";
import { assetTooltip } from "@/lib/domain/assets";
import { sanitizeExternalUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";
import type { ProjectAssetKind } from "@/lib/types";

/** Same format as ProjectManagerTag — green for milestone client approval. */
export function MilestoneApprovedTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-[var(--status-healthy)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--status-healthy)]",
        className,
      )}
    >
      Approved
    </span>
  );
}

/** Same chip style as Approved — indicates portal approval is enabled. */
export function MilestoneReadyTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-[var(--status-healthy)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--status-healthy)]",
        className,
      )}
    >
      Ready for Approval
    </span>
  );
}

export function MilestoneEssentialSlot({
  kind,
  label,
  url,
}: {
  kind: ProjectAssetKind | null;
  label?: string;
  url?: string;
}) {
  const href = url ? sanitizeExternalUrl(url) : null;
  if (kind && href) {
    const tip = assetTooltip(label, kind);
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={tip}
        className="inline-flex shrink-0 self-center"
        onClick={(e) => e.stopPropagation()}
      >
        <AssetKindIcon kind={kind} label={label} title={null} />
      </a>
    );
  }
  return (
    <span
      aria-hidden
      title="Essentials Asset Not Set"
      className="inline-flex h-6 w-6 shrink-0 self-center items-center justify-center rounded border border-dashed border-[var(--text-muted)]/50 bg-[var(--bg-elevated)]"
    />
  );
}

export function MilestoneApprovalCheck({
  size = "md",
  celebrate = false,
  interactive = false,
  pending = false,
  onClick,
  className,
}: {
  size?: "md" | "lg";
  celebrate?: boolean;
  /** Gray until hover (client approve affordance). */
  pending?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const icon = (
    <Check
      size={size === "lg" ? 36 : 32}
      strokeWidth={3.5}
      className={cn(
        "h-[calc(100%-2px)] w-auto min-h-[28px]",
        pending
          ? "text-[var(--text-muted)] group-hover/check:text-[var(--status-healthy)]"
          : "text-[var(--status-healthy)]",
        celebrate && "animate-[milestone-celebrate_0.9s_ease-out]",
      )}
      aria-hidden
    />
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group/check flex shrink-0 cursor-pointer items-stretch justify-center self-stretch px-0.5",
          className,
        )}
        aria-label="Approve milestone"
      >
        {icon}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-stretch justify-center self-stretch px-0.5",
        className,
      )}
      aria-hidden
    >
      {icon}
    </div>
  );
}

export function ProgressBar({
  pct,
  label,
  approved,
  readyForApproval,
  size = "md",
  footerStart,
  footerEnd,
  celebrate,
  essential,
}: {
  pct: number;
  label?: string;
  approved?: boolean;
  readyForApproval?: boolean;
  size?: "md" | "lg";
  footerStart?: string | null;
  footerEnd?: string | null;
  celebrate?: boolean;
  essential?: {
    kind: ProjectAssetKind | null;
    label?: string;
    url?: string;
  } | null;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const isComplete = clamped >= 100;
  const showFooter = Boolean(footerStart || footerEnd);
  const showEssential = essential !== undefined && essential !== null;
  return (
    <div className="flex items-stretch gap-2">
      {showEssential ? (
        <MilestoneEssentialSlot
          kind={essential.kind}
          label={essential.label}
          url={essential.url}
        />
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        {label ? (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              {approved ? (
                <MilestoneApprovedTag />
              ) : readyForApproval ? (
                <MilestoneReadyTag />
              ) : null}
              <span className="min-w-0 truncate font-medium">{label}</span>
            </span>
            <span className="shrink-0 text-[var(--text-muted)]">{clamped}%</span>
          </div>
        ) : null}
        <div
          className={cn(
            "relative overflow-hidden rounded-full bg-[var(--bg-elevated)]",
            size === "lg" ? "h-4" : "h-2.5",
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              isComplete
                ? "bg-[var(--status-healthy)]"
                : "bg-[var(--accent)]",
            )}
            style={{ width: `${clamped}%` }}
          />
          {approved ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(-45deg, transparent, transparent 3px, var(--progress-approved-hatch) 3px, var(--progress-approved-hatch) 5px)",
              }}
            />
          ) : null}
        </div>
        {showFooter ? (
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
            <span className="truncate">{footerStart ?? ""}</span>
            <span className="shrink-0 truncate text-right">
              {footerEnd ?? ""}
            </span>
          </div>
        ) : null}
      </div>
      {approved ? (
        <MilestoneApprovalCheck size={size} celebrate={celebrate} />
      ) : null}
    </div>
  );
}
