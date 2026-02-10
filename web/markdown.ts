// web/markdown.ts
// Converts Discord-flavored markdown into HTML suitable for preview rendering.
//
// We still rely on `discord-markdown` for inline markdown and fenced code block
// highlighting, but add a lightweight block parser so headers/lists render like
// modern Discord chat.

import { toHTML } from "discord-markdown";

const MARKDOWN_OPTIONS = {
  // Prevent arbitrary HTML injection in the preview.
  escapeHTML: true,
} as const;

type SegmentType = "text" | "code";
type ListKind = "ul" | "ol";

interface MarkdownSegment {
  type: SegmentType;
  lines: string[];
}

interface ParsedHeader {
  className: "dc-md-header-1" | "dc-md-header-2" | "dc-md-header-3" | "dc-md-header-sub";
  content: string;
}

interface ParsedListLine {
  level: 0 | 1;
  kind: ListKind;
  content: string;
  startNumber?: number;
}

interface ParsedListItem {
  content: string;
  nested?: ParsedList;
}

interface ParsedList {
  kind: ListKind;
  startNumber?: number;
  items: ParsedListItem[];
}

function renderInline(input: string): string {
  return toHTML(input, MARKDOWN_OPTIONS);
}

function splitIntoSegments(input: string): MarkdownSegment[] {
  const lines = input.split("\n");
  const segments: MarkdownSegment[] = [];

  let inCodeFence = false;
  let currentLines: string[] = [];

  const pushCurrent = (type: SegmentType): void => {
    if (currentLines.length === 0) return;
    segments.push({ type, lines: currentLines });
    currentLines = [];
  };

  for (const line of lines) {
    const isFence = line.startsWith("```");

    if (inCodeFence) {
      currentLines.push(line);
      if (isFence) {
        pushCurrent("code");
        inCodeFence = false;
      }
      continue;
    }

    if (isFence) {
      pushCurrent("text");
      currentLines.push(line);
      inCodeFence = true;
      continue;
    }

    currentLines.push(line);
  }

  pushCurrent(inCodeFence ? "code" : "text");

  return segments;
}

function parseHeaderLine(line: string): ParsedHeader | null {
  const subHeaderMatch = line.match(/^-#\s+(.+)$/);
  if (subHeaderMatch) {
    return {
      className: "dc-md-header-sub",
      content: subHeaderMatch[1],
    };
  }

  const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
  if (!headingMatch) return null;

  const level = headingMatch[1].length;
  const className =
    level === 1 ? "dc-md-header-1" : level === 2 ? "dc-md-header-2" : "dc-md-header-3";

  return {
    className,
    content: headingMatch[2],
  };
}

function parseListLine(line: string): ParsedListLine | null {
  const unorderedMatch = line.match(/^( {0,2})([-*+])\s+(.*)$/);
  if (unorderedMatch) {
    return {
      level: unorderedMatch[1].length >= 2 ? 1 : 0,
      kind: "ul",
      content: unorderedMatch[3],
    };
  }

  const orderedMatch = line.match(/^( {0,2})(\d+)\.\s+(.*)$/);
  if (orderedMatch) {
    return {
      level: orderedMatch[1].length >= 2 ? 1 : 0,
      kind: "ol",
      content: orderedMatch[3],
      startNumber: Number.parseInt(orderedMatch[2], 10),
    };
  }

  return null;
}

function renderList(list: ParsedList, nested = false): string {
  const tag = list.kind;
  const classes = [
    "dc-md-list",
    list.kind === "ul" ? "dc-md-list-ul" : "dc-md-list-ol",
    nested ? "dc-md-list-nested" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const startAttr =
    list.kind === "ol" && list.startNumber && list.startNumber !== 1
      ? ` start="${list.startNumber}"`
      : "";

  const items = list.items
    .map((item) => {
      const nestedHtml = item.nested ? renderList(item.nested, true) : "";
      return `<li>${renderInline(item.content)}${nestedHtml}</li>`;
    })
    .join("");

  return `<${tag} class="${classes}"${startAttr}>${items}</${tag}>`;
}

function parseListBlock(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const first = parseListLine(lines[startIndex]);
  if (!first || first.level !== 0) {
    return { html: "", nextIndex: startIndex };
  }

  const list: ParsedList = {
    kind: first.kind,
    startNumber: first.startNumber,
    items: [{ content: first.content }],
  };

  let currentItem = list.items[0];
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim().length === 0) break;

    const parsed = parseListLine(line);
    if (!parsed) break;

    if (parsed.level === 0) {
      if (parsed.kind !== list.kind) break;
      currentItem = { content: parsed.content };
      list.items.push(currentItem);
      index += 1;
      continue;
    }

    if (!currentItem.nested) {
      currentItem.nested = {
        kind: parsed.kind,
        startNumber: parsed.startNumber,
        items: [],
      };
    }

    if (parsed.kind !== currentItem.nested.kind) break;

    currentItem.nested.items.push({ content: parsed.content });
    index += 1;
  }

  return {
    html: renderList(list),
    nextIndex: index,
  };
}

function renderTextSegment(lines: string[]): string {
  const parts: string[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) return;
    parts.push(`<div class="dc-md-paragraph">${renderInline(paragraphLines.join("\n"))}</div>`);
    paragraphLines = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().length === 0) {
      flushParagraph();
      index += 1;
      continue;
    }

    const header = parseHeaderLine(line);
    if (header) {
      flushParagraph();
      parts.push(
        `<div class="dc-md-header ${header.className}">${renderInline(header.content)}</div>`,
      );
      index += 1;
      continue;
    }

    const listLine = parseListLine(line);
    if (listLine && listLine.level === 0) {
      flushParagraph();
      const { html, nextIndex } = parseListBlock(lines, index);
      parts.push(html);
      index = nextIndex;
      continue;
    }

    paragraphLines.push(line);
    index += 1;
  }

  flushParagraph();

  return parts.join("");
}

export function renderDiscordMarkdown(input: string): string {
  if (input.length === 0) return "";

  const normalized = input.replace(/\r\n?/g, "\n");
  const segments = splitIntoSegments(normalized);

  return segments
    .map((segment) => {
      if (segment.type === "code") {
        return toHTML(segment.lines.join("\n"), MARKDOWN_OPTIONS);
      }
      return renderTextSegment(segment.lines);
    })
    .join("");
}
