/** Strip tags / collapse whitespace for empty checks and plain fallbacks. */
export function notesPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/(?:ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function notesHasContent(html: string | null | undefined): boolean {
  return Boolean(html && notesPlainText(html));
}

/** Plain-text preview truncated to a word budget (for tooltips). */
export function notesPreviewText(
  html: string,
  maxWords = 100,
): string {
  const plain = notesPlainText(html);
  if (!plain) return "";
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return plain;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Decode common HTML entities in text nodes. Loops so double-encoded
 * values like `&amp;nbsp;` become a real non-breaking space.
 */
function decodeHtmlEntities(text: string): string {
  let cur = text;
  for (let pass = 0; pass < 4; pass++) {
    const next = cur
      .replace(/&amp;/gi, "&")
      .replace(/&nbsp;/gi, "\u00A0")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => {
        const code = parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      })
      .replace(/&#(\d+);/g, (match, dec: string) => {
        const code = Number(dec);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      });
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

/** Coerce legacy plain-text notes into TipTap-friendly HTML. */
export function notesToEditorHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/<\/?(?:p|strong|b|u|a|br|span|ul|ol|li|h1|h2|h3)\b/i.test(trimmed)) {
    // Re-sanitize so double-encoded entities (&amp;nbsp;) are normalized
    // before TipTap parses the document.
    return sanitizeNotesHtml(trimmed) || trimmed;
  }
  return trimmed
    .split(/\n/)
    .map((line) => `<p>${escapeText(line) || "<br>"}</p>`)
    .join("");
}

const ALLOWED_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "BR",
  "STRONG",
  "B",
  "U",
  "A",
  "SPAN",
  "UL",
  "OL",
  "LI",
]);

function sanitizeHref(href: string | null): string | null {
  if (!href) return null;
  const t = href.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t) || /^mailto:/i.test(t)) return t;
  if (/^\/(?!\/)/.test(t)) return t;
  if (/^[a-z0-9][a-z0-9+.-]*:/i.test(t)) return null;
  return `https://${t}`;
}

type WalkNode = {
  type: "text" | "element";
  text?: string;
  tag?: string;
  attrs?: Record<string, string | null>;
  children?: WalkNode[];
};

/** Minimal HTML tokenizer that works in browser and Node (no DOMParser). */
function tokenizeHtml(html: string): WalkNode[] {
  const root: WalkNode[] = [];
  const stack: { tag: string; node: WalkNode; children: WalkNode[] }[] = [];
  let i = 0;
  const push = (node: WalkNode) => {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else root.push(node);
  };

  while (i < html.length) {
    if (html[i] === "<") {
      const close = html.indexOf(">", i);
      if (close < 0) break;
      const raw = html.slice(i + 1, close).trim();
      i = close + 1;
      if (!raw) continue;
      if (raw.startsWith("!--")) continue;
      if (raw.startsWith("/")) {
        const tag = raw.slice(1).trim().toUpperCase();
        while (stack.length) {
          const top = stack.pop()!;
          const el: WalkNode = {
            type: "element",
            tag: top.tag,
            attrs: top.node.attrs,
            children: top.children,
          };
          push(el);
          if (top.tag === tag) break;
        }
        continue;
      }
      const selfClosing = raw.endsWith("/");
      const body = selfClosing ? raw.slice(0, -1).trim() : raw;
      const parts = body.match(/^([a-zA-Z0-9]+)([\s\S]*)$/);
      if (!parts) continue;
      const tag = parts[1].toUpperCase();
      const attrSrc = parts[2] ?? "";
      const attrs: Record<string, string | null> = {};
      const attrRe =
        /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let m: RegExpExecArray | null;
      while ((m = attrRe.exec(attrSrc))) {
        attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
      }
      if (tag === "BR" || selfClosing) {
        push({ type: "element", tag, attrs, children: [] });
        continue;
      }
      stack.push({
        tag,
        node: { type: "element", tag, attrs },
        children: [],
      });
      continue;
    }
    const next = html.indexOf("<", i);
    const text = next < 0 ? html.slice(i) : html.slice(i, next);
    i = next < 0 ? html.length : next;
    if (text) push({ type: "text", text });
  }
  while (stack.length) {
    const top = stack.pop()!;
    push({
      type: "element",
      tag: top.tag,
      attrs: top.node.attrs,
      children: top.children,
    });
  }
  return root;
}

function renderNodes(nodes: WalkNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        // Decode first so existing entities aren't double-escaped (&nbsp; → &amp;nbsp;).
        return escapeText(decodeHtmlEntities(node.text ?? ""));
      }
      const tag = (node.tag ?? "").toUpperCase();
      const inner = renderNodes(node.children ?? []);
      if (!ALLOWED_TAGS.has(tag)) return inner;
      if (tag === "BR") return "<br>";
      if (tag === "SPAN") {
        if (node.attrs?.["data-type"] !== "mention") return inner;
        const id = node.attrs?.["data-id"];
        const label = node.attrs?.["data-label"] ?? inner;
        if (!id) return escapeText(label);
        return `<span data-type="mention" data-id="${escapeText(id)}" data-label="${escapeText(label)}" class="mention">@${escapeText(label.replace(/^@/, ""))}</span>`;
      }
      if (tag === "A") {
        const href = sanitizeHref(node.attrs?.href ?? null);
        if (!href) return inner;
        const target = node.attrs?.target === "_self" ? "_self" : "_blank";
        const rel = target === "_blank" ? ' rel="noopener noreferrer"' : "";
        return `<a href="${escapeText(href)}" target="${target}"${rel} class="rich-notes-link">${inner}</a>`;
      }
      if (tag === "UL") return `<ul>${inner}</ul>`;
      if (tag === "OL") return `<ol>${inner}</ol>`;
      if (tag === "LI") return `<li>${inner}</li>`;
      if (tag === "B" || tag === "STRONG") return `<strong>${inner}</strong>`;
      if (tag === "U") return `<u>${inner}</u>`;
      if (tag === "H1" || tag === "H2" || tag === "H3") {
        return `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`;
      }
      return `<p>${inner}</p>`;
    })
    .join("");
}

/** Allow only safe note markup — isomorphic (browser + server). Never fail open. */
export function sanitizeNotesHtml(html: string): string {
  if (!notesHasContent(html)) return "";
  return renderNodes(tokenizeHtml(html));
}
