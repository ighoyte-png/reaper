import { describe, expect, it } from "vitest";

/** Pure seat remaining math used by getAccountEntitlements. */
function seatsRemaining(
  seatLimit: number | null,
  seatUsed: number,
): number | null {
  return seatLimit == null ? null : Math.max(0, seatLimit - seatUsed);
}

describe("entitlement seat math", () => {
  it("treats null limit as unlimited", () => {
    expect(seatsRemaining(null, 99)).toBeNull();
  });

  it("clamps remaining at zero", () => {
    expect(seatsRemaining(5, 2)).toBe(3);
    expect(seatsRemaining(5, 8)).toBe(0);
  });
});
