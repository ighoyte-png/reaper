"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Link as LinkIcon, Underline as UnderlineIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { notesToEditorHtml, sanitizeNotesHtml } from "@/lib/notes-html";

const extensions = [
  StarterKit.configure({
    blockquote: false,
    bulletList: false,
    code: false,
    codeBlock: false,
    heading: false,
    horizontalRule: false,
    italic: false,
    listItem: false,
    listKeymap: false,
    orderedList: false,
    strike: false,
    trailingNode: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      HTMLAttributes: {
        rel: "noopener noreferrer",
        target: "_blank",
        class: "text-[var(--accent)] underline underline-offset-2",
      },
    },
  }),
];

function normalizeLinkUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t) || /^mailto:/i.test(t)) return t;
  if (/^[a-z0-9][a-z0-9+.-]*:/i.test(t)) return null;
  return `https://${t}`;
}

export function SimpleRichTextEditor({
  value,
  onChange,
  className,
  placeholder = "Add a note…",
}: {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions,
    content: notesToEditorHtml(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "min-h-[4.5rem] px-2 py-2 text-sm text-[var(--text)] outline-none",
          "[&_p]:m-0 [&_p+p]:mt-1",
          "[&_a]:text-[var(--accent)] [&_a]:underline [&_a]:underline-offset-2",
        ),
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? "" : ed.getHTML();
      onChange(html);
    },
  });

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
      };
    },
  });

  if (!editor) return null;

  function setLink() {
    const prev = editor?.getAttributes("link").href as string | undefined;
    const raw = window.prompt("Link URL", prev ?? "https://");
    if (raw === null) return;
    const href = normalizeLinkUrl(raw);
    if (!href) {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      ?.chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href })
      .run();
  }

  return (
    <div
      className={cn(
        "mt-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]",
        className,
      )}
    >
      <div className="flex items-center gap-0.5 border-b border-[var(--border)] px-1 py-0.5">
        <ToolbarButton
          label="Bold"
          active={Boolean(toolbar?.bold)}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={Boolean(toolbar?.underline)}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={Boolean(toolbar?.link)}
          onClick={setLink}
        >
          <LinkIcon size={14} strokeWidth={2.5} />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
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
        "block [&_a]:pointer-events-auto [&_a]:text-[var(--accent)] [&_a]:underline [&_a]:underline-offset-2",
        "[&_p]:m-0 [&_p+p]:mt-1",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
