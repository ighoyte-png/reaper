"use client";

import { ProjectPortalChromeProvider } from "@/components/share/project-portal-chrome";

export default function ProjectShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProjectPortalChromeProvider>{children}</ProjectPortalChromeProvider>
  );
}
