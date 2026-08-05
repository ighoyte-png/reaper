import { describe, expect, it } from "vitest";
import { buildStorageKey, sanitizeOriginalFilename } from "@/lib/storage/keys";

describe("buildStorageKey", () => {
  it("builds profile picture keys", () => {
    const key = buildStorageKey(
      "profile_picture",
      "person-1",
      "png",
      "00000000-0000-4000-8000-000000000001",
    );
    expect(key).toBe(
      "profile-pictures/person-1/00000000-0000-4000-8000-000000000001.png",
    );
  });

  it("sanitizes unsafe extensions", () => {
    const key = buildStorageKey("comment", "c1", "../exe", "obj");
    expect(key).toBe("comments/c1/obj.exe");
  });
});

describe("sanitizeOriginalFilename", () => {
  it("strips path segments and unsafe chars", () => {
    expect(sanitizeOriginalFilename("../../evil?.png")).toBe("evil_.png");
  });
});
