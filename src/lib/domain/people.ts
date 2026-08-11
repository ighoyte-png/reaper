import { PRESET_COLORS } from "@/lib/domain/colors";
import type { Person } from "@/lib/types";

export {
  scheduleVisiblePeople,
  utilizationVisiblePeople,
  isFullyHiddenFromPlanning,
  isFullTimeStyleContractor,
  isProjectBasisContractor,
  sortPeopleContractorsLast,
} from "@/lib/domain/contractor";

/** Pick a random color from the shared client palette. */
export function randomAvatarColor(): string {
  const i = Math.floor(Math.random() * PRESET_COLORS.length);
  return PRESET_COLORS[i] ?? PRESET_COLORS[0]!;
}

/** Stable palette color from an id (for backfill / missing avatar_color). */
export function avatarColorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PRESET_COLORS[hash % PRESET_COLORS.length] ?? PRESET_COLORS[0]!;
}

export function personAvatarColor(
  person: Pick<Person, "id" | "avatar_color">,
): string {
  const color = person.avatar_color?.trim();
  if (color) return color;
  return avatarColorFromId(person.id);
}

/** Label for removed teammates / missing authorship. */
export const DELETED_USER_LABEL = "Deleted user";

export function isActivePerson(
  person: Pick<Person, "deleted_at"> | null | undefined,
): boolean {
  return Boolean(person && !person.deleted_at);
}

/** Resolve a person/profile display name; falls back to Deleted user. */
export function resolveAuthorLabel(
  profile: { full_name?: string; email?: string } | null | undefined,
  person: Pick<Person, "name" | "deleted_at"> | null | undefined,
): string {
  if (person?.deleted_at) return DELETED_USER_LABEL;
  const fromProfile =
    profile?.full_name?.trim() || profile?.email?.trim() || "";
  if (fromProfile) return fromProfile;
  const fromPerson = person?.name?.trim() || "";
  if (fromPerson) return fromPerson;
  return DELETED_USER_LABEL;
}
