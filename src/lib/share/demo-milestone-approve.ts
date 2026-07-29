import { createDemoSeed, DEMO_STORAGE_KEY } from "@/lib/demo/seed";
import {
  approvalContactsMatch,
  milestoneApprovalBulletinTitle,
} from "@/lib/domain/milestones";
import { projectTeamPersonIds } from "@/lib/domain/project-access";
import type { Bulletin, DemoState, Milestone } from "@/lib/types";

export type DemoMilestoneApproveResult =
  | {
      ok: true;
      match?: boolean;
      milestone: Pick<
        Milestone,
        | "id"
        | "client_approved"
        | "approved_by_client"
        | "approved_by_name"
        | "approved_at"
      >;
    }
  | { ok: false; error: string; status: number; match?: boolean };

function loadMergedDemoState(): DemoState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    const seed = createDemoSeed();
    const parsed = raw ? (JSON.parse(raw) as Partial<DemoState>) : {};
    return {
      ...seed,
      ...parsed,
      task_lists: parsed.task_lists ?? seed.task_lists,
      tasks: parsed.tasks ?? seed.tasks,
      projects: parsed.projects ?? seed.projects,
      people: parsed.people ?? seed.people,
      profiles: parsed.profiles ?? seed.profiles,
      milestones: parsed.milestones ?? seed.milestones,
      project_assets: parsed.project_assets ?? seed.project_assets,
      clients: parsed.clients ?? seed.clients,
      assignments: parsed.assignments ?? seed.assignments,
      project_members: parsed.project_members ?? seed.project_members,
      bulletins: parsed.bulletins ?? seed.bulletins,
      unread_bulletin_ids:
        parsed.unread_bulletin_ids ?? seed.unread_bulletin_ids ?? [],
    };
  } catch {
    return null;
  }
}

function persistDemoState(state: DemoState) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
}

/** Approve a milestone in demo localStorage (client portal). */
export function approveDemoPortalMilestone(
  token: string,
  milestoneId: string,
  name: string,
  email: string,
  opts?: { verifyOnly?: boolean },
): DemoMilestoneApproveResult {
  const state = loadMergedDemoState();
  if (!state) {
    return { ok: false, error: "Demo state unavailable", status: 400 };
  }

  const project = state.projects.find(
    (p) => p.share_enabled && p.share_token === token,
  );
  if (!project) {
    return { ok: false, error: "Not found", status: 404 };
  }

  const milestone = state.milestones.find(
    (m) => m.id === milestoneId && m.project_id === project.id,
  );
  if (!milestone) {
    return { ok: false, error: "Not found", status: 404 };
  }
  if (!milestone.approval_enabled) {
    return {
      ok: false,
      error: "Milestone is not ready for approval",
      status: 400,
    };
  }
  if (milestone.approved_by_client || milestone.client_approved) {
    return { ok: false, error: "Milestone is already approved", status: 400 };
  }
  const matches = approvalContactsMatch(
    milestone.approval_name,
    milestone.approval_email,
    name,
    email,
  );
  if (opts?.verifyOnly) {
    return matches
      ? {
          ok: true,
          match: true,
          milestone: {
            id: milestone.id,
            client_approved: false,
            approved_by_client: false,
            approved_by_name: null,
            approved_at: null,
          },
        }
      : {
          ok: false,
          error: "Name and email do not match",
          status: 403,
          match: false,
        };
  }
  if (!matches) {
    return { ok: false, error: "Name and email do not match", status: 403 };
  }

  const approvedAt = new Date().toISOString();
  const approvedName = name.trim().replace(/\s+/g, " ");
  const updated: Milestone = {
    ...milestone,
    client_approved: true,
    approved_by_client: true,
    approved_by_name: approvedName,
    approved_at: approvedAt,
  };

  const client = project.client_id
    ? state.clients.find((c) => c.id === project.client_id)
    : undefined;
  const title = milestoneApprovalBulletinTitle({
    milestoneName: milestone.name,
    clientName: client?.name ?? null,
    projectName: project.name,
  });

  const teamIds = projectTeamPersonIds(
    project.id,
    state.project_members,
    state.assignments,
    state.tasks,
  );
  if (project.manager_person_id) teamIds.add(project.manager_person_id);

  const bulletinId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `bulletin-${Date.now()}`;
  const bulletin: Bulletin = {
    id: bulletinId,
    organization_id: state.organization.id,
    project_id: project.id,
    title,
    body: "",
    pinned: false,
    audience: "people",
    audience_person_ids: [...teamIds],
    audience_pod_ids: [],
    tone: "success",
    created_by_profile_id: null,
    created_at: approvedAt,
  };

  const next: DemoState = {
    ...state,
    milestones: state.milestones.map((m) =>
      m.id === updated.id ? updated : m,
    ),
    bulletins: [bulletin, ...state.bulletins],
    unread_bulletin_ids: [
      bulletinId,
      ...(state.unread_bulletin_ids ?? []),
    ],
  };
  persistDemoState(next);

  return {
    ok: true,
    milestone: {
      id: updated.id,
      client_approved: true,
      approved_by_client: true,
      approved_by_name: approvedName,
      approved_at: approvedAt,
    },
  };
}
