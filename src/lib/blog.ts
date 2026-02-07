export type BlogBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "img"; alt: string; src: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export function stripDoubleAsterisks(input: string): string {
  return input.replace(/\*\*/g, "");
}

function escapeHtml(text: string) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Safe, minimal inline Markdown -> HTML for public rendering.
// Supports: **bold**, *italic*, __underline__, `code`, [label](url)
export function inlineMarkdownToHtmlSafe(text: string): string {
  let t = escapeHtml(text);

  // Links [text](url)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safeLabel = escapeHtml(String(label || ""));
    const safeUrl = escapeHtml(String(url || ""));
    if (!safeUrl) return safeLabel;
    return `<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeLabel}</a>`;
  });

  // Inline code `x`
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold **x**
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Underline __x__
  t = t.replace(/__([^_]+)__/g, "<u>$1</u>");

  // Italic *x*
  t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");

  return t;
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

export function parseBlogContent(content: string): BlogBlock[] {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: BlogBlock[] = [];

  let paragraph: string[] = [];
  let listItems: string[] | null = null;

  const flushParagraph = () => {
    const text = normalizeLine(paragraph.join(" "));
    if (text) blocks.push({ type: "p", text });
    paragraph = [];
  };

  const flushList = () => {
    if (listItems && listItems.length) blocks.push({ type: "ul", items: listItems });
    listItems = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      flushParagraph();
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushList();
      flushParagraph();
      blocks.push({ type: "h2", text: trimmed.slice(3).trim() });
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      flushParagraph();
      blocks.push({ type: "h3", text: trimmed.slice(4).trim() });
      continue;
    }

    const imgMatch = trimmed.match(/^!\[(.*?)\]\((.+?)\)\s*$/);
    if (imgMatch) {
      flushList();
      flushParagraph();
      blocks.push({ type: "img", alt: imgMatch[1].trim(), src: imgMatch[2].trim() });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      if (!listItems) listItems = [];
      listItems.push(trimmed.replace(/^[-*]\s+/, "").trim());
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushList();
  flushParagraph();

  return blocks;
}

export function formatBlogDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function buildBlogCtaText() {
  return {
    title: "Want this done for your business?",
    body: "Purely builds systems that automate blogging, publishing, and follow ups so you can stay consistent with SEO without spending hours writing every week.",
    button: "book a call",
    href: "/#demo",
  };
}
