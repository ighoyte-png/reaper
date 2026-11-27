import { describe, expect, it } from "vitest";
import {
  isAtOrOverSeatLimit,
  seatLimitMessage,
  seatsRemaining,
  type AccountEntitlements,
} from "@/lib/accounts/entitlements";

function ent(
  partial: Partial<AccountEntitlements> &
    Pick<AccountEntitlements, "seatLimit" | "seatUsed">,
): AccountEntitlements {
  return {
    organizationId: "org",
    planKey: "free",
    status: "none",
    seatsRemaining: seatsRemaining(partial.seatLimit, partial.seatUsed),
    trialEndsAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    ...partial,
  };
}

describe("entitlement seat math", () => {
  it("treats null limit as unlimited", () => {
    expect(seatsRemaining(null, 99)).toBeNull();
  });

  it("clamps remaining at zero", () => {
    expect(seatsRemaining(5, 2)).toBe(3);
    expect(seatsRemaining(5, 8)).toBe(0);
  });

  it("detects at/over limit", () => {
    expect(isAtOrOverSeatLimit(ent({ seatLimit: 5, seatUsed: 5 }))).toBe(true);
    expect(isAtOrOverSeatLimit(ent({ seatLimit: 5, seatUsed: 6 }))).toBe(true);
    expect(isAtOrOverSeatLimit(ent({ seatLimit: 5, seatUsed: 4 }))).toBe(
      false,
    );
    expect(isAtOrOverSeatLimit(ent({ seatLimit: null, seatUsed: 99 }))).toBe(
      false,
    );
  });

  it("formats messages", () => {
    expect(seatLimitMessage(ent({ seatLimit: 3, seatUsed: 3 }))).toMatch(
      /Seat limit reached \(3\/3\)/,
    );
    expect(seatLimitMessage(ent({ seatLimit: 3, seatUsed: 5 }))).toMatch(
      /Over seat limit \(5\/3\)/,
    );
  });
});
