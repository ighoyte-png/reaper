/** Strip tags / collapse whitespace for empty checks and plain fallbacks. */
export function notesPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/(?:ul|ol|pre)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function notesHasContent(html: string | null | undefined): boolean {
  if (!html) return false;
  if (/data-attachment-id=["'][0-9a-f-]{36}["']/i.test(html)) return true;
  if (/data-pending-id=["'][0-9a-f-]{36}["']/i.test(html)) return true;
  return Boolean(notesPlainText(html));
}

/** Drop unsaved paste/drop previews (blob URLs) before persisting drafts. */
export function stripPendingInlineImages(html: string): string {
  if (!html || !/data-pending-id=/i.test(html)) return html;
  return html.replace(
    /<img\b[^>]*\bdata-pending-id=(["'])[^"']*\1[^>]*\/?>/gi,
    "",
  );
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
  // Text body: only markup-significant chars. TipTap leaves `"` as a literal,
  // so encoding quotes here would make controlled-editor sync think content changed.
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeText(text).replace(/"/g, "&quot;");
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
  if (
    /<\/?(?:p|strong|b|u|a|br|span|ul|ol|li|h1|h2|h3|img|code|pre)\b/i.test(trimmed)
  ) {
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
  "IMG",
  "SPAN",
  "UL",
  "OL",
  "LI",
  "CODE",
  "PRE",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAttachmentUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

function sanitizeAttachmentSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  const t = src.trim();
  if (!t) return null;
  if (/^(data:|blob:)/i.test(t)) return null;
  if (/^https?:\/\//i.test(t) || /^\/(?!\/)/.test(t)) return t;
  return null;
}

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
        return `<span data-type="mention" data-id="${escapeAttr(id)}" data-label="${escapeAttr(label)}" class="mention">@${escapeText(label.replace(/^@/, ""))}</span>`;
      }
      if (tag === "A") {
        const attachmentId = node.attrs?.["data-attachment-id"];
        if (attachmentId && isAttachmentUuid(attachmentId)) {
          const href =
            sanitizeHref(node.attrs?.href ?? null) ||
            `/api/storage/${attachmentId}/url`;
          const target = node.attrs?.target === "_self" ? "_self" : "_blank";
          const rel = target === "_blank" ? ' rel="noopener noreferrer"' : "";
          return `<a href="${escapeAttr(href)}" data-attachment-id="${escapeAttr(attachmentId)}" target="${target}"${rel} class="rich-notes-link">${inner}</a>`;
        }
        const href = sanitizeHref(node.attrs?.href ?? null);
        if (!href) return inner;
        const target = node.attrs?.target === "_self" ? "_self" : "_blank";
        const rel = target === "_blank" ? ' rel="noopener noreferrer"' : "";
        return `<a href="${escapeAttr(href)}" target="${target}"${rel} class="rich-notes-link">${inner}</a>`;
      }
      if (tag === "IMG") {
        const attachmentId = node.attrs?.["data-attachment-id"];
        if (!isAttachmentUuid(attachmentId)) return "";
        const safeSrc = sanitizeAttachmentSrc(node.attrs?.src ?? null);
        const alt = escapeAttr(node.attrs?.alt ?? "");
        const srcAttr = safeSrc ? ` src="${escapeAttr(safeSrc)}"` : "";
        return `<img data-attachment-id="${escapeAttr(attachmentId!)}"${srcAttr} alt="${alt}" />`;
      }
      if (tag === "UL") return `<ul>${inner}</ul>`;
      if (tag === "OL") return `<ol>${inner}</ol>`;
      if (tag === "LI") return `<li>${inner}</li>`;
      if (tag === "B" || tag === "STRONG") return `<strong>${inner}</strong>`;
      if (tag === "U") return `<u>${inner}</u>`;
      if (tag === "CODE") return `<code>${inner}</code>`;
      if (tag === "PRE") return `<pre>${inner}</pre>`;
      if (tag === "H1" || tag === "H2" || tag === "H3") {
        return `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`;
      }
      return `<p>${inner}</p>`;
    })
    .join("");
}

/** Collect attachment UUIDs referenced in sanitized note HTML. */
export function extractAttachmentIdsFromNotesHtml(html: string): string[] {
  const ids = new Set<string>();
  const re = /data-attachment-id=["']([0-9a-f-]{36})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1]!.toLowerCase();
    if (isAttachmentUuid(id)) ids.add(id);
  }
  return [...ids];
}

/** Allow only safe note markup — isomorphic (browser + server). Never fail open. */
export function sanitizeNotesHtml(html: string): string {
  if (!notesHasContent(html)) return "";
  return renderNodes(tokenizeHtml(html));
}
