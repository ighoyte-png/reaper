import { readFileAsDataUrl } from "@/lib/supabase/avatar";
import { uploadFileToR2 } from "@/lib/storage/client-upload";

export type CustomEmojiUploadResult = {
  attachmentId: string;
  /** Demo-only data URL for preview/editor insert. */
  src: string | null;
};

/** Upload a custom emoji image (R2 in supabase mode; data URL in demo). */
export async function uploadCustomEmojiFile(input: {
  mode: "demo" | "supabase";
  organizationId: string;
  file: File;
}): Promise<CustomEmojiUploadResult> {
  if (!input.file.type.startsWith("image/")) {
    throw new Error("Custom emojis must be an image (png, gif, or webp)");
  }

  if (input.mode === "demo") {
    return {
      attachmentId: crypto.randomUUID(),
      src: await readFileAsDataUrl(input.file),
    };
  }

  const { attachmentId } = await uploadFileToR2({
    file: input.file,
    entityType: "custom_emoji",
    entityId: input.organizationId,
    imagesOnly: true,
  });
  return { attachmentId, src: null };
}
