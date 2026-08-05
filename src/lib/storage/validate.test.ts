import { describe, expect, it } from "vitest";
import { sniffMimeFromMagic, validateUploadFile } from "@/lib/storage/validate";

describe("sniffMimeFromMagic", () => {
  it("detects PNG", () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(sniffMimeFromMagic(bytes)).toBe("image/png");
  });
});

describe("validateUploadFile", () => {
  it("rejects executables", () => {
    const result = validateUploadFile({
      filename: "virus.exe",
      mimeType: "application/octet-stream",
      sizeBytes: 100,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a valid PNG", () => {
    const magic = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const result = validateUploadFile({
      filename: "photo.png",
      mimeType: "image/png",
      sizeBytes: 1024,
      magicBytes: magic,
      imagesOnly: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("image");
      expect(result.mimeType).toBe("image/png");
    }
  });

  it("rejects non-images when imagesOnly", () => {
    const result = validateUploadFile({
      filename: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      imagesOnly: true,
    });
    expect(result.ok).toBe(false);
  });
});
