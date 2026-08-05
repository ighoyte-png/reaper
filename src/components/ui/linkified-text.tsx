"use client";

import type { ReactNode } from "react";
import { sanitizeExternalUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";

/** Match http(s) URLs and bare www. hosts in plain text. */
const URL_RE =
  /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function trimTrailingPunctuation(raw: string): {
  url: string;
  trailing: string;
} {
  let url = raw;
  let trailing = "";
  while (/[.,;:!?)]$/.test(url)) {
    trailing = url.slice(-1) + trailing;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

/** Split plain text into text + external link nodes (safe http/https only). */
export function linkifyPlainText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const { url, trailing } = trimTrailingPunctuation(match[0]);
    const href = sanitizeExternalUrl(url);
    if (href) {
      nodes.push(
        <a
          key={`link-${key++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="rich-notes-link"
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>,
      );
      if (trailing) nodes.push(trailing);
    } else {
      nodes.push(match[0]);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : [text];
}

export function LinkifiedText({
  text,
  className,
  as: Tag = "p",
}: {
  text: string;
  className?: string;
  as?: "p" | "div" | "span";
}) {
  return (
    <Tag className={cn("whitespace-pre-wrap break-words", className)}>
      {linkifyPlainText(text)}
    </Tag>
  );
}
