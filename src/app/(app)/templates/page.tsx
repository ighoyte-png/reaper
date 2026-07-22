"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { EmptyState } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { useViewAs } from "@/lib/view-as";
import type { ProjectTemplate } from "@/lib/types";

export default function TemplatesPage() {
  const {
    state,
    isPublicShare,
    newId,
    upsertProjectTemplate,
  } = useData();
  const { effectiveCanManage } = useViewAs();
  const canManage = effectiveCanManage;
  const { push } = useToast();
  const router = useRouter();
  const appHref = useAppHref();

  useEffect(() => {
    if (!canManage && !isPublicShare) router.replace("/dashboard");
  }, [canManage, isPublicShare, router]);

  if (!canManage && !isPublicShare) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting…
      </div>
    );
  }

  const templates = [...state.project_templates].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  function addTemplate() {
    const template: ProjectTemplate = {
      id: newId("template"),
      organization_id: state.organization.id,
      name: "New Template",
      description: "",
    };
    upsertProjectTemplate(template);
    push("Template created");
    router.push(appHref(`/templates/${template.id}`));
  }

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader
        title="Project Templates"
        onBack={() => router.push(appHref("/projects"))}
        actions={
          <Button variant="primary" onClick={addTemplate}>
            Add Template
          </Button>
        }
      />
      <p className="border-b border-[var(--border)] px-3 pb-3 text-sm text-[var(--text-muted)] sm:px-5">
        Reusable milestone and task structures. Edit a template like a project
        hub — only milestones and tasks are saved. Apply from a project or when
        creating one; applied work starts undated and unassigned.
      </p>
      {templates.length === 0 ? (
        <div className="p-3 sm:p-5">
          <EmptyState
            title="No Project Templates Yet"
            cta="Create Your First Template"
            onClick={addTemplate}
          />
        </div>
      ) : (
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          {templates.map((t) => {
            const milestoneCount = state.template_milestones.filter(
              (m) => m.template_id === t.id,
            ).length;
            const taskCount = state.template_tasks.filter(
              (task) => task.template_id === t.id,
            ).length;
            return (
              <Link
                key={t.id}
                href={appHref(`/templates/${t.id}`)}
                className="block transition-colors hover:bg-[var(--row-hover)]"
              >
                <Panel className="h-full transition-colors hover:bg-[var(--row-hover)]">
                  <h2 className="truncate text-sm font-semibold">{t.name}</h2>
                  {t.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">
                      {t.description}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      No description
                    </p>
                  )}
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    {milestoneCount} milestone{milestoneCount === 1 ? "" : "s"} ·{" "}
                    {taskCount} task{taskCount === 1 ? "" : "s"}
                  </p>
                </Panel>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
