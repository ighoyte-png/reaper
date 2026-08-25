"use client";

import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import type { OrganizationEmoji } from "@/lib/types";
import { organizationEmojiSrc } from "@/lib/domain/organization-emojis";

export type EmojiSuggestionItem = {
  id: string;
  name: string;
  src: string;
};

function filterEmojis(
  emojis: OrganizationEmoji[],
  query: string,
  limit = 8,
): EmojiSuggestionItem[] {
  const q = query.trim().toLowerCase().replace(/^:+|:+$/g, "");
  const ranked = emojis
    .map((e) => ({
      id: e.id,
      name: e.name,
      src: organizationEmojiSrc(e),
    }))
    .filter((e) => (q ? e.name.includes(q) : true))
    .sort((a, b) => {
      if (!q) return a.name.localeCompare(b.name);
      const aStarts = a.name.startsWith(q) ? 0 : 1;
      const bStarts = b.name.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    });
  return ranked.slice(0, limit);
}

/**
 * TipTap suggestion renderers for Slack-style :emoji_name: custom emojis.
 */
export function createEmojiSuggestion(emojis: OrganizationEmoji[]) {
  return {
    char: ":" as const,
    allowSpaces: false,
    items: ({ query }: { query: string }): EmojiSuggestionItem[] =>
      filterEmojis(emojis, query, 8),
    command: ({
      editor,
      range,
      props,
    }: {
      editor: SuggestionProps["editor"];
      range: SuggestionProps["range"];
      props: EmojiSuggestionItem;
    }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "customEmoji",
            attrs: {
              name: props.name,
              src: props.src.startsWith("data:")
                ? props.src
                : `/api/emojis/${encodeURIComponent(props.name)}`,
            },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
    render: () => {
      let popup: HTMLDivElement | null = null;
      let selectedIndex = 0;
      let latest: SuggestionProps<EmojiSuggestionItem> | null = null;

      function destroy() {
        popup?.remove();
        popup = null;
      }

      function paint() {
        if (!popup || !latest) return;
        const items = latest.items;
        selectedIndex = Math.max(
          0,
          Math.min(selectedIndex, Math.max(0, items.length - 1)),
        );

        popup.replaceChildren();
        popup.className =
          "fixed z-[80] max-h-52 w-56 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] py-1 shadow-lg";

        if (items.length === 0) {
          const empty = document.createElement("div");
          empty.className = "px-3 py-2 text-xs text-[var(--text-muted)]";
          empty.textContent = "No emojis";
          popup.appendChild(empty);
        } else {
          items.forEach((item, index) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className =
              index === selectedIndex
                ? "flex w-full cursor-pointer items-center gap-2 bg-[var(--row-hover)] px-3 py-1.5 text-left text-sm text-[var(--text)]"
                : "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--row-hover)]";
            const img = document.createElement("img");
            img.src = item.src;
            img.alt = "";
            img.className = "h-5 w-5 shrink-0 object-contain";
            const label = document.createElement("span");
            label.className = "truncate font-mono text-xs";
            label.textContent = `:${item.name}:`;
            btn.appendChild(img);
            btn.appendChild(label);
            btn.addEventListener("mousedown", (e) => {
              e.preventDefault();
              latest?.command(item);
            });
            popup!.appendChild(btn);
          });
        }

        const rect = latest.clientRect?.();
        if (rect) {
          const top = rect.bottom + 6;
          const left = Math.min(
            rect.left,
            window.innerWidth - popup.offsetWidth - 8,
          );
          popup.style.top = `${Math.min(top, window.innerHeight - popup.offsetHeight - 8)}px`;
          popup.style.left = `${Math.max(8, left)}px`;
        }
      }

      return {
        onStart(props: SuggestionProps<EmojiSuggestionItem>) {
          latest = props;
          selectedIndex = 0;
          destroy();
          popup = document.createElement("div");
          document.body.appendChild(popup);
          paint();
        },
        onUpdate(props: SuggestionProps<EmojiSuggestionItem>) {
          latest = props;
          selectedIndex = 0;
          paint();
        },
        onKeyDown(props: SuggestionKeyDownProps) {
          if (!latest) return false;
          const { event } = props;
          if (event.key === "Escape") {
            destroy();
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            const len = latest.items.length;
            if (len === 0) return true;
            selectedIndex = (selectedIndex + len - 1) % len;
            paint();
            return true;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            const len = latest.items.length;
            if (len === 0) return true;
            selectedIndex = (selectedIndex + 1) % len;
            paint();
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            const item = latest.items[selectedIndex];
            if (item) {
              event.preventDefault();
              latest.command(item);
              return true;
            }
          }
          return false;
        },
        onExit() {
          destroy();
          latest = null;
        },
      };
    },
  };
}
