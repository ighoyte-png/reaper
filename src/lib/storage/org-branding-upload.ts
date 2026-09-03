import { readFileAsDataUrl } from "@/lib/supabase/avatar";
import { uploadFileToR2 } from "@/lib/storage/client-upload";

export type OrgBrandingLogoVariant = "light" | "dark";

export type OrgBrandingUploadResult = {
  attachmentId: string;
  /** Demo-only data URL for preview. */
  src: string | null;
};

/** Upload a Client Portal white-label logo (R2 in supabase mode; data URL in demo). */
export async function uploadOrgBrandingLogoFile(input: {
  mode: "demo" | "supabase";
  organizationId: string;
  variant: OrgBrandingLogoVariant;
  file: File;
}): Promise<OrgBrandingUploadResult> {
  if (!input.file.type.startsWith("image/")) {
    throw new Error("Logos must be an image (png, jpg, gif, svg, or webp)");
  }

  if (input.mode === "demo") {
    const src = await readFileAsDataUrl(input.file);
    return {
      // Demo has no attachments table — store the data URL in the settings field.
      attachmentId: src,
      src,
    };
  }

  // attachments.entity_id is uuid — light/dark is stored on organization_settings.
  const { attachmentId } = await uploadFileToR2({
    file: input.file,
    entityType: "org_branding",
    entityId: input.organizationId,
    imagesOnly: true,
  });
  return { attachmentId, src: null };
}
