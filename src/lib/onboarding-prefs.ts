"use client";

/** Per-profile + org dismiss flags for login wizards. */

export type OnboardingFlags = {
  inviteTeamDismissed: boolean;
  welcomeDismissed: boolean;
};

const DEFAULT: OnboardingFlags = {
  inviteTeamDismissed: false,
  welcomeDismissed: false,
};

function storageKey(profileId: string, orgId: string) {
  return `reaper-onboarding:${profileId}:${orgId}`;
}

export function readOnboardingFlags(
  profileId: string | null | undefined,
  orgId: string | null | undefined,
): OnboardingFlags {
  if (!profileId || !orgId || typeof window === "undefined") {
    return { ...DEFAULT };
  }
  try {
    const raw = localStorage.getItem(storageKey(profileId, orgId));
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<OnboardingFlags>;
    return {
      inviteTeamDismissed: Boolean(parsed.inviteTeamDismissed),
      welcomeDismissed: Boolean(parsed.welcomeDismissed),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeOnboardingFlags(
  profileId: string,
  orgId: string,
  patch: Partial<OnboardingFlags>,
): OnboardingFlags {
  const next = {
    ...readOnboardingFlags(profileId, orgId),
    ...patch,
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(storageKey(profileId, orgId), JSON.stringify(next));
  }
  return next;
}
