/** Strip tags / collapse whitespace for empty checks and plain fallbacks. */
export function notesPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
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

/** Coerce legacy plain-text notes into TipTap-friendly HTML. */
export function notesToEditorHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/<\/?(?:p|strong|b|u|a|br|span)\b/i.test(trimmed)) return value;
  return trimmed
    .split(/\n/)
    .map((line) => `<p>${escapeText(line) || "<br>"}</p>`)
    .join("");
}

const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "U", "A", "SPAN"]);

function sanitizeHref(href: string | null): string | null {
  if (!href) return null;
  const t = href.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t) || /^mailto:/i.test(t)) return t;
  if (/^\/(?!\/)/.test(t)) return t;
  if (/^[a-z0-9][a-z0-9+.-]*:/i.test(t)) return null;
  return `https://${t}`;
}

/** Allow only p / br / strong / b / u / a / mention spans — for tooltips and any HTML render. */
export function sanitizeNotesHtml(html: string): string {
  if (typeof window === "undefined") {
    return notesHasContent(html) ? html : "";
  }
  const doc = new DOMParser().parseFromString(
    `<div>${html}</div>`,
    "text/html",
  );
  const root = doc.body.firstElementChild;
  if (!root) return "";

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeText(node.textContent ?? "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    const inner = Array.from(el.childNodes).map(walk).join("");

    if (!ALLOWED_TAGS.has(tag)) return inner;
    if (tag === "BR") return "<br>";
    if (tag === "SPAN") {
      if (el.getAttribute("data-type") !== "mention") return inner;
      const id = el.getAttribute("data-id");
      const label = el.getAttribute("data-label") ?? inner;
      if (!id) return escapeText(label);
      return `<span data-type="mention" data-id="${escapeText(id)}" data-label="${escapeText(label)}" class="mention">@${escapeText(label.replace(/^@/, ""))}</span>`;
    }
    if (tag === "A") {
      const href = sanitizeHref(el.getAttribute("href"));
      if (!href) return inner;
      return `<a href="${escapeText(href)}" target="_blank" rel="noopener noreferrer" class="rich-notes-link">${inner}</a>`;
    }
    if (tag === "B" || tag === "STRONG") return `<strong>${inner}</strong>`;
    if (tag === "U") return `<u>${inner}</u>`;
    return `<p>${inner}</p>`;
  }

  return Array.from(root.childNodes).map(walk).join("");
}
