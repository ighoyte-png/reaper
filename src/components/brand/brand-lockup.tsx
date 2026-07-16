import { cn } from "@/lib/cn";
import { ReaperLogo } from "@/components/brand/reaper-logo";
import { APP_VERSION } from "@/lib/version";

export function BrandLockup({
  className,
  logoClassName,
  wordmarkClassName,
  showVersion = false,
  compact = false,
  stacked = false,
}: {
  className?: string;
  logoClassName?: string;
  wordmarkClassName?: string;
  showVersion?: boolean;
  compact?: boolean;
  stacked?: boolean;
}) {
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
      {compact && !stacked ? (
        <span className="flex h-8 shrink-0 items-center">
          <ReaperLogo className={cn("h-6", logoClassName)} title="Reaper" />
        </span>
      ) : (
        <ReaperLogo
          className={cn(stacked ? "h-16" : "h-9", logoClassName)}
          title="Reaper"
        />
      )}
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
          Reaper
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
    </div>
  );
}
