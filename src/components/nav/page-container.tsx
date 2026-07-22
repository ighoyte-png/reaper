import { Children, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/nav/page-header";

function isFullBleedChrome(child: ReactNode): boolean {
  return isValidElement(child) && child.type === PageHeader;
}

/**
 * Full-width scrollport. PageHeader children span the viewport;
 * everything else stays in a centered 1400px column.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  // Overflow is owned by the full-width shell — strip caller overflow utilities
  // so nested overflow-hidden / overflow-y-auto don't trap the scrollbar.
  const withoutOverflow = className
    ?.split(/\s+/)
    .filter((c) => c && !c.startsWith("overflow-"))
    .join(" ");

  const childList = Children.toArray(children);
  const chrome: ReactNode[] = [];
  const body: ReactNode[] = [];
  for (const child of childList) {
    if (isFullBleedChrome(child)) chrome.push(child);
    else body.push(child);
  }

  return (
    <div
      className={cn(
        "min-h-0 w-full flex-1 overflow-y-auto outline-none",
        withoutOverflow,
      )}
      tabIndex={-1}
    >
      {chrome}
      {body.length > 0 ? (
        <div className="mx-auto w-full max-w-[1400px]">{body}</div>
      ) : null}
    </div>
  );
}
