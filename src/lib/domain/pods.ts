import { canManage } from "@/lib/auth/roles";
import { sortPeopleByName } from "@/lib/domain/sorting";
import type {
  Person,
  Pod,
  PodMember,
  Profile,
  Role,
} from "@/lib/types";

export type PodFilter = "all" | string;

/** Show pod filter bars when at least one pod exists. */
export function showPodFilterUi(pods: Pod[]): boolean {
  return pods.length >= 1;
}

export function sortPods(pods: Pod[]): Pod[] {
  return [...pods].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** Person ids in a pod (explicit members + manager if set). */
export function personIdsInPod(
  pod: Pod,
  podMembers: PodMember[],
): Set<string> {
  const ids = new Set<string>();
  if (pod.manager_person_id) ids.add(pod.manager_person_id);
  for (const m of podMembers) {
    if (m.pod_id === pod.id) ids.add(m.person_id);
  }
  return ids;
}

export function peopleInPod(
  pod: Pod,
  people: Person[],
  podMembers: PodMember[],
): Person[] {
  const ids = personIdsInPod(pod, podMembers);
  return sortPeopleByName(people.filter((p) => ids.has(p.id)));
}

/** Pods where this person is the designated manager. */
export function podsManagedBy(personId: string, pods: Pod[]): Pod[] {
  return sortPods(pods.filter((p) => p.manager_person_id === personId));
}

/** Pods this person belongs to (member or manager). */
export function podsForPerson(
  personId: string,
  pods: Pod[],
  podMembers: PodMember[],
): Pod[] {
  const memberPodIds = new Set(
    podMembers.filter((m) => m.person_id === personId).map((m) => m.pod_id),
  );
  return sortPods(
    pods.filter(
      (p) => p.manager_person_id === personId || memberPodIds.has(p.id),
    ),
  );
}

/**
 * Default people scope for dashboards/reports:
 * - members → self only
 * - managers who manage ≥1 pod → union of those pods
 * - other managers/admins → all people
 */
export function defaultPeopleScopeForViewer(
  people: Person[],
  pods: Pod[],
  podMembers: PodMember[],
  opts: {
    role: Role | null | undefined;
    myPersonId: string | null;
    /** When false (View As / member layout), force self/focus person. */
    orgWide: boolean;
    focusPersonId?: string | null;
  },
): Person[] {
  if (!opts.orgWide) {
    const id = opts.focusPersonId ?? opts.myPersonId;
    if (!id) return [];
    const person = people.find((p) => p.id === id);
    return person ? [person] : [];
  }

  if (!canManage(opts.role)) {
    const id = opts.myPersonId;
    if (!id) return [];
    const person = people.find((p) => p.id === id);
    return person ? [person] : [];
  }

  if (!opts.myPersonId) return sortPeopleByName(people);

  const managed = podsManagedBy(opts.myPersonId, pods);
  if (managed.length === 0) return sortPeopleByName(people);

  const ids = new Set<string>();
  for (const pod of managed) {
    for (const id of personIdsInPod(pod, podMembers)) ids.add(id);
  }
  return sortPeopleByName(people.filter((p) => ids.has(p.id)));
}

/** People with linked profile role manager or admin (schedule PM section). */
export function scheduleProjectManagerPeople(
  people: Person[],
  profiles: Profile[],
): Person[] {
  const manageProfileIds = new Set(
    profiles
      .filter((p) => p.role === "manager" || p.role === "admin")
      .map((p) => p.id),
  );
  return sortPeopleByName(
    people.filter(
      (person) =>
        Boolean(person.profile_id) &&
        manageProfileIds.has(person.profile_id!),
    ),
  );
}

export function filterPeopleByPod(
  people: Person[],
  pods: Pod[],
  podMembers: PodMember[],
  podFilter: PodFilter,
): Person[] {
  if (podFilter === "all") return sortPeopleByName(people);
  const pod = pods.find((p) => p.id === podFilter);
  if (!pod) return sortPeopleByName(people);
  return peopleInPod(pod, people, podMembers);
}
