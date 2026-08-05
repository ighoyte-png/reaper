import {
  DEFAULT_MAX_DOCUMENT_BYTES,
  DEFAULT_MAX_IMAGE_BYTES,
} from "@/lib/storage/config";

const IMAGE_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
]);

const DOCUMENT_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
]);

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

const DOCUMENT_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/csv",
]);

const BLOCKED_EXT = new Set([
  "exe",
  "dll",
  "bat",
  "cmd",
  "com",
  "msi",
  "scr",
  "js",
  "mjs",
  "cjs",
  "vbs",
  "ps1",
  "sh",
  "jar",
  "wasm",
]);

export type FileKind = "image" | "document";

export type ValidateFileInput = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** First bytes of the file for magic sniffing (recommended ≥16). */
  magicBytes?: Uint8Array | ArrayBuffer | null;
  /** When true, only images are accepted (paste/drag into editor). */
  imagesOnly?: boolean;
  maxImageBytes?: number;
  maxDocumentBytes?: number;
};

export type ValidateFileResult =
  | {
      ok: true;
      kind: FileKind;
      extension: string;
      mimeType: string;
    }
  | { ok: false; error: string };

function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  return base.slice(i + 1).toLowerCase();
}

function bytesMatch(
  buf: Uint8Array,
  offset: number,
  sig: number[],
): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

/** Best-effort magic-byte detection; returns null when unknown/empty. */
export function sniffMimeFromMagic(
  magic: Uint8Array | ArrayBuffer | null | undefined,
): string | null {
  if (!magic) return null;
  const buf =
    magic instanceof Uint8Array ? magic : new Uint8Array(magic);
  if (buf.length < 4) return null;
  if (bytesMatch(buf, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytesMatch(buf, 0, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (
    bytesMatch(buf, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    bytesMatch(buf, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "image/gif";
  }
  if (
    bytesMatch(buf, 0, [0x52, 0x49, 0x46, 0x46]) &&
    bytesMatch(buf, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  // AVIF / HEIF (ftyp....avif)
  if (
    bytesMatch(buf, 4, [0x66, 0x74, 0x79, 0x70]) &&
    (bytesMatch(buf, 8, [0x61, 0x76, 0x69, 0x66]) ||
      bytesMatch(buf, 8, [0x6d, 0x69, 0x66, 0x31]))
  ) {
    return "image/avif";
  }
  if (bytesMatch(buf, 0, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  // ZIP-based OOXML
  if (bytesMatch(buf, 0, [0x50, 0x4b, 0x03, 0x04])) {
    return "application/zip";
  }
  return null;
}

function normalizeMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0]!.trim();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

function mimeForExt(ext: string): string | null {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "txt":
      return "text/plain";
    case "csv":
      return "text/csv";
    default:
      return null;
  }
}

export function validateUploadFile(
  input: ValidateFileInput,
): ValidateFileResult {
  const maxImage = input.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const maxDoc = input.maxDocumentBytes ?? DEFAULT_MAX_DOCUMENT_BYTES;
  const ext = extensionOf(input.filename);
  if (!ext) {
    return { ok: false, error: "File must have an extension" };
  }
  if (BLOCKED_EXT.has(ext)) {
    return { ok: false, error: "Executable or script files are not allowed" };
  }

  const declared = normalizeMime(input.mimeType || "");
  const sniffed = sniffMimeFromMagic(input.magicBytes);

  let kind: FileKind | null = null;
  if (IMAGE_EXT.has(ext) && IMAGE_MIME.has(declared || mimeForExt(ext)!)) {
    kind = "image";
  } else if (
    DOCUMENT_EXT.has(ext) &&
    (DOCUMENT_MIME.has(declared) ||
      declared === "application/octet-stream" ||
      declared === "application/zip")
  ) {
    kind = "document";
  } else if (IMAGE_EXT.has(ext) && !declared) {
    kind = "image";
  } else if (DOCUMENT_EXT.has(ext) && !declared) {
    kind = "document";
  }

  if (!kind) {
    return { ok: false, error: "Unsupported file type" };
  }
  if (input.imagesOnly && kind !== "image") {
    return { ok: false, error: "Only images can be pasted or dropped here" };
  }

  if (kind === "image" && sniffed && !IMAGE_MIME.has(sniffed)) {
    return { ok: false, error: "File contents do not match an image type" };
  }
  if (
    kind === "document" &&
    sniffed &&
    sniffed !== "application/pdf" &&
    sniffed !== "application/zip" &&
    !DOCUMENT_MIME.has(sniffed)
  ) {
    // Text/CSV often have no strong magic — allow when sniffed is null only.
    if (ext !== "txt" && ext !== "csv") {
      return {
        ok: false,
        error: "File contents do not match a supported document type",
      };
    }
  }

  if (kind === "image" && sniffed === null && input.magicBytes) {
    // Magic provided but unrecognized — reject images.
    const buf =
      input.magicBytes instanceof Uint8Array
        ? input.magicBytes
        : new Uint8Array(input.magicBytes);
    if (buf.length >= 4) {
      return { ok: false, error: "Unrecognized image file signature" };
    }
  }

  if (input.sizeBytes <= 0) {
    return { ok: false, error: "Empty files are not allowed" };
  }
  if (kind === "image" && input.sizeBytes > maxImage) {
    return {
      ok: false,
      error: `Images must be ${Math.round(maxImage / (1024 * 1024))}MB or smaller`,
    };
  }
  if (kind === "document" && input.sizeBytes > maxDoc) {
    return {
      ok: false,
      error: `Documents must be ${Math.round(maxDoc / (1024 * 1024))}MB or smaller`,
    };
  }

  const mimeType =
    (kind === "image"
      ? sniffed && IMAGE_MIME.has(sniffed)
        ? sniffed
        : IMAGE_MIME.has(declared)
          ? declared
          : mimeForExt(ext)
      : DOCUMENT_MIME.has(declared)
        ? declared
        : mimeForExt(ext)) || declared;

  if (!mimeType) {
    return { ok: false, error: "Could not determine MIME type" };
  }

  return {
    ok: true,
    kind,
    extension: ext === "jpeg" ? "jpg" : ext,
    mimeType,
  };
}
