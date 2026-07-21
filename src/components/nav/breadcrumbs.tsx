"use client";

import Link from "next/link";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

export function ReportBreadcrumb({ current }: { current: string }) {
  const appHref = useAppHref();
  useDocumentTitle(current);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <Link
        href={appHref("/reports")}
        className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
      >
        Reports
      </Link>
      <span className="shrink-0 text-[var(--text-muted)]" aria-hidden>
        /
      </span>
      <span className="truncate font-semibold tracking-tight text-[var(--text)]">
        {current}
      </span>
    </nav>
  );
}
