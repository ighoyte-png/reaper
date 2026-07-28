"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data/store";

/** Templates are internal playbooks — not part of the prospect share. */
export default function ShareTemplatesBlockedPage() {
  const router = useRouter();
  const { shareBasePath } = useData();
  useEffect(() => {
    router.replace(`${shareBasePath ?? ""}/dashboard`);
  }, [router, shareBasePath]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--text-muted)]">
      Redirecting…
    </div>
  );
}
