import { PRESET_COLORS } from "@/lib/domain/colors";
import type { Person } from "@/lib/types";

/** People who appear on the schedule and in capacity/utilization aggregates. */
export function scheduleVisiblePeople(people: Person[]): Person[] {
  return people.filter((p) => !p.hide_from_schedule);
}

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
