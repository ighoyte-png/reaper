"use client";

import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import {
  filterMentionPeople,
  type MentionPerson,
} from "@/lib/mentions";

export type MentionItem = {
  id: string;
  label: string;
};

/**
 * TipTap suggestion renderers for Slack-style @mentions.
 * Uses a fixed-position DOM flyout (no tippy dependency).
 */
export function createMentionSuggestion(people: MentionPerson[]) {
  return {
    char: "@",
    allowSpaces: false,
    items: ({ query }: { query: string }): MentionItem[] =>
      filterMentionPeople(people, query, 8).map((p) => ({
        id: p.id,
        label: p.name,
      })),
    render: () => {
      let popup: HTMLDivElement | null = null;
      let selectedIndex = 0;
      let latest: SuggestionProps<MentionItem> | null = null;

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
          empty.textContent = "No matches";
          popup.appendChild(empty);
        } else {
          items.forEach((item, index) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className =
              index === selectedIndex
                ? "flex w-full cursor-pointer items-center gap-2 bg-[var(--row-hover)] px-3 py-1.5 text-left text-sm text-[var(--text)]"
                : "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--row-hover)]";
            btn.innerHTML = `<span class="text-[var(--accent)]">@</span><span class="truncate">${escapeHtml(item.label)}</span>`;
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
        onStart(props: SuggestionProps<MentionItem>) {
          latest = props;
          selectedIndex = 0;
          destroy();
          popup = document.createElement("div");
          document.body.appendChild(popup);
          paint();
        },
        onUpdate(props: SuggestionProps<MentionItem>) {
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
