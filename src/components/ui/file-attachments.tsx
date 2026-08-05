"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  formatAttachmentSize,
  listEntityFileAttachments,
  resolveAttachmentDisplayUrl,
} from "@/lib/storage/client-upload";
import type {
  AttachmentEntityType,
  EntityFileAttachment,
} from "@/lib/storage/types";

export function EntityFileAttachments({
  entityType,
  entityId,
  className,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  className?: string;
}) {
  const [items, setItems] = useState<EntityFileAttachment[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await listEntityFileAttachments({ entityType, entityId });
      if (!cancelled) setItems(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  if (items.length === 0) return null;

  return (
    <FileAttachmentList items={items} className={className} />
  );
}

export function FileAttachmentList({
  items,
  onRemove,
  className,
}: {
  items: EntityFileAttachment[];
  onRemove?: (id: string) => void;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <ul className={cn("space-y-1.5", className)}>
      {items.map((item) => (
        <FileAttachmentChip
          key={item.id}
          item={item}
          onRemove={onRemove ? () => onRemove(item.id) : undefined}
        />
      ))}
    </ul>
  );
}

function FileAttachmentChip({
  item,
  onRemove,
}: {
  item: EntityFileAttachment;
  onRemove?: () => void;
}) {
  const [href, setHref] = useState<string | null>(null);
  const isImage = item.mime_type.startsWith("image/");
  const sizeLabel = formatAttachmentSize(item.size_bytes);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = await resolveAttachmentDisplayUrl(item.id);
      if (!cancelled) setHref(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  return (
    <li className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,var(--comment-bg))] px-2 py-1.5">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--border)]/50 text-[var(--text-muted)]">
        {isImage ? (
          <ImageIcon size={14} strokeWidth={1.75} />
        ) : (
          <Paperclip size={14} strokeWidth={1.75} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            title={item.original_filename}
          >
            {item.original_filename}
          </a>
        ) : (
          <span
            className="block truncate text-xs font-medium text-[var(--text)]"
            title={item.original_filename}
          >
            {item.original_filename}
          </span>
        )}
        <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
          {sizeLabel}
          {sizeLabel && item.mime_type ? " · " : null}
          {isImage ? "Image" : "File"}
        </span>
      </div>
      {onRemove ? (
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
          aria-label={`Remove ${item.original_filename}`}
          title="Remove"
          onClick={onRemove}
        >
          <X size={13} strokeWidth={1.75} />
        </button>
      ) : null}
    </li>
  );
}
