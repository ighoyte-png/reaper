import { describe, expect, it } from "vitest";
import { capacityLevel, utilizationPct } from "@/lib/domain/capacity";

describe("capacityLevel", () => {
  const thresholds = {
    lowMaxPct: 60,
    nearPct: 85,
    overPct: 101,
  };

  it("treats exactly 100% as not over when over threshold is 101%", () => {
    // 40 booked / 40 available = 100%
    expect(capacityLevel(40, 40, false, thresholds)).toBe("near");
  });

  it("turns over only when utilization reaches the configured over %", () => {
    expect(capacityLevel(40.4, 40, false, thresholds)).toBe("over");
  });

  it("uses low / healthy / near bands from settings", () => {
    expect(capacityLevel(20, 40, false, thresholds)).toBe("low"); // 50%
    expect(capacityLevel(28, 40, false, thresholds)).toBe("healthy"); // 70%
    expect(capacityLevel(36, 40, false, thresholds)).toBe("near"); // 90%
  });

  it("does not use hard-coded 100% over when thresholds are provided", () => {
    expect(utilizationPct(40, 40)).toBe(100);
    expect(capacityLevel(40, 40, false, { overPct: 100 })).toBe("over");
    expect(capacityLevel(40, 40, false, { overPct: 101 })).not.toBe("over");
  });
});
