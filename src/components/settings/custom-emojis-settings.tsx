"use client";

import { useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, ConfirmDialog, inputClass } from "@/components/ui/form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import {
  isValidEmojiName,
  organizationEmojiSrc,
  slugifyEmojiName,
} from "@/lib/domain/organization-emojis";
import { uploadCustomEmojiFile } from "@/lib/storage/emoji-upload";
import { cn } from "@/lib/cn";

export function CustomEmojisSettings() {
  const {
    mode,
    state,
    profile,
    upsertOrganizationEmoji,
    deleteOrganizationEmoji,
  } = useData();
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const emojis = state.organization_emojis ?? [];

  function clearDraft() {
    setName("");
    setFile(null);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onPickFile(next: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setError(null);
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      setError("Choose a png, gif, or webp image");
      return;
    }
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
    if (!name.trim()) {
      setName(slugifyEmojiName(next.name));
    }
  }

  async function onSave() {
    const handle = name.trim().toLowerCase();
    setError(null);
    if (!file) {
      setError("Choose an image");
      return;
    }
    if (!isValidEmojiName(handle)) {
      setError(
        "Name must be 2–32 characters: lowercase letters, numbers, underscores",
      );
      return;
    }
    if (emojis.some((e) => e.name === handle)) {
      setError(`:${handle}: already exists`);
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadCustomEmojiFile({
        mode,
        organizationId: state.organization.id,
        file,
      });
      await upsertOrganizationEmoji({
        id: crypto.randomUUID(),
        name: handle,
        attachment_id: uploaded.attachmentId,
        created_by_profile_id: profile?.id ?? null,
        src: uploaded.src,
      });
      push(`Added :${handle}:`, "success");
      clearDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save emoji");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;
    const target = emojis.find((e) => e.id === id);
    try {
      await deleteOrganizationEmoji(id);
      push(
        target ? `Removed :${target.name}:` : "Emoji removed",
        "success",
      );
    } catch (err) {
      push(
        err instanceof Error ? err.message : "Failed to delete emoji",
        "warning",
      );
    }
  }

  return (
    <div className="mt-8 border-t border-[var(--border)] pt-6">
      <h3 className="text-sm font-semibold">Custom emojis</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Workspace-only Slack-style shortcodes. Type{" "}
        <span className="font-mono">:</span> in notes and comments to insert.
      </p>

      {emojis.length > 0 ? (
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {emojis.map((emoji) => (
            <li
              key={emoji.id}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={organizationEmojiSrc(emoji)}
                alt={`:${emoji.name}:`}
                className="h-8 w-8 object-contain"
              />
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-[var(--text)]">
                :{emoji.name}:
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-[var(--text-muted)] hover:text-[var(--status-over)]"
                aria-label={`Delete :${emoji.name}:`}
                onClick={() => setPendingDeleteId(emoji.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          No custom emojis yet.
        </p>
      )}

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Image" className="min-w-[10rem]">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/gif,image/webp,image/jpeg"
              className="mt-1 block w-full text-sm text-[var(--text)] file:mr-2 file:rounded file:border-0 file:bg-[var(--border)] file:px-2 file:py-1.5 file:text-xs"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="mb-1 h-10 w-10 rounded object-contain"
            />
          ) : null}
        </div>
        <Field label="Name (without colons)">
          <input
            className={cn(inputClass, "font-mono")}
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            placeholder="party_parrot"
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        {error ? (
          <p className="text-xs text-[var(--status-over)]">{error}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy || !file}
            onClick={() => void onSave()}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {busy ? "Saving…" : "Add emoji"}
          </Button>
          {file || name ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={clearDraft}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {pendingDeleteId ? (
        <ConfirmDialog
          title="Delete custom emoji?"
          message="Existing notes keep the shortcode image until edited; new inserts will no longer offer this emoji."
          confirmLabel="Delete"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDeleteId(null)}
        />
      ) : null}
    </div>
  );
}
