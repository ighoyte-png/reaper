import { describe, expect, it } from "vitest";
import {
  notesToEditorHtml,
  sanitizeNotesHtml,
} from "@/lib/notes-html";
import { notesHtmlAttachmentKey } from "@/lib/storage/client-upload";

describe("notes HTML quote sync", () => {
  const tipTapHtml =
    '<ul><li><p>use the same gray as the "Underutilized" circle</p></li><li><p>not displaying "In Review" Tasks</p></li></ul>';

  it("keeps literal quotes in text (TipTap-compatible)", () => {
    const sanitized = sanitizeNotesHtml(tipTapHtml);
    expect(sanitized).toContain('"Underutilized"');
    expect(sanitized).toContain('"In Review"');
    expect(sanitized).not.toContain("&quot;");
  });

  it("does not treat TipTap HTML as a different document after sanitize", () => {
    const valueKey = notesHtmlAttachmentKey(notesToEditorHtml(tipTapHtml));
    const currentKey = notesHtmlAttachmentKey(notesToEditorHtml(tipTapHtml));
    expect(valueKey).toBe(currentKey);
  });

  it("still escapes quotes inside attributes", () => {
    const html = sanitizeNotesHtml(
      `<a href='https://example.com/?q="x"'>link "text"</a>`,
    );
    expect(html).toContain("link \"text\"");
    expect(html).toMatch(/href="https:\/\/example\.com\/\?q=&quot;x&quot;"/);
  });
});
