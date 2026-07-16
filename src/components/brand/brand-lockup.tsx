import { cn } from "@/lib/cn";
import { ReaperLogo } from "@/components/brand/reaper-logo";
import { APP_VERSION } from "@/lib/version";

export function BrandLockup({
  className,
  logoClassName,
  wordmarkClassName,
  showVersion = false,
  compact = false,
}: {
  className?: string;
  logoClassName?: string;
  wordmarkClassName?: string;
  showVersion?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center",
        compact ? "gap-1.5" : "gap-2.5",
        className,
      )}
    >
      <ReaperLogo
        className={cn(
          "shrink-0",
          compact ? "h-6" : "h-9",
          logoClassName,
        )}
        title="Reaper"
      />
      <div className="flex min-w-0 flex-col leading-none">
        <span
          className={cn(
            compact
              ? "text-sm font-semibold tracking-tight text-[var(--text)]"
              : "text-lg font-semibold tracking-tight text-[var(--text)]",
            wordmarkClassName,
          )}
        >
          Reaper
        </span>
        {showVersion ? (
          <span
            className={cn(
              "font-medium tracking-wide text-[var(--text-muted)] opacity-50",
              compact
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
