import type { Person, Profile, Role } from "@/lib/types";

export function canManage(role: Role | undefined | null): boolean {
  return role === "admin" || role === "manager";
}

export function isAdmin(role: Role | undefined | null): boolean {
  return role === "admin";
}

export function personForProfile(
  people: Person[],
  profile: Profile | null,
): Person | null {
  if (!profile) return null;
  return people.find((p) => p.profile_id === profile.id) ?? null;
}
