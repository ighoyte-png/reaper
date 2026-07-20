"use client";

import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";

/** Public share stub — templates are an internal planning tool. */
export default function ShareTemplatesPage() {
  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title="Templates" />
      <div className="p-5">
        <p className="max-w-md text-sm text-[var(--text-muted)]">
          Project templates are used internally to set up work. They aren&apos;t
          part of this public share view.
        </p>
      </div>
    </PageContainer>
  );
}
