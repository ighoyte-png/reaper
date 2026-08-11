"use client";

import { Suspense, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ReportBreadcrumb } from "@/components/nav/breadcrumbs";
import {
  ProjectManagerFilterBar,
  useProjectManagerFilter,
} from "@/components/projects/project-manager-filter-bar";
import { TimelineProjectCard } from "@/components/reports/timeline-project-card";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { useData } from "@/lib/data/store";
import { projectDateProgress } from "@/lib/domain/progress";
import { nonSandboxProjects } from "@/lib/domain/project-access";
import {
  sortClientsByName,
  sortProjectsByClientThenName,
} from "@/lib/domain/sorting";
import { useProjectHref } from "@/lib/hooks/use-app-href";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import type { Client, Project } from "@/lib/types";

const GRID_COLUMNS = 3;

type ClientGroup = { client: Client | null; projects: Project[] };

type PackedRowSegment = { client: Client | null; projects: Project[] };

type PackedRow = { segments: PackedRowSegment[] };

/** Pack ordered client groups into filled rows; repeat client headers when a group wraps. */
function packProjectRows(
  groups: ClientGroup[],
  columns = GRID_COLUMNS,
): PackedRow[] {
  const rows: PackedRow[] = [];
  let currentRow: PackedRow = { segments: [] };
  let slotsUsed = 0;

  const flushRow = () => {
    if (currentRow.segments.length > 0) {
      rows.push(currentRow);
      currentRow = { segments: [] };
      slotsUsed = 0;
    }
  };

  for (const { client, projects } of groups) {
    let index = 0;
    while (index < projects.length) {
      if (slotsUsed >= columns) flushRow();

      const take = Math.min(columns - slotsUsed, projects.length - index);
      const chunk = projects.slice(index, index + take);
      currentRow.segments.push({ client, projects: chunk });
      slotsUsed += take;
      index += take;
    }
  }

  flushRow();
  return rows;
}

function clientGroupKey(client: Client | null): string {
  return client?.id ?? "none";
}

export default function TimelinesReportPage() {
  return (
    <Suspense fallback={null}>
      <TimelinesReportContent />
    </Suspense>
  );
}

function TimelinesReportContent() {
  const { state, mode, ensureOrgMilestones, dataStatus } = useData();
  const projectHref = useProjectHref();
  const today = format(new Date(), "yyyy-MM-dd");
  const { filters, setFilter } = useUrlFilters({ pm: "all" });

  const eligible = useMemo(() => {
    return sortProjectsByClientThenName(
      nonSandboxProjects(state.projects).filter((p) => {
        if (p.status !== "active") return false;
        return projectDateProgress(p, today) != null;
      }),
      state.clients,
    );
  }, [state.projects, state.clients, today]);

  const { managerTabs, managerFilter, setManagerFilter } =
    useProjectManagerFilter(eligible, state.people, {
      value: filters.pm,
      onChange: (next) => setFilter("pm", next),
    });

  useEffect(() => {
    if (mode !== "supabase") return;
    void ensureOrgMilestones();
  }, [mode, ensureOrgMilestones]);

  const milestonesReady =
    mode !== "supabase" || dataStatus.orgMilestones === "ready";

  const filtered = useMemo(() => {
    if (managerFilter === "all") return eligible;
    return eligible.filter((p) => p.manager_person_id === managerFilter);
  }, [eligible, managerFilter]);

  const clients = sortClientsByName(state.clients);

  const groups = useMemo(() => {
    const byClient = new Map<string | null, Project[]>();
    for (const project of filtered) {
      const key = project.client_id;
      const list = byClient.get(key) ?? [];
      list.push(project);
      byClient.set(key, list);
    }
    const ordered: ClientGroup[] = [];
    for (const client of clients) {
      const list = byClient.get(client.id);
      if (list?.length) ordered.push({ client, projects: list });
    }
    const noClient = byClient.get(null);
    if (noClient?.length) ordered.push({ client: null, projects: noClient });
    return ordered;
  }, [filtered, clients]);

  const packedRows = useMemo(() => packProjectRows(groups), [groups]);

  const milestonesByProject = useMemo(() => {
    const map = new Map<string, typeof state.milestones>();
    for (const m of state.milestones) {
      const list = map.get(m.project_id) ?? [];
      list.push(m);
      map.set(m.project_id, list);
    }
    return map;
  }, [state.milestones]);

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title={<ReportBreadcrumb current="Project Timelines" />} />
      <div className="min-w-0 py-3 sm:py-5">
        <ProjectManagerFilterBar
          className="mb-4"
          title="Project Manager"
          managerTabs={managerTabs}
          managerFilter={managerFilter}
          onSelect={setManagerFilter}
        />

        {!milestonesReady ? (
          <p className="text-sm text-[var(--text-muted)]">
            Loading project timelines…
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            No Projects with Timelines.
          </p>
        ) : (
          <div className="space-y-6">
            {packedRows.map((row, rowIndex) => (
              <section key={rowIndex}>
                <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {row.segments.map((segment, segmentIndex) => (
                    <div
                      key={`${clientGroupKey(segment.client)}-${segmentIndex}`}
                      className="flex min-w-0 items-center gap-2 border-b border-[var(--section-rule)] px-1 pb-2"
                      style={{
                        gridColumn: `span ${Math.min(
                          segment.projects.length,
                          GRID_COLUMNS,
                        )}`,
                      }}
                    >
                      {segment.client ? (
                        <ProjectColorBar color={segment.client.color} />
                      ) : null}
                      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                        {segment.client?.name ?? "No Client"}
                      </h2>
                      <span className="shrink-0 text-xs text-[var(--text-muted)]">
                        {segment.projects.length} project
                        {segment.projects.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {row.segments.flatMap((segment) =>
                    segment.projects.map((project) => (
                      <TimelineProjectCard
                        key={project.id}
                        project={project}
                        milestones={milestonesByProject.get(project.id) ?? []}
                        href={projectHref(project)}
                        today={today}
                      />
                    )),
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
