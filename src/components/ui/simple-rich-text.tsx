"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, forwardRef } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Code,
  Code2,
  Link as LinkIcon,
  List,
  ListOrdered,
  Paperclip,
  Underline as UnderlineIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { nearestVerticalScrollport } from "@/lib/scroll-into-nearest";
import {
  extractAttachmentIdsFromNotesHtml,
  notesToEditorHtml,
  sanitizeNotesHtml,
} from "@/lib/notes-html";
import type { MentionPerson } from "@/lib/mentions";
import { createMentionSuggestion } from "@/components/ui/mention-suggestion";
import { ensureDesktopNotificationPermission } from "@/lib/desktop-notifications";
import { Field, Modal, inputClass, ConfirmDialog } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  deleteAttachment,
  hydrateNotesHtmlForEditor,
  listEntityFileAttachments,
  notesHtmlAttachmentKey,
  resolveAttachmentDisplayUrl,
  uploadFileToR2,
} from "@/lib/storage/client-upload";
import type {
  AttachmentEntityType,
  EntityFileAttachment,
} from "@/lib/storage/types";
import { FileAttachmentList } from "@/components/ui/file-attachments";
import {
  ImageLightbox,
  imageLightboxTargetFromEvent,
  type ImageLightboxTarget,
} from "@/components/ui/image-lightbox";

const editorContentClass = cn(
  "min-h-[4.5rem] p-[15px] text-sm leading-relaxed text-[var(--text)] outline-none",
  "[&_p]:m-0 [&_p+p]:mt-2",
  "[&_h1]:m-0 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:leading-snug",
  "[&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:leading-snug",
  "[&_h3]:m-0 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-snug",
  "[&_h1:not(:first-child)]:mt-3 [&_h2:not(:first-child)]:mt-2.5 [&_h3:not(:first-child)]:mt-2",
  "[&_h1+p]:mt-2 [&_h2+p]:mt-2 [&_h3+p]:mt-2",
  "[&_p+h1]:mt-3 [&_p+h2]:mt-2.5 [&_p+h3]:mt-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_ul:first-child]:mt-0 [&_ol:first-child]:mt-0",
  "[&_li]:my-0.5 [&_li>p]:m-0",
  "[&_p+ul]:mt-2 [&_p+ol]:mt-2",
  "[&_ul+p]:mt-2 [&_ol+p]:mt-2",
  "[&_a]:text-[var(--accent)] [&_a]:underline [&_a]:underline-offset-2",
  "[&_.mention]:rounded [&_.mention]:px-0.5 [&_.mention]:font-medium [&_.mention]:text-[var(--accent)]",
  "[&_img]:my-2 [&_img]:cursor-zoom-in [&_img]:max-w-full [&_img]:rounded-md",
  "[&_code]:rounded [&_code]:bg-[var(--bg-elevated)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-[var(--bg-elevated)] [&_pre]:px-2.5 [&_pre]:py-2 [&_pre]:font-mono [&_pre]:text-[0.85em] [&_pre]:leading-relaxed",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
);

/** Keep caret scroll inside the editor scroller — avoid yanking the page. */
function scrollSelectionIntoEditor(view: {
  dom: HTMLElement;
  coordsAtPos: (pos: number) => { top: number; bottom: number };
  state: { selection: { from: number } };
}): boolean {
  const scroller = view.dom.closest(
    "[data-reaper-editor-scroll]",
  ) as HTMLElement | null;
  if (!scroller) return true;
  const style = window.getComputedStyle(scroller);
  const canScroll =
    style.overflowY === "auto" ||
    style.overflowY === "scroll" ||
    scroller.scrollHeight > scroller.clientHeight + 1;
  if (!canScroll) return true;
  try {
    const coords = view.coordsAtPos(view.state.selection.from);
    const rect = scroller.getBoundingClientRect();
    const pad = 8;
    if (coords.top < rect.top + pad) {
      scroller.scrollTop -= rect.top + pad - coords.top;
    } else if (coords.bottom > rect.bottom - pad) {
      scroller.scrollTop += coords.bottom - (rect.bottom - pad);
    }
  } catch {
    /* ignore invalid positions */
  }
  return true;
}

const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-attachment-id": {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-attachment-id"),
        renderHTML: (attributes) => {
          const id = attributes["data-attachment-id"];
          if (!id) return {};
          return { "data-attachment-id": id };
        },
      },
      "data-pending-id": {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-pending-id"),
        renderHTML: (attributes) => {
          const id = attributes["data-pending-id"];
          if (!id) return {};
          return { "data-pending-id": id };
        },
      },
    };
  },
});

function imageFilesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const files: File[] = [];
  for (let i = 0; i < dt.files.length; i++) {
    const f = dt.files[i];
    if (f && f.type.startsWith("image/")) files.push(f);
  }
  return files;
}

function normalizeLinkUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t) || /^mailto:/i.test(t)) return t;
  if (/^[a-z0-9][a-z0-9+.-]*:/i.test(t)) return null;
  return `https://${t}`;
}

type LinkTarget = "_blank" | "_self";

type LinkDraft = {
  title: string;
  href: string;
  target: LinkTarget;
};

function selectionLinkDraft(editor: Editor): LinkDraft {
  const { from, to, empty } = editor.state.selection;
  const selected = empty
    ? ""
    : editor.state.doc.textBetween(from, to, " ");
  const attrs = editor.getAttributes("link");
  const href = typeof attrs.href === "string" ? attrs.href : "";
  const target: LinkTarget =
    attrs.target === "_self" ? "_self" : "_blank";
  return {
    title: selected || (href ? selected : ""),
    href: href || "https://",
    target,
  };
}

function applyLink(editor: Editor, draft: LinkDraft) {
  const href = normalizeLinkUrl(draft.href);
  if (!href) {
    editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .extendMarkRange("link")
      .unsetLink()
      .run();
    return;
  }

  const target = draft.target;
  const rel = target === "_blank" ? "noopener noreferrer" : null;
  const { from, to, empty } = editor.state.selection;
  const selected = empty
    ? ""
    : editor.state.doc.textBetween(from, to, " ");
  const title = draft.title.trim() || selected || href;

  const attrs = { href, target, rel };

  if (empty || title !== selected) {
    editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .command(({ tr, state, dispatch }) => {
        const mark = state.schema.marks.link?.create(attrs);
        if (!mark) return false;
        const node = state.schema.text(title, [mark]);
        if (dispatch) {
          tr.replaceWith(from, empty ? from : to, node);
          dispatch(tr);
        }
        return true;
      })
      .run();
    return;
  }

  editor
    .chain()
    .focus(undefined, { scrollIntoView: false })
    .extendMarkRange("link")
    .setLink(attrs)
    .run();
}

export type SimpleRichTextEditorHandle = {
  /** Upload pending paste/drop images to R2 and return final HTML. */
  flushPendingInlineUploads: () => Promise<string>;
};

type SimpleRichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  /** When set, typing @ opens a Slack-style mention flyout. */
  mentionPeople?: MentionPerson[];
  /** Cap editor body height (px); pairs with editorOverflowY. */
  editorMaxHeight?: number;
  editorOverflowY?: "auto" | "hidden";
  /** Grow with content (comment / new task description). */
  autoGrow?: boolean;
  /** Pin formatting toolbar to the page scrollport while editing long content. */
  stickyToolbar?: boolean;
  enableAttachments?: boolean;
  attachmentEntityType?: AttachmentEntityType;
  attachmentEntityId?: string | null;
  onAttachmentError?: (msg: string) => void;
  /** Fired when email-style (paperclip) attachments change. */
  onFileAttachmentsChange?: (items: EntityFileAttachment[]) => void;
  isDemo?: boolean;
};

export const SimpleRichTextEditor = forwardRef<
  SimpleRichTextEditorHandle,
  SimpleRichTextEditorProps
>(function SimpleRichTextEditor(
  {
    value,
    onChange,
    className,
    placeholder = "Add a note…",
    mentionPeople,
    editorMaxHeight,
    editorOverflowY,
    autoGrow = false,
    stickyToolbar = false,
    enableAttachments = false,
    attachmentEntityType,
    attachmentEntityId = null,
    onAttachmentError,
    onFileAttachmentsChange,
    isDemo = false,
  },
  ref,
) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileAttachments, setFileAttachments] = useState<
    EntityFileAttachment[]
  >([]);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ImageLightboxTarget | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openLightboxRef = useRef((target: ImageLightboxTarget) => {
    setLightbox(target);
  });
  openLightboxRef.current = (target) => setLightbox(target);
  const onAttachmentErrorRef = useRef(onAttachmentError);
  onAttachmentErrorRef.current = onAttachmentError;
  const onFileAttachmentsChangeRef = useRef(onFileAttachmentsChange);
  onFileAttachmentsChangeRef.current = onFileAttachmentsChange;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pendingFilesRef = useRef(
    new Map<string, { file: File; blobUrl: string }>(),
  );

  const attachmentsActive =
    enableAttachments &&
    Boolean(attachmentEntityType) &&
    Boolean(attachmentEntityId) &&
    !isDemo;
  const [linkDraft, setLinkDraft] = useState<LinkDraft>({
    title: "",
    href: "https://",
    target: "_blank",
  });

  const peopleKey = (mentionPeople ?? [])
    .map((p) => p.id)
    .sort()
    .join(",");

  const edRef = useRef<Editor | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const toolbarSentinelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarPinned, setToolbarPinned] = useState(false);
  const [pinStyle, setPinStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);

  function syncFileAttachments(next: EntityFileAttachment[]) {
    setFileAttachments(next);
    onFileAttachmentsChangeRef.current?.(next);
  }

  function insertPendingInlineImage(file: File) {
    if (!attachmentsActive) return;
    const pendingId = crypto.randomUUID();
    const blobUrl = URL.createObjectURL(file);
    pendingFilesRef.current.set(pendingId, { file, blobUrl });
    edRef.current
      ?.chain()
      .focus(undefined, { scrollIntoView: false })
      .setImage({
        src: blobUrl,
        alt: file.name || "Image",
        "data-pending-id": pendingId,
      } as {
        src: string;
        alt?: string;
        "data-pending-id": string;
      })
      .run();
  }

  useEffect(() => {
    return () => {
      for (const entry of pendingFilesRef.current.values()) {
        URL.revokeObjectURL(entry.blobUrl);
      }
      pendingFilesRef.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    if (!stickyToolbar) {
      setToolbarPinned(false);
      setPinStyle(null);
      return;
    }
    const root = rootRef.current;
    const toolbar = toolbarRef.current;
    const sentinel = toolbarSentinelRef.current;
    if (!root || !toolbar || !sentinel) return;

    const scrollport =
      root.closest("[data-page-scrollport]") instanceof HTMLElement
        ? (root.closest("[data-page-scrollport]") as HTMLElement)
        : nearestVerticalScrollport(root);

    if (!scrollport) return;

    const update = () => {
      const portRect = scrollport.getBoundingClientRect();
      const sentinelRect = sentinel.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const height = toolbar.offsetHeight;
      if (height > 0) setToolbarHeight(height);

      const editorVisible = rootRect.bottom > portRect.top + 4;
      const shouldPin = editorVisible && sentinelRect.top < portRect.top;

      if (shouldPin) {
        setToolbarPinned(true);
        setPinStyle({
          top: portRect.top,
          left: rootRect.left,
          width: rootRect.width,
        });
      } else {
        setToolbarPinned(false);
        setPinStyle(null);
      }
    };

    update();
    scrollport.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(update)
      : null;
    ro?.observe(root);
    ro?.observe(scrollport);
    ro?.observe(toolbar);

    return () => {
      scrollport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [stickyToolbar]);

  useEffect(() => {
    if (!attachmentsActive || !attachmentEntityType || !attachmentEntityId) {
      syncFileAttachments([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const next = await listEntityFileAttachments({
        entityType: attachmentEntityType,
        entityId: attachmentEntityId,
      });
      if (!cancelled) syncFileAttachments(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when entity changes
  }, [attachmentsActive, attachmentEntityType, attachmentEntityId]);

  const uploadAttachedFile = useMemo(() => {
    return async (file: File) => {
      if (!attachmentsActive || !attachmentEntityType || !attachmentEntityId) {
        return;
      }
      setUploading(true);
      try {
        const uploaded = await uploadFileToR2({
          file,
          entityType: attachmentEntityType,
          entityId: attachmentEntityId,
          imagesOnly: false,
          placement: "attached",
        });
        setFileAttachments((prev) => {
          const next = [
            ...prev,
            {
              id: uploaded.attachmentId,
              original_filename: uploaded.originalFilename,
              mime_type: uploaded.mimeType,
              size_bytes: uploaded.sizeBytes,
            },
          ];
          onFileAttachmentsChangeRef.current?.(next);
          return next;
        });
      } catch (err) {
        onAttachmentErrorRef.current?.(
          err instanceof Error ? err.message : "Upload failed",
        );
      } finally {
        setUploading(false);
      }
    };
  }, [attachmentsActive, attachmentEntityType, attachmentEntityId]);

  useImperativeHandle(
    ref,
    () => ({
      async flushPendingInlineUploads() {
        const editor = edRef.current;
        if (!editor) return "";
        if (
          !attachmentsActive ||
          !attachmentEntityType ||
          !attachmentEntityId
        ) {
          return editor.isEmpty ? "" : editor.getHTML();
        }

        const pendingIds: string[] = [];
        editor.state.doc.descendants((node) => {
          const id = node.attrs["data-pending-id"];
          if (typeof id === "string" && id) pendingIds.push(id);
        });
        const unique = [...new Set(pendingIds)];
        if (unique.length === 0) {
          return editor.isEmpty ? "" : editor.getHTML();
        }

        setUploading(true);
        try {
          for (const pendingId of unique) {
            const findPositions = () => {
              const positions: number[] = [];
              editor.state.doc.descendants((node, pos) => {
                if (
                  node.type.name === "image" &&
                  node.attrs["data-pending-id"] === pendingId
                ) {
                  positions.push(pos);
                }
              });
              return positions;
            };

            const entry = pendingFilesRef.current.get(pendingId);
            if (!entry) {
              for (const pos of [...findPositions()].reverse()) {
                editor
                  .chain()
                  .setNodeSelection(pos)
                  .deleteSelection()
                  .run();
              }
              continue;
            }

            const uploaded = await uploadFileToR2({
              file: entry.file,
              entityType: attachmentEntityType,
              entityId: attachmentEntityId,
              imagesOnly: true,
              placement: "inline",
            });
            const displayUrl =
              (await resolveAttachmentDisplayUrl(uploaded.attachmentId)) ||
              "";

            for (const pos of findPositions()) {
              editor
                .chain()
                .setNodeSelection(pos)
                .updateAttributes("image", {
                  src: displayUrl,
                  "data-attachment-id": uploaded.attachmentId,
                  "data-pending-id": null,
                })
                .run();
            }

            URL.revokeObjectURL(entry.blobUrl);
            pendingFilesRef.current.delete(pendingId);
          }

          const html = editor.isEmpty ? "" : editor.getHTML();
          onChangeRef.current(html);
          return html;
        } catch (err) {
          onAttachmentErrorRef.current?.(
            err instanceof Error ? err.message : "Upload failed",
          );
          throw err;
        } finally {
          setUploading(false);
        }
      },
    }),
    [attachmentsActive, attachmentEntityType, attachmentEntityId],
  );

    const extensions = useMemo((): Extensions => {
    const base: Extensions = [
      StarterKit.configure({
        blockquote: false,
        heading: { levels: [1, 2, 3] },
        horizontalRule: false,
        italic: false,
        strike: false,
        trailingNode: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: {
            class: "text-[var(--accent)] underline underline-offset-2",
          },
        },
      }),
      Underline,
    ];

    if (attachmentsActive) {
      base.push(
        AttachmentImage.configure({
          inline: true,
          allowBase64: false,
          HTMLAttributes: {
            class: "max-w-full cursor-zoom-in rounded-md",
          },
        }),
      );
    }

    if (!mentionPeople || mentionPeople.length === 0) return base;

    return [
      ...base,
      Mention.configure({
        HTMLAttributes: {
          class:
            "mention rounded px-0.5 font-medium text-[var(--accent)]",
        },
        renderText: ({ node }) =>
          `@${node.attrs.label ?? node.attrs.id ?? ""}`,
        renderHTML: ({ node }) => [
          "span",
          {
            "data-type": "mention",
            "data-id": node.attrs.id,
            "data-label": node.attrs.label,
            class:
              "mention rounded px-0.5 font-medium text-[var(--accent)]",
          },
          `@${node.attrs.label ?? node.attrs.id ?? ""}`,
        ],
        suggestion: createMentionSuggestion(mentionPeople),
      }),
    ];
    // peopleKey captures identity of the list without unstable array refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey, attachmentsActive]);

  const editor = useEditor(
    {
      extensions,
      content: notesToEditorHtml(value),
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: editorContentClass,
          "data-placeholder": placeholder,
        },
        handleScrollToSelection: (view) => scrollSelectionIntoEditor(view),
        handleDOMEvents: {
          click: (_view, event) => {
            const target = imageLightboxTargetFromEvent(event);
            if (!target) return false;
            event.preventDefault();
            openLightboxRef.current(target);
            return true;
          },
        },
        handlePaste: (_view, event) => {
          if (!attachmentsActive) return false;
          const files = imageFilesFromDataTransfer(event.clipboardData);
          if (files.length === 0) return false;
          event.preventDefault();
          insertPendingInlineImage(files[0]!);
          return true;
        },
        handleDrop: (_view, event) => {
          if (!attachmentsActive) return false;
          const files = imageFilesFromDataTransfer(event.dataTransfer);
          if (files.length === 0) return false;
          event.preventDefault();
          insertPendingInlineImage(files[0]!);
          return true;
        },
      },
      onUpdate: ({ editor: ed }) => {
        const alive = new Set<string>();
        ed.state.doc.descendants((node) => {
          const id = node.attrs["data-pending-id"];
          if (typeof id === "string" && id) alive.add(id);
        });
        for (const [id, entry] of pendingFilesRef.current) {
          if (alive.has(id)) continue;
          URL.revokeObjectURL(entry.blobUrl);
          pendingFilesRef.current.delete(id);
        }
        const html = ed.isEmpty ? "" : ed.getHTML();
        onChange(html);
      },
    },
    [extensions, attachmentsActive],
  );

  useEffect(() => {
    edRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    let hasPending = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "image" && node.attrs["data-pending-id"]) {
        hasPending = true;
      }
    });
    // Keep paste previews intact until save; controlled value must not wipe them.
    if (hasPending) return;

    let cancelled = false;
    void (async () => {
      const hydrated = await hydrateNotesHtmlForEditor(value);
      if (cancelled || !edRef.current) return;
      const ed = edRef.current;
      const current = ed.isEmpty ? "" : ed.getHTML();
      // Sanitize both sides so TipTap's literal `"` won't diverge from `&quot;`
      // and trigger setContent (which jumps the caret to the document end).
      const valueKey = notesHtmlAttachmentKey(notesToEditorHtml(value));
      const currentKey = notesHtmlAttachmentKey(notesToEditorHtml(current));
      const hydratedKey = notesHtmlAttachmentKey(notesToEditorHtml(hydrated));

      // Parent replaced the document (e.g. opened edit) — load hydrated HTML.
      if (valueKey !== currentKey) {
        if (hydratedKey === currentKey) return;
        ed.commands.setContent(hydrated || "", { emitUpdate: false });
        return;
      }

      // Same document: refresh attachment image srcs in place (no caret jump).
      const urls = new Map<string, string>();
      const ids = extractAttachmentIdsFromNotesHtml(hydrated);
      await Promise.all(
        ids.map(async (id) => {
          const url = await resolveAttachmentDisplayUrl(id);
          if (url) urls.set(id.toLowerCase(), url);
        }),
      );
      if (cancelled || !edRef.current) return;

      const { tr } = ed.state;
      let changed = false;
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name !== "image") return;
        const id = String(node.attrs["data-attachment-id"] ?? "").toLowerCase();
        if (!id || node.attrs["data-pending-id"]) return;
        const url = urls.get(id);
        if (!url || node.attrs.src === url) return;
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          src: url,
        });
        changed = true;
      });
      if (changed) ed.view.dispatch(tr);
    })();

    return () => {
      cancelled = true;
    };
  }, [editor, value]);

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) return null;
      return {
        bold: ed.isActive("bold"),
        underline: ed.isActive("underline"),
        link: ed.isActive("link"),
        bulletList: ed.isActive("bulletList"),
        orderedList: ed.isActive("orderedList"),
        code: ed.isActive("code"),
        codeBlock: ed.isActive("codeBlock"),
        h1: ed.isActive("heading", { level: 1 }),
        h2: ed.isActive("heading", { level: 2 }),
        h3: ed.isActive("heading", { level: 3 }),
      };
    },
  });

  if (!editor) return null;

  const ed = editor;

  function openLinkDialog() {
    setLinkDraft(selectionLinkDraft(ed));
    setLinkOpen(true);
  }

  function submitLink() {
    applyLink(ed, linkDraft);
    setLinkOpen(false);
  }

  function removeLink() {
    ed.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }

  return (
    <div
      ref={rootRef}
      data-reaper-rich-text-root=""
      className={cn(
        "mt-1 rounded-md border border-[var(--border)] bg-[var(--bg)]",
        !autoGrow && !editorMaxHeight && "overflow-hidden",
        className,
      )}
    >
      <div
        ref={toolbarSentinelRef}
        className="pointer-events-none h-px w-full shrink-0 opacity-0"
        aria-hidden
      />
      {toolbarPinned && toolbarHeight > 0 ? (
        <div
          className="shrink-0"
          style={{ height: toolbarHeight }}
          aria-hidden
        />
      ) : null}
      <div
        ref={toolbarRef}
        className={cn(
          "flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg)] px-1 py-0.5",
          toolbarPinned && "z-[45] border-[var(--border)] shadow-sm",
        )}
        style={
          toolbarPinned && pinStyle
            ? {
                position: "fixed",
                top: pinStyle.top,
                left: pinStyle.left,
                width: pinStyle.width,
              }
            : undefined
        }
      >
        <ToolbarButton
          label="Bold"
          active={Boolean(toolbar?.bold)}
          onClick={() =>
            ed.chain().focus(undefined, { scrollIntoView: false }).toggleBold().run()
          }
        >
          <Bold size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={Boolean(toolbar?.underline)}
          onClick={() =>
            ed.chain().focus(undefined, { scrollIntoView: false }).toggleUnderline().run()
          }
        >
          <UnderlineIcon size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 1"
          active={Boolean(toolbar?.h1)}
          className="w-auto min-w-7 px-1.5 text-[10px] font-semibold"
          onClick={() =>
            ed
              .chain()
              .focus(undefined, { scrollIntoView: false })
              .toggleHeading({ level: 1 })
              .run()
          }
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          active={Boolean(toolbar?.h2)}
          className="w-auto min-w-7 px-1.5 text-[10px] font-semibold"
          onClick={() =>
            ed
              .chain()
              .focus(undefined, { scrollIntoView: false })
              .toggleHeading({ level: 2 })
              .run()
          }
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          active={Boolean(toolbar?.h3)}
          className="w-auto min-w-7 px-1.5 text-[10px] font-semibold"
          onClick={() =>
            ed
              .chain()
              .focus(undefined, { scrollIntoView: false })
              .toggleHeading({ level: 3 })
              .run()
          }
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          active={Boolean(toolbar?.bulletList)}
          onClick={() =>
            ed.chain().focus(undefined, { scrollIntoView: false }).toggleBulletList().run()
          }
        >
          <List size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={Boolean(toolbar?.orderedList)}
          onClick={() =>
            ed.chain().focus(undefined, { scrollIntoView: false }).toggleOrderedList().run()
          }
        >
          <ListOrdered size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={Boolean(toolbar?.code)}
          onClick={() =>
            ed.chain().focus(undefined, { scrollIntoView: false }).toggleCode().run()
          }
        >
          <Code size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={Boolean(toolbar?.codeBlock)}
          onClick={() =>
            ed
              .chain()
              .focus(undefined, { scrollIntoView: false })
              .toggleCodeBlock()
              .run()
          }
        >
          <Code2 size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={Boolean(toolbar?.link)}
          onClick={openLinkDialog}
        >
          <LinkIcon size={14} strokeWidth={2.5} />
        </ToolbarButton>
        {attachmentsActive ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void uploadAttachedFile(file);
                }
                e.target.value = "";
              }}
            />
            <ToolbarButton
              label="Attach file"
              active={false}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={14} strokeWidth={2.5} />
            </ToolbarButton>
          </>
        ) : null}
      </div>
      {uploading ? (
        <p className="border-b border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
          Uploading…
        </p>
      ) : null}
      <div
        data-reaper-editor-scroll=""
        className={cn(autoGrow && "overflow-visible")}
        style={
          editorMaxHeight != null
            ? {
                maxHeight: editorMaxHeight,
                overflowY: editorOverflowY ?? "auto",
              }
            : undefined
        }
        onFocusCapture={() => {
          if (mentionPeople && mentionPeople.length > 0) {
            void ensureDesktopNotificationPermission();
          }
        }}
      >
        <EditorContent editor={ed} />
      </div>
      {attachmentsActive ? (
        <FileAttachmentList
          items={fileAttachments}
          className="border-t border-[var(--border)] px-2 py-2"
          onRemove={(id) => setPendingRemoveId(id)}
        />
      ) : null}
      {pendingRemoveId ? (
        <ConfirmDialog
          title="Remove attachment?"
          message="This permanently deletes the file from storage. This cannot be undone."
          confirmLabel="Remove"
          onCancel={() => setPendingRemoveId(null)}
          onConfirm={() => {
            const id = pendingRemoveId;
            setPendingRemoveId(null);
            const prev = fileAttachments;
            syncFileAttachments(prev.filter((a) => a.id !== id));
            void deleteAttachment(id).catch((err) => {
              syncFileAttachments(prev);
              onAttachmentErrorRef.current?.(
                err instanceof Error ? err.message : "Failed to remove file",
              );
            });
          }}
        />
      ) : null}
      {mentionPeople && mentionPeople.length > 0 ? (
        <p className="border-t border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
          Type @ to mention someone
        </p>
      ) : null}
      {linkOpen ? (
        <Modal title="Insert link" onClose={() => setLinkOpen(false)} className="max-w-md">
          <div className="space-y-3">
            <Field label="Title">
              <input
                className={inputClass}
                value={linkDraft.title}
                onChange={(e) =>
                  setLinkDraft((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Link text"
                autoFocus
              />
            </Field>
            <Field label="URL">
              <input
                className={inputClass}
                value={linkDraft.href}
                onChange={(e) =>
                  setLinkDraft((prev) => ({ ...prev, href: e.target.value }))
                }
                placeholder="https://"
                inputMode="url"
              />
            </Field>
            <Field label="Open in">
              <Select
                value={linkDraft.target}
                onChange={(value) =>
                  setLinkDraft((prev) => ({
                    ...prev,
                    target: value === "_self" ? "_self" : "_blank",
                  }))
                }
                options={[
                  { value: "_blank", label: "New tab" },
                  { value: "_self", label: "Same tab" },
                ]}
              />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {toolbar?.link ? (
                <button
                  type="button"
                  className="h-8 cursor-pointer rounded-md px-2 text-xs text-[var(--status-over)] hover:bg-[var(--row-hover)]"
                  onClick={removeLink}
                >
                  Remove link
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLinkOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={submitLink}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
      {lightbox ? (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          attachmentId={lightbox.attachmentId}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
});

function ToolbarButton({
  label,
  active,
  onClick,
  children,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--border)]/60 hover:text-[var(--text)]",
        active && "bg-[var(--border)]/80 text-[var(--text)]",
        className,
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function RichNotesHtml({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const [displayHtml, setDisplayHtml] = useState(() =>
    prepareRichNotesDisplayHtml(html),
  );
  const [lightbox, setLightbox] = useState<ImageLightboxTarget | null>(null);

  useEffect(() => {
    const prepared = prepareRichNotesDisplayHtml(html);
    if (!prepared) {
      setDisplayHtml("");
      return;
    }
    const ids = extractAttachmentIdsFromNotesHtml(prepared);
    if (ids.length === 0) {
      setDisplayHtml(prepared);
      return;
    }

    // Paint placeholders immediately — never flash expired/broken signed URLs.
    setDisplayHtml(prepared);

    let cancelled = false;
    void (async () => {
      const resolved = await Promise.all(
        ids.map(async (id) => {
          const url = await resolveAttachmentDisplayUrl(id);
          return [id, url] as const;
        }),
      );
      if (cancelled) return;

      let next = prepared;
      for (const [id, url] of resolved) {
        if (!url) continue;
        const safeUrl = url.replace(/"/g, "&quot;");
        const re = new RegExp(
          `<img\\b([^>]*\\bdata-attachment-id=["']${id}["'][^>]*)>`,
          "gi",
        );
        next = next.replace(re, (_match, attrs: string) => {
          let nextAttrs = attrs
            .replace(/\s*src=["'][^"']*["']/i, "")
            .replace(/\s*class=["'][^"']*rich-notes-img-pending[^"']*["']/i, "")
            .replace(/\s*class=["']\s*["']/i, "");
          nextAttrs = `${nextAttrs} src="${safeUrl}"`.replace(/\s+/g, " ");
          return `<img${nextAttrs}>`;
        });
        const linkRe = new RegExp(
          `(<a[^>]*data-attachment-id=["']${id}["'][^>]*href=["'])[^"']*(["'])`,
          "gi",
        );
        next = next.replace(linkRe, `$1${safeUrl}$2`);
      }
      setDisplayHtml((prev) => (prev === next ? prev : next));
    })();

    return () => {
      cancelled = true;
    };
  }, [html]);

  if (!displayHtml) return null;
  return (
    <>
      <span
        className={cn(
          "rich-notes block leading-relaxed [&_a]:pointer-events-auto",
          "[&_img]:my-2 [&_img]:max-h-80 [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-md",
          "[&_img.rich-notes-img-pending]:cursor-default [&_img.rich-notes-img-pending]:min-h-32 [&_img.rich-notes-img-pending]:w-full [&_img.rich-notes-img-pending]:max-w-md [&_img.rich-notes-img-pending]:animate-pulse [&_img.rich-notes-img-pending]:object-cover [&_img.rich-notes-img-pending]:bg-[color-mix(in_srgb,var(--text-muted)_14%,transparent)]",
          "[&_p]:m-0 [&_p+p]:mt-2",
          "[&_h1]:m-0 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:leading-snug",
          "[&_h2]:m-0 [&_h2]:mt-2.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:leading-snug",
          "[&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-snug",
          "[&_h1+p]:mt-2 [&_h2+p]:mt-2 [&_h3+p]:mt-2",
          "[&_p+h1]:mt-3 [&_p+h2]:mt-2.5 [&_p+h3]:mt-2",
          "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
          "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_li]:my-1 [&_li>p]:m-0",
          "[&_p+ul]:mt-3 [&_p+ol]:mt-3",
          "[&_ul+p]:mt-3 [&_ol+p]:mt-3",
          "[&_.mention]:rounded [&_.mention]:px-0.5 [&_.mention]:font-medium [&_.mention]:text-[var(--accent)]",
          "[&_code]:rounded [&_code]:bg-[var(--bg-elevated)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
          "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-[var(--bg-elevated)] [&_pre]:px-2.5 [&_pre]:py-2 [&_pre]:font-mono [&_pre]:text-[0.85em] [&_pre]:leading-relaxed",
          "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
          className,
        )}
        onClickCapture={(e) => {
          const target = imageLightboxTargetFromEvent(e.nativeEvent);
          if (!target) return;
          e.preventDefault();
          e.stopPropagation();
          setLightbox(target);
        }}
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />
      {lightbox ? (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          attachmentId={lightbox.attachmentId}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </>
  );
}

/** Soft skeleton while signed URLs resolve — avoids broken-image icons. */
const ATTACHMENT_IMG_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">` +
      `<rect width="480" height="270" rx="12" fill="#888888" fill-opacity="0.12"/>` +
      `</svg>`,
  );

function prepareRichNotesDisplayHtml(html: string): string {
  const sanitized = sanitizeNotesHtml(html);
  if (!sanitized) return "";
  if (!/data-attachment-id=/i.test(sanitized)) return sanitized;

  return sanitized.replace(
    /<img\b([^>]*\bdata-attachment-id=["'][0-9a-f-]{36}["'][^>]*)>/gi,
    (_full, attrs: string) => {
      let nextAttrs = String(attrs)
        .replace(/\s*src=["'][^"']*["']/i, "")
        .replace(/\s*class=["']([^"']*)["']/i, (_m, cls: string) => {
          const cleaned = cls
            .split(/\s+/)
            .filter((c) => c && c !== "rich-notes-img-pending")
            .join(" ");
          return cleaned ? ` class="${cleaned} rich-notes-img-pending"` : "";
        });
      if (!/\bclass=/i.test(nextAttrs)) {
        nextAttrs += ` class="rich-notes-img-pending"`;
      } else if (!/rich-notes-img-pending/.test(nextAttrs)) {
        nextAttrs = nextAttrs.replace(
          /\bclass=["']([^"']*)["']/,
          `class="$1 rich-notes-img-pending"`,
        );
      }
      nextAttrs += ` src="${ATTACHMENT_IMG_PLACEHOLDER}"`;
      return `<img${nextAttrs}>`;
    },
  );
}
