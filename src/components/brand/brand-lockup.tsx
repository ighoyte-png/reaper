import { cn } from "@/lib/cn";
import { ReaperLogo } from "@/components/brand/reaper-logo";
import { APP_VERSION } from "@/lib/version";

export function BrandLockup({
  className,
  logoClassName,
  wordmarkClassName,
  showVersion = false,
}: {
  className?: string;
  logoClassName?: string;
  wordmarkClassName?: string;
  showVersion?: boolean;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <ReaperLogo
        className={cn("h-9 shrink-0", logoClassName)}
        title="Reaper"
      />
      <div className="flex min-w-0 flex-col leading-none">
        <span
          className={cn(
            "text-lg font-semibold tracking-tight text-[var(--text)]",
            wordmarkClassName,
          )}
        >
          Reaper
        </span>
        {showVersion ? (
          <span className="mt-1 text-[10px] font-medium tracking-wide text-[var(--text-muted)] opacity-50">
            v{APP_VERSION}
          </span>
        ) : null}
      </div>
    </div>
  );
}
