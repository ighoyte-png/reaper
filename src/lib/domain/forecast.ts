import type { Assignment, Person, Project } from "@/lib/types";
import { assignmentHours } from "@/lib/domain/budget";

export interface ProjectForecast {
  projectId: string;
  plannedHours: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
}

export function projectForecast(
  project: Project,
  assignments: Assignment[],
  people: Person[],
): ProjectForecast {
  const byId = new Map(people.map((p) => [p.id, p]));
  let plannedHours = 0;
  let revenue = 0;
  let cost = 0;

  for (const a of assignments) {
    if (a.project_id !== project.id || a.status !== "confirmed") continue;
    const hours = assignmentHours(a);
    const person = byId.get(a.person_id);
    plannedHours += hours;
    revenue += hours * (person?.bill_rate ?? 0);
    cost += hours * (person?.cost_rate ?? 0);
  }

  const margin = revenue - cost;
  return {
    projectId: project.id,
    plannedHours,
    revenue,
    cost,
    margin,
    marginPct: revenue <= 0 ? 0 : (margin / revenue) * 100,
  };
}

export function orgForecast(
  projects: Project[],
  assignments: Assignment[],
  people: Person[],
): ProjectForecast {
  const parts = projects.map((p) => projectForecast(p, assignments, people));
  const revenue = parts.reduce((s, p) => s + p.revenue, 0);
  const cost = parts.reduce((s, p) => s + p.cost, 0);
  const margin = revenue - cost;
  return {
    projectId: "org",
    plannedHours: parts.reduce((s, p) => s + p.plannedHours, 0),
    revenue,
    cost,
    margin,
    marginPct: revenue <= 0 ? 0 : (margin / revenue) * 100,
  };
}
