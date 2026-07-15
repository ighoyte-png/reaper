"use client";

import { PublicShareProvider } from "@/lib/data/public-share-provider";
import { ShareShell } from "@/components/nav/share-shell";
import { use } from "react";

export default function ShareLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return (
    <PublicShareProvider token={token}>
      <ShareShell>{children}</ShareShell>
    </PublicShareProvider>
  );
}
