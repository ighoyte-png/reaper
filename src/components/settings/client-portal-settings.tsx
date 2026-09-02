"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { normalizeOrgBudgetSettings } from "@/lib/domain/org-settings";
import {
  resolveAttachmentDisplayUrl,
  invalidateAttachmentDisplayUrl,
  deleteAttachment,
} from "@/lib/storage/client-upload";
import {
  uploadOrgBrandingLogoFile,
  type OrgBrandingLogoVariant,
} from "@/lib/storage/org-branding-upload";
import { cn } from "@/lib/cn";

function brandingSrc(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  if (
    value.startsWith("data:") ||
    /^https?:\/\//i.test(value) ||
    value.startsWith("/")
  ) {
    return value;
  }
  return null;
}

function LogoSlot({
  label,
  hint,
  value,
  previewUrl,
  busy,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  value: string | null;
  previewUrl: string | null;
  busy: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const src = previewUrl || brandingSrc(value);

  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>
        </div>
        {value ? (
          <button
            type="button"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--status-over)]"
            aria-label={`Remove ${label}`}
            disabled={busy}
            onClick={onClear}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
      <div className="flex h-16 items-center justify-center rounded-md bg-[var(--bg-elevated)] px-3">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${label} preview`}
            className="max-h-12 max-w-full object-contain"
          />
        ) : (
          <span className="text-xs text-[var(--text-muted)]">Reaper default</span>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        className={cn(buttonClass({ variant: "secondary", size: "sm" }), "gap-1.5")}
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={14} />
        {value ? "Replace logo" : "Upload logo"}
      </button>
    </div>
  );
}

export function ClientPortalSettings() {
  const { mode, state, upsertOrganizationSettings } = useData();
  const { push } = useToast();
  const settings = normalizeOrgBudgetSettings(
    state.organization_settings,
    state.organization.id,
  );
  const [companyName, setCompanyName] = useState(
    settings.client_portal_company_name ?? "",
  );
  const [enabled, setEnabled] = useState(settings.client_portal_enabled);
  const [lightId, setLightId] = useState(
    settings.client_portal_logo_light_attachment_id,
  );
  const [darkId, setDarkId] = useState(
    settings.client_portal_logo_dark_attachment_id,
  );
  const [lightPreview, setLightPreview] = useState<string | null>(null);
  const [darkPreview, setDarkPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setCompanyName(settings.client_portal_company_name ?? "");
    setEnabled(settings.client_portal_enabled);
    setLightId(settings.client_portal_logo_light_attachment_id);
    setDarkId(settings.client_portal_logo_dark_attachment_id);
    setDirty(false);
  }, [
    settings.client_portal_company_name,
    settings.client_portal_enabled,
    settings.client_portal_logo_light_attachment_id,
    settings.client_portal_logo_dark_attachment_id,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function loadPreview(
      id: string | null,
      setPreview: (url: string | null) => void,
    ) {
      if (!id || brandingSrc(id)) {
        setPreview(null);
        return;
      }
      const url = await resolveAttachmentDisplayUrl(id);
      if (!cancelled) setPreview(url);
    }
    void loadPreview(lightId, setLightPreview);
    void loadPreview(darkId, setDarkPreview);
    return () => {
      cancelled = true;
    };
  }, [lightId, darkId]);

  async function persist(
    patch: Partial<{
      client_portal_enabled: boolean;
      client_portal_company_name: string | null;
      client_portal_logo_light_attachment_id: string | null;
      client_portal_logo_dark_attachment_id: string | null;
    }>,
  ) {
    const next = normalizeOrgBudgetSettings(
      {
        ...settings,
        ...patch,
        client_portal_company_name:
          patch.client_portal_company_name !== undefined
            ? patch.client_portal_company_name
            : companyName.trim() || null,
        client_portal_enabled:
          patch.client_portal_enabled !== undefined
            ? patch.client_portal_enabled
            : enabled,
        client_portal_logo_light_attachment_id:
          patch.client_portal_logo_light_attachment_id !== undefined
            ? patch.client_portal_logo_light_attachment_id
            : lightId,
        client_portal_logo_dark_attachment_id:
          patch.client_portal_logo_dark_attachment_id !== undefined
            ? patch.client_portal_logo_dark_attachment_id
            : darkId,
      },
      state.organization.id,
    );
    await upsertOrganizationSettings(next);
  }

  async function onUpload(variant: OrgBrandingLogoVariant, file: File) {
    setBusy(true);
    try {
      const previous = variant === "light" ? lightId : darkId;
      const uploaded = await uploadOrgBrandingLogoFile({
        mode,
        organizationId: state.organization.id,
        variant,
        file,
      });
      if (variant === "light") {
        setLightId(uploaded.attachmentId);
        setLightPreview(uploaded.src);
      } else {
        setDarkId(uploaded.attachmentId);
        setDarkPreview(uploaded.src);
      }
      await persist(
        variant === "light"
          ? { client_portal_logo_light_attachment_id: uploaded.attachmentId }
          : { client_portal_logo_dark_attachment_id: uploaded.attachmentId },
      );
      if (
        previous &&
        mode === "supabase" &&
        !brandingSrc(previous) &&
        previous !== uploaded.attachmentId
      ) {
        invalidateAttachmentDisplayUrl(previous);
        await deleteAttachment(previous).catch(() => undefined);
      }
      push(`${variant === "light" ? "Light" : "Dark"} logo saved`, "success");
      setDirty(false);
    } catch (err) {
      push(err instanceof Error ? err.message : "Upload failed", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function onClear(variant: OrgBrandingLogoVariant) {
    setBusy(true);
    try {
      const previous = variant === "light" ? lightId : darkId;
      if (variant === "light") {
        setLightId(null);
        setLightPreview(null);
      } else {
        setDarkId(null);
        setDarkPreview(null);
      }
      await persist(
        variant === "light"
          ? { client_portal_logo_light_attachment_id: null }
          : { client_portal_logo_dark_attachment_id: null },
      );
      if (previous && mode === "supabase" && !brandingSrc(previous)) {
        invalidateAttachmentDisplayUrl(previous);
        await deleteAttachment(previous).catch(() => undefined);
      }
      push(`${variant === "light" ? "Light" : "Dark"} logo removed`, "success");
      setDirty(false);
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not remove logo", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveText() {
    setBusy(true);
    try {
      await persist({
        client_portal_enabled: enabled,
        client_portal_company_name: companyName.trim() || null,
      });
      push("Client Portal settings saved", "success");
      setDirty(false);
    } catch (err) {
      push(err instanceof Error ? err.message : "Save failed", "warning");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 space-y-4 border-t border-[var(--border)] pt-6">
      <div>
        <h3 className="text-sm font-semibold">Client Portal</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Control project Client Portals and optional white-label branding.
          Empty branding fields keep the Reaper defaults.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={enabled}
          disabled={busy}
          onChange={(e) => {
            setEnabled(e.target.checked);
            setDirty(true);
          }}
        />
        <span>
          <span className="font-medium">Enable Client Portal</span>
          <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
            When off, projects cannot enable or open a Client Portal, and
            existing portal links stop working until this is turned back on.
          </span>
        </span>
      </label>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">White Label</h4>
        <Field label="Company name">
          <input
            className={inputClass}
            value={companyName}
            disabled={busy}
            placeholder="Shown before Client Dashboard and in the page title"
            onChange={(e) => {
              setCompanyName(e.target.value);
              setDirty(true);
            }}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <LogoSlot
            label="Light mode logo"
            hint="Used when the portal is in light theme"
            value={lightId}
            previewUrl={lightPreview}
            busy={busy}
            onPick={(file) => void onUpload("light", file)}
            onClear={() => void onClear("light")}
          />
          <LogoSlot
            label="Dark mode logo"
            hint="Used when the portal is in dark theme"
            value={darkId}
            previewUrl={darkPreview}
            busy={busy}
            onPick={(file) => void onUpload("dark", file)}
            onClear={() => void onClear("dark")}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={busy || !dirty}
          onClick={() => void onSaveText()}
        >
          Save Client Portal
        </Button>
      </div>
    </section>
  );
}
