export type BlogBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export function stripDoubleAsterisks(input: string): string {
  return input.replace(/\*\*/g, "");
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

export function parseBlogContent(content: string): BlogBlock[] {
  const lines = stripDoubleAsterisks(content).replace(/\r\n/g, "\n").split("\n");
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
