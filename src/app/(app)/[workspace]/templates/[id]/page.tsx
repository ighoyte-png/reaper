"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { DisabledHubSection } from "@/components/templates/disabled-hub-section";
import { TemplateMilestoneList } from "@/components/templates/template-milestone-list";
import { TemplateTaskBoard } from "@/components/templates/template-task-board";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, inputClass } from "@/components/ui/form";
import { ProgressBar } from "@/components/projects/progress-bar";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { useViewAs } from "@/lib/view-as";
import { cn } from "@/lib/cn";

export default function TemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const appHref = useAppHref();
  const { push } = useToast();
  const {
    state,
    isPublicShare,
    upsertProjectTemplate,
    deleteProjectTemplate,
  } = useData();
  const { effectiveCanManage } = useViewAs();
  const canManage = effectiveCanManage;

  const [progressEditMode, setProgressEditMode] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const template = state.project_templates.find((t) => t.id === params.id);

  useEffect(() => {
    if (!canManage && !isPublicShare) router.replace(appHref("/dashboard"));
  }, [canManage, isPublicShare, router]);

  if (!canManage && !isPublicShare) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting…
      </div>
    );
  }

  if (!template) {
    return (
      <PageContainer className="overflow-y-auto">
        <PageHeader
          title="Template"
          onBack={() => router.push(appHref("/templates"))}
        />
        <div className="py-3 text-sm text-[var(--text-muted)] sm:py-5">
          Template not found.{" "}
          <Link href={appHref("/templates")} className="text-[var(--accent)]">
            Back to templates
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader
        title={template.name || "Untitled Template"}
        onBack={() => router.push(appHref("/templates"))}
        actions={
          <Button
            variant="destructiveOutline"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        }
      />

      <div className="py-3 sm:py-5">
        <div className="mb-4 space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">
            Template Name
            <input
              className={cn(inputClass, "mt-1 font-medium")}
              value={template.name}
              onChange={(e) =>
                upsertProjectTemplate({ ...template, name: e.target.value })
              }
            />
          </label>
          <label className="block text-xs text-[var(--text-muted)]">
            Description
            <input
              className={inputClass}
              value={template.description}
              onChange={(e) =>
                upsertProjectTemplate({
                  ...template,
                  description: e.target.value,
                })
              }
              placeholder="Optional"
            />
          </label>
          <p className="text-xs text-[var(--text-muted)]">
            Milestones and tasks only — team, budget, essentials, and portal
            settings are not part of templates.
          </p>
        </div>

        <DisabledHubSection title="Team" className="mb-4">
          <p className="text-sm text-[var(--text-muted)]">
            Team members are assigned on the project after apply.
          </p>
        </DisabledHubSection>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-4">
              <TemplateTaskBoard templateId={template.id} />
            </section>

            <DisabledHubSection title="Templates">
              <div className="text-sm text-[var(--text-muted)]">
                Apply and save actions live on the project hub.
              </div>
            </DisabledHubSection>
          </div>

          <div className="space-y-4">
            <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Progress</h2>
                <button
                  type="button"
                  className={cn(
                    "inline-flex cursor-pointer rounded p-1.5 hover:bg-[var(--row-hover)] hover:text-[var(--accent)]",
                    progressEditMode
                      ? "bg-[var(--row-hover)] text-[var(--accent)]"
                      : "text-[var(--text-muted)]",
                  )}
                  onClick={() => setProgressEditMode((v) => !v)}
                  aria-pressed={progressEditMode}
                  aria-label={
                    progressEditMode
                      ? "Done editing milestones"
                      : "Edit milestones"
                  }
                  title={
                    progressEditMode
                      ? "Done Editing Milestones"
                      : "Edit Milestones"
                  }
                >
                  <Pencil size={16} strokeWidth={1.75} />
                </button>
              </div>
              <ProgressBar
                pct={0}
                label="Overall Progress · undated on apply"
                size="lg"
              />
              <TemplateMilestoneList
                templateId={template.id}
                editMode={progressEditMode}
              />
            </section>

            <DisabledHubSection title="Essentials">
              <p className="text-sm text-[var(--text-muted)]">
                Notes, assets, and links stay on the project.
              </p>
            </DisabledHubSection>

            <DisabledHubSection title="Budget">
              <div className="h-16 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/40" />
            </DisabledHubSection>

            <DisabledHubSection title="Client Portal">
              <p className="text-sm text-[var(--text-muted)]">
                Sharing is configured per project.
              </p>
            </DisabledHubSection>
          </div>
        </div>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete Template?"
          message={`Delete “${template.name || "this template"}” and all of its milestones and tasks? This can’t be undone.`}
          confirmLabel="Delete Template"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            deleteProjectTemplate(template.id);
            setConfirmDelete(false);
            push("Template deleted");
            router.push(appHref("/templates"));
          }}
        />
      ) : null}
    </PageContainer>
  );
}
