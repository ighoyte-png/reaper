"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Underline from "@tiptap/extension-underline";
import {
  Bold,
  Link as LinkIcon,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { notesToEditorHtml, sanitizeNotesHtml } from "@/lib/notes-html";
import type { MentionPerson } from "@/lib/mentions";
import { createMentionSuggestion } from "@/components/ui/mention-suggestion";
import { Field, Modal, inputClass } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const editorContentClass = cn(
  "min-h-[4.5rem] px-2 py-2 text-sm leading-relaxed text-[var(--text)] outline-none",
  "[&_p]:m-0 [&_p+p]:mt-2",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-1 [&_li>p]:m-0",
  "[&_p+ul]:mt-3 [&_p+ol]:mt-3",
  "[&_ul+p]:mt-3 [&_ol+p]:mt-3",
  "[&_a]:text-[var(--accent)] [&_a]:underline [&_a]:underline-offset-2",
  "[&_.mention]:rounded [&_.mention]:px-0.5 [&_.mention]:font-medium [&_.mention]:text-[var(--accent)]",
);

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
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
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
      .focus()
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
    .focus()
    .extendMarkRange("link")
    .setLink(attrs)
    .run();
}

export function SimpleRichTextEditor({
  value,
  onChange,
  className,
  placeholder = "Add a note…",
  mentionPeople,
}: {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  /** When set, typing @ opens a Slack-style mention flyout. */
  mentionPeople?: MentionPerson[];
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState<LinkDraft>({
    title: "",
    href: "https://",
    target: "_blank",
  });

  const peopleKey = (mentionPeople ?? [])
    .map((p) => p.id)
    .sort()
    .join(",");

  const extensions = useMemo(() => {
    const base = [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
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
  }, [peopleKey]);

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
      },
      onUpdate: ({ editor: ed }) => {
        const html = ed.isEmpty ? "" : ed.getHTML();
        onChange(html);
      },
    },
    [extensions],
  );

  useEffect(() => {
    if (!editor) return;
    const next = notesToEditorHtml(value);
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (next === current) return;
    if (notesToEditorHtml(current) === next) return;
    editor.commands.setContent(next || "", { emitUpdate: false });
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
    ed.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }

  return (
    <div
      className={cn(
        "mt-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] px-1 py-0.5">
        <ToolbarButton
          label="Bold"
          active={Boolean(toolbar?.bold)}
          onClick={() => ed.chain().focus().toggleBold().run()}
        >
          <Bold size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={Boolean(toolbar?.underline)}
          onClick={() => ed.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          active={Boolean(toolbar?.bulletList)}
          onClick={() => ed.chain().focus().toggleBulletList().run()}
        >
          <List size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={Boolean(toolbar?.orderedList)}
          onClick={() => ed.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={Boolean(toolbar?.link)}
          onClick={openLinkDialog}
        >
          <LinkIcon size={14} strokeWidth={2.5} />
        </ToolbarButton>
      </div>
      <EditorContent editor={ed} />
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
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
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
  const safe = sanitizeNotesHtml(html);
  if (!safe) return null;
  return (
    <span
      className={cn(
        "rich-notes block leading-relaxed [&_a]:pointer-events-auto",
        "[&_p]:m-0 [&_p+p]:mt-2",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-1 [&_li>p]:m-0",
        "[&_p+ul]:mt-3 [&_p+ol]:mt-3",
        "[&_ul+p]:mt-3 [&_ol+p]:mt-3",
        "[&_.mention]:rounded [&_.mention]:px-0.5 [&_.mention]:font-medium [&_.mention]:text-[var(--accent)]",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
