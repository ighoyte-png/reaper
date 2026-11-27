import { describe, expect, it } from "vitest";
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
} from "@/lib/accounts/tokens";

describe("invite tokens", () => {
  it("hashes stably and uniquely", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.raw).not.toEqual(b.raw);
    expect(hashInviteToken(a.raw)).toEqual(a.hash);
    expect(a.hash).not.toEqual(b.hash);
  });

  it("expires in the future", () => {
    const when = new Date(inviteExpiresAt(14)).getTime();
    expect(when).toBeGreaterThan(Date.now() + 13 * 24 * 60 * 60 * 1000);
  });
});
