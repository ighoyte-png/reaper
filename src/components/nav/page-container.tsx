import { cn } from "@/lib/cn";

/** Constrains non-schedule app pages to a centered 1400px column. */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col",
        className,
      )}
    >
      {children}
    </div>
  );
}
