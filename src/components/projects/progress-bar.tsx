"use client";

import { Check } from "lucide-react";
import { AssetKindIcon } from "@/components/projects/asset-kind-icon";
import { assetTooltip, assetViewForApprovalTooltip } from "@/lib/domain/assets";
import { MILESTONE_PURPLE } from "@/lib/domain/gantt";
import { sanitizeExternalUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";
import type { ProjectAssetKind } from "@/lib/types";

/** Green chip for milestone client approval. */
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

/** Purple chip when portal approval is enabled but not yet approved. */
export function MilestoneReadyTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        className,
      )}
      style={{
        color: MILESTONE_PURPLE,
        backgroundColor: `color-mix(in srgb, ${MILESTONE_PURPLE} 18%, transparent)`,
      }}
    >
      Ready for Approval
    </span>
  );
}

/** Subtle purple glow for portal approval / essentials hover affordances. */
export const milestonePortalGlowClass =
  "rounded-md transition-[background-color,box-shadow] duration-150 " +
  "hover:bg-[color-mix(in_srgb,#673AB7_12%,transparent)] " +
  "hover:shadow-[0_0_0_1px_color-mix(in_srgb,#673AB7_40%,transparent),0_0_14px_color-mix(in_srgb,#673AB7_28%,transparent)] " +
  "focus-visible:outline-none focus-visible:bg-[color-mix(in_srgb,#673AB7_12%,transparent)] " +
  "focus-visible:shadow-[0_0_0_1px_color-mix(in_srgb,#673AB7_40%,transparent),0_0_14px_color-mix(in_srgb,#673AB7_28%,transparent)]";

export function MilestoneEssentialSlot({
  kind,
  label,
  url,
  glowHover = false,
  approvalTooltip = false,
}: {
  kind: ProjectAssetKind | null;
  label?: string;
  url?: string;
  /** When true, use the portal purple glow on hover (separate from milestone row). */
  glowHover?: boolean;
  /** Portal copy: "View [label/type] for Approval". */
  approvalTooltip?: boolean;
}) {
  const frameClass =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center self-center";
  const href = url ? sanitizeExternalUrl(url) : null;
  if (kind && href) {
    const tip = approvalTooltip
      ? assetViewForApprovalTooltip(label, kind)
      : assetTooltip(label, kind);
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={tip}
        className={cn(
          frameClass,
          glowHover && milestonePortalGlowClass,
        )}
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
      className={frameClass}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded border border-dashed border-[var(--text-muted)]/50 bg-[var(--bg-elevated)]" />
    </span>
  );
}

export function MilestoneApprovalCheck({
  size = "md",
  celebrate = false,
  interactive = false,
  pending = false,
  glowHover = false,
  onClick,
  className,
}: {
  size?: "sm" | "md" | "lg";
  celebrate?: boolean;
  /** Gray until hover (client approve affordance). */
  pending?: boolean;
  interactive?: boolean;
  /** Portal purple glow on hover (approve modal). */
  glowHover?: boolean;
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
          "group/check flex shrink-0 cursor-pointer items-stretch justify-center self-stretch px-1",
          glowHover && pending && milestonePortalGlowClass,
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
  essentialGlowHover = false,
  essentialApprovalTooltip = false,
}: {
  pct: number;
  label?: string;
  approved?: boolean;
  readyForApproval?: boolean;
  size?: "sm" | "md" | "lg";
  footerStart?: string | null;
  footerEnd?: string | null;
  celebrate?: boolean;
  essential?: {
    kind: ProjectAssetKind | null;
    label?: string;
    url?: string;
  } | null;
  essentialGlowHover?: boolean;
  essentialApprovalTooltip?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const isComplete = clamped >= 100;
  const showFooter = Boolean(footerStart || footerEnd);
  const showEssential = essential !== undefined && essential !== null;
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-2 overflow-hidden sm:flex-row sm:items-stretch">
      {showEssential ? (
        <div className="shrink-0 self-start sm:self-stretch">
          <MilestoneEssentialSlot
            kind={essential.kind}
            label={essential.label}
            url={essential.url}
            glowHover={essentialGlowHover}
            approvalTooltip={essentialApprovalTooltip}
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
        {label ? (
          <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
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
            size === "lg" ? "h-4" : size === "sm" ? "h-3.5" : "h-2.5",
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              approved
                ? "bg-[var(--status-healthy)]"
                : isComplete
                  ? undefined
                  : "bg-[var(--accent)]",
            )}
            style={{
              width: `${clamped}%`,
              ...(!approved && isComplete
                ? { backgroundColor: MILESTONE_PURPLE }
                : undefined),
            }}
          />
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
