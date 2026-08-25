import { Extension, mergeAttributes, Node } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import type { OrganizationEmoji } from "@/lib/types";
import { createEmojiSuggestion } from "@/components/ui/emoji-suggestion";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    customEmoji: {
      setCustomEmoji: (attrs: {
        name: string;
        src?: string | null;
      }) => ReturnType;
    };
  }
}

export const CustomEmoji = Node.create({
  name: "customEmoji",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-name"),
        renderHTML: (attributes) => {
          if (!attributes.name) return {};
          return { "data-name": attributes.name };
        },
      },
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("src"),
        renderHTML: (attributes) => {
          const name = attributes.name as string | null;
          const src =
            (attributes.src as string | null) ||
            (name ? `/api/emojis/${encodeURIComponent(name)}` : null);
          if (!src) return {};
          return { src };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-type="custom-emoji"]',
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const name = el.getAttribute("data-name");
          if (!name || !/^[a-z0-9_]{2,32}$/.test(name)) return false;
          return {
            name,
            src:
              el.getAttribute("src") ||
              `/api/emojis/${encodeURIComponent(name)}`,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const name = String(node.attrs.name ?? "");
    const src =
      String(node.attrs.src ?? "") ||
      (name ? `/api/emojis/${encodeURIComponent(name)}` : "");
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes ?? {}, HTMLAttributes, {
        "data-type": "custom-emoji",
        "data-name": name,
        src,
        alt: name ? `:${name}:` : "",
        class: "custom-emoji",
        draggable: "false",
      }),
    ];
  },

  renderText({ node }) {
    const name = node.attrs.name;
    return name ? `:${name}:` : "";
  },

  addCommands() {
    return {
      setCustomEmoji:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              name: attrs.name,
              src:
                attrs.src ||
                `/api/emojis/${encodeURIComponent(attrs.name)}`,
            },
          }),
    };
  },
});

const CustomEmojiSuggestionPluginKey = new PluginKey("customEmojiSuggestion");

/** `:` suggestion that inserts {@link CustomEmoji} nodes. */
export const CustomEmojiSuggestion = Extension.create<{
  emojis: OrganizationEmoji[];
}>({
  name: "customEmojiSuggestion",

  addOptions() {
    return {
      emojis: [],
    };
  },

  addProseMirrorPlugins() {
    const built = createEmojiSuggestion(this.options.emojis);
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: CustomEmojiSuggestionPluginKey,
        char: built.char,
        allowSpaces: built.allowSpaces,
        items: built.items,
        command: ({ editor, range, props }) => {
          built.command({ editor, range, props });
        },
        render: built.render,
      }),
    ];
  },
});
