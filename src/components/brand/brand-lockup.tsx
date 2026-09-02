import { cn } from "@/lib/cn";
import { ReaperLogo } from "@/components/brand/reaper-logo";
import { APP_VERSION } from "@/lib/version";

export function BrandLockup({
  className,
  logoClassName,
  wordmarkClassName,
  showVersion = false,
  showWordmark = true,
  compact = false,
  stacked = false,
  logoSrc = null,
  wordmark = "Reaper",
}: {
  className?: string;
  logoClassName?: string;
  wordmarkClassName?: string;
  showVersion?: boolean;
  /** When false, only the mark is shown (no “Reaper” / version). */
  showWordmark?: boolean;
  compact?: boolean;
  stacked?: boolean;
  /** Custom logo URL; falls back to the Reaper mark. */
  logoSrc?: string | null;
  /** Custom wordmark; falls back to “Reaper”. */
  wordmark?: string | null;
}) {
  const name = (wordmark ?? "").trim() || "Reaper";
  const customLogo = Boolean(logoSrc?.trim());

  return (
    <div
      className={cn(
        "inline-flex",
        stacked
          ? "flex-col items-center gap-3"
          : cn("items-center", compact ? "gap-1.5" : "gap-2.5"),
        className,
      )}
    >
      {customLogo ? (
        <span
          className={cn(
            "flex shrink-0 items-center",
            compact && !stacked ? "h-8" : stacked ? "h-16" : "h-9",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc!}
            alt={name}
            className={cn(
              "max-w-[9rem] object-contain",
              compact && !stacked ? "h-6" : stacked ? "h-16" : "h-9",
              logoClassName,
            )}
          />
        </span>
      ) : compact && !stacked ? (
        <span className="flex h-8 shrink-0 items-center">
          <ReaperLogo className={cn("h-6", logoClassName)} title={name} />
        </span>
      ) : (
        <ReaperLogo
          className={cn(stacked ? "h-16" : "h-9", logoClassName)}
          title={name}
        />
      )}
      {showWordmark ? (
        <div className="flex min-w-0 flex-col leading-none">
          <span
            className={cn(
              "font-semibold tracking-tight text-[var(--text)]",
              compact && !stacked
                ? "text-sm"
                : stacked
                  ? "text-3xl"
                  : "text-lg",
              wordmarkClassName,
            )}
          >
            {name}
          </span>
          {showVersion ? (
            <span
              className={cn(
                "font-medium tracking-wide text-[var(--text-muted)] opacity-50",
                compact && !stacked
                  ? "mt-0.5 text-[9px] leading-none"
                  : "mt-1 text-[10px]",
              )}
            >
              v{APP_VERSION}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
