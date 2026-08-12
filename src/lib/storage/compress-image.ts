const SKIP_UNDER_BYTES = 400 * 1024;
const MAX_LONG_EDGE = 2560;
const JPEG_QUALITY = 0.82;
const WEBP_QUALITY = 0.82;

/** Client-side resize/re-encode before R2 upload. Keeps originals when compression fails or does not shrink. */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif") return file;
  if (file.size <= SKIP_UNDER_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const { width, height } = bitmap;
      if (width < 1 || height < 1) return file;

      const longEdge = Math.max(width, height);
      const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1;
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);

      const hasAlpha = canvasLikelyHasAlpha(ctx, targetW, targetH);
      const preferLosslessAlpha =
        hasAlpha &&
        (file.type === "image/png" ||
          file.type === "image/webp" ||
          file.type === "image/avif");

      let blob: Blob | null = null;
      let outType = file.type;
      let outName = file.name;

      if (preferLosslessAlpha) {
        blob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
        if (blob) {
          outType = "image/webp";
          outName = replaceExt(file.name, "webp");
        } else {
          blob = await canvasToBlob(canvas, "image/png");
          if (blob) {
            outType = "image/png";
            outName = replaceExt(file.name, "png");
          }
        }
      } else {
        blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
        if (blob) {
          outType = "image/jpeg";
          outName = replaceExt(file.name, "jpg");
        }
      }

      if (!blob || blob.size >= file.size) return file;

      return new File([blob], outName || file.name, {
        type: outType,
        lastModified: file.lastModified,
      });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

function replaceExt(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, "") || name || "image";
  return `${base}.${ext}`;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

/** Sample corners + center for non-opaque pixels (cheap alpha probe). */
function canvasLikelyHasAlpha(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): boolean {
  const points: Array<[number, number]> = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), Math.floor(h / 2)],
  ];
  for (const [x, y] of points) {
    const data = ctx.getImageData(x, y, 1, 1).data;
    if ((data[3] ?? 255) < 250) return true;
  }
  return false;
}
