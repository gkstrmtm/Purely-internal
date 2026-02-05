"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeNewlines(s: string) {
  return s.replace(/\r\n?/g, "\n");
}

// Minimal markdown -> HTML for editor initialization.
function markdownToHtmlBasic(markdown: string): string {
  const md = normalizeNewlines(String(markdown || ""));
  const lines = md.split("\n");
  const html: string[] = [];

  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];

  const flushCode = () => {
    if (!inCode) return;
    const code = escapeHtml(codeBuf.join("\n"));
    const langClass = codeLang ? ` class=\"language-${escapeHtml(codeLang)}\"` : "";
    html.push(`<pre><code${langClass}>${code}</code></pre>`);
    inCode = false;
    codeLang = "";
    codeBuf = [];
  };

  let listMode: "ul" | "ol" | null = null;
  let olIndex = 1;
  const flushList = () => {
    if (!listMode) return;
    html.push(listMode === "ul" ? "</ul>" : "</ol>");
    listMode = null;
    olIndex = 1;
  };

  const flushParagraphIfAny = (buf: string[]) => {
    const text = buf.join(" ").trim();
    if (!text) return;
    html.push(`<p>${inlineMarkdownToHtml(text)}</p>`);
  };

  const inlineMarkdownToHtml = (text: string) => {
    let t = escapeHtml(text);

    // Images ![alt](url)
    t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
      const safeAlt = String(alt || "");
      const safeUrl = String(url || "");
      return `<img src=\"${escapeHtml(safeUrl)}\" alt=\"${escapeHtml(safeAlt)}\" />`;
    });

    // Links [text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
      const safeLabel = String(label || "");
      const safeUrl = String(url || "");
      return `<a href=\"${escapeHtml(safeUrl)}\" target=\"_blank\" rel=\"noreferrer\">${escapeHtml(safeLabel)}</a>`;
    });

    // Bold **x**
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Italic *x*
    t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");

    // Inline code `x`
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");

    return t;
  };

  let paraBuf: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine;

    // Code fences
    const fence = line.match(/^```\s*([^\s]*)\s*$/);
    if (fence) {
      if (inCode) {
        flushCode();
      } else {
        flushParagraphIfAny(paraBuf);
        paraBuf = [];
        flushList();
        inCode = true;
        codeLang = fence[1] || "";
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // Blank line
    if (!line.trim()) {
      flushParagraphIfAny(paraBuf);
      paraBuf = [];
      flushList();
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flushParagraphIfAny(paraBuf);
      paraBuf = [];
      flushList();
      const level = Math.min(3, h[1].length);
      html.push(`<h${level}>${inlineMarkdownToHtml(h[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      flushParagraphIfAny(paraBuf);
      paraBuf = [];
      flushList();
      html.push(`<blockquote><p>${inlineMarkdownToHtml(bq[1] || "")}</p></blockquote>`);
      continue;
    }

    // Unordered list
    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    if (ul) {
      flushParagraphIfAny(paraBuf);
      paraBuf = [];
      if (listMode !== "ul") {
        flushList();
        listMode = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${inlineMarkdownToHtml(ul[1])}</li>`);
      continue;
    }

    // Ordered list
    const ol = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (ol) {
      flushParagraphIfAny(paraBuf);
      paraBuf = [];
      if (listMode !== "ol") {
        flushList();
        listMode = "ol";
        olIndex = 1;
        html.push("<ol>");
      }
      olIndex += 1;
      html.push(`<li>${inlineMarkdownToHtml(ol[2])}</li>`);
      continue;
    }

    // Paragraph line
    paraBuf.push(line.trim());
  }

  flushParagraphIfAny(paraBuf);
  flushList();
  flushCode();

  return html.join("\n");
}

function textContent(node: Node): string {
  return (node.textContent ?? "").replace(/\u00A0/g, " ");
}

function htmlToMarkdownBasic(html: string): string {
  const input = String(html || "");

  const doc = new DOMParser().parseFromString(input, "text/html");

  const lines: string[] = [];

  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return textContent(node);
    }

    if (!(node instanceof HTMLElement)) return "";

    const tag = node.tagName.toLowerCase();

    if (tag === "br") return "\n";

    if (tag === "strong" || tag === "b") {
      return `**${Array.from(node.childNodes).map(inline).join("")}**`;
    }

    if (tag === "em" || tag === "i") {
      return `*${Array.from(node.childNodes).map(inline).join("")}*`;
    }

    if (tag === "code" && node.parentElement?.tagName.toLowerCase() !== "pre") {
      return `\`${Array.from(node.childNodes).map(inline).join("")}\``;
    }

    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      const label = Array.from(node.childNodes).map(inline).join("").trim() || href;
      return href ? `[${label}](${href})` : label;
    }

    if (tag === "img") {
      const src = node.getAttribute("src") || "";
      const alt = node.getAttribute("alt") || "";
      return src ? `![${alt}](${src})` : "";
    }

    return Array.from(node.childNodes).map(inline).join("");
  };

  const block = (node: Node) => {
    if (!(node instanceof HTMLElement)) {
      const t = inline(node).trim();
      if (t) lines.push(t);
      return;
    }

    const tag = node.tagName.toLowerCase();

    if (tag === "h1" || tag === "h2" || tag === "h3") {
      const level = tag === "h1" ? 1 : tag === "h2" ? 2 : 3;
      const t = inline(node).trim();
      if (t) lines.push(`${"#".repeat(level)} ${t}`, "");
      return;
    }

    if (tag === "p") {
      const t = inline(node).trim();
      if (t) lines.push(t, "");
      return;
    }

    if (tag === "blockquote") {
      const t = inline(node).trim();
      if (t) {
        const qs = normalizeNewlines(t).split("\n").map((l) => `> ${l}`);
        lines.push(...qs, "");
      }
      return;
    }

    if (tag === "ul" || tag === "ol") {
      const items = Array.from(node.children).filter((c) => c.tagName.toLowerCase() === "li");
      items.forEach((li, idx) => {
        const t = inline(li).trim();
        if (!t) return;
        lines.push(tag === "ul" ? `- ${t}` : `${idx + 1}. ${t}`);
      });
      lines.push("");
      return;
    }

    if (tag === "pre") {
      const codeEl = node.querySelector("code");
      const code = codeEl ? textContent(codeEl) : textContent(node);
      lines.push("```", normalizeNewlines(code).replace(/\n$/, ""), "```", "");
      return;
    }

    // Fallback: walk children.
    for (const child of Array.from(node.childNodes)) {
      block(child);
    }
  };

  for (const child of Array.from(doc.body.childNodes)) {
    block(child);
  }

  // Trim trailing blank lines.
  while (lines.length && !lines[lines.length - 1]?.trim()) lines.pop();

  return lines.join("\n").trim() + "\n";
}

export function RichTextMarkdownEditor({
  markdown,
  onChange,
  placeholder,
  disabled,
}: {
  markdown: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastMarkdownRef = useRef<string>(String(markdown || ""));
  const [focused, setFocused] = useState(false);

  const initialHtml = useMemo(() => markdownToHtmlBasic(markdown), [markdown]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const next = String(markdown || "");
    if (next === lastMarkdownRef.current) return;

    // Avoid clobbering while the user is typing.
    if (focused) return;

    el.innerHTML = markdownToHtmlBasic(next);
    lastMarkdownRef.current = next;
  }, [focused, markdown]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // First mount.
    el.innerHTML = initialHtml;
    lastMarkdownRef.current = String(markdown || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = (cmd: string, value?: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    try {
      document.execCommand(cmd, false, value);
    } catch {
      // ignore
    }
    // Sync markdown after command.
    const html = editorRef.current?.innerHTML ?? "";
    const nextMd = htmlToMarkdownBasic(html);
    lastMarkdownRef.current = nextMd;
    onChange(nextMd);
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
        <button type="button" className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100" onClick={() => run("undo")} disabled={disabled}>
          Undo
        </button>
        <button type="button" className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100" onClick={() => run("redo")} disabled={disabled}>
          Redo
        </button>
        <div className="mx-1 h-4 w-px bg-zinc-200" />
        <button type="button" className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100" onClick={() => run("bold")} disabled={disabled}>
          Bold
        </button>
        <button type="button" className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100" onClick={() => run("italic")} disabled={disabled}>
          Italic
        </button>
        <button type="button" className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100" onClick={() => run("formatBlock", "<h2>")} disabled={disabled}>
          H2
        </button>
        <button type="button" className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100" onClick={() => run("insertUnorderedList")} disabled={disabled}>
          • List
        </button>
        <button type="button" className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100" onClick={() => run("insertOrderedList")} disabled={disabled}>
          1. List
        </button>
        <button
          type="button"
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
          onClick={() => {
            if (disabled) return;
            const url = window.prompt("Link URL:", "https://");
            if (!url) return;
            run("createLink", url);
          }}
          disabled={disabled}
        >
          Link
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          // Final sync on blur.
          const html = editorRef.current?.innerHTML ?? "";
          const nextMd = htmlToMarkdownBasic(html);
          lastMarkdownRef.current = nextMd;
          onChange(nextMd);
        }}
        onInput={() => {
          const html = editorRef.current?.innerHTML ?? "";
          const nextMd = htmlToMarkdownBasic(html);
          lastMarkdownRef.current = nextMd;
          onChange(nextMd);
        }}
        className="min-h-[320px] px-4 py-3 text-sm leading-6 outline-none"
        data-placeholder={placeholder || "Write…"}
        style={{
          // Placeholder styling for empty contentEditable.
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          "--placeholder": placeholder || "Write…",
        }}
      />

      <style jsx>{`
        [contenteditable='true']:empty:before {
          content: attr(data-placeholder);
          color: #a1a1aa;
        }
        [contenteditable='true'] h1,
        [contenteditable='true'] h2,
        [contenteditable='true'] h3 {
          font-weight: 700;
          margin: 0.6em 0 0.3em;
        }
        [contenteditable='true'] p {
          margin: 0.4em 0;
        }
        [contenteditable='true'] ul,
        [contenteditable='true'] ol {
          padding-left: 1.25em;
          margin: 0.5em 0;
        }
        [contenteditable='true'] blockquote {
          border-left: 3px solid #e4e4e7;
          padding-left: 0.75em;
          color: #52525b;
          margin: 0.6em 0;
        }
        [contenteditable='true'] pre {
          background: #f4f4f5;
          border: 1px solid #e4e4e7;
          padding: 0.75em;
          border-radius: 0.75em;
          overflow: auto;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 0.85em;
        }
        [contenteditable='true'] code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          background: #f4f4f5;
          border: 1px solid #e4e4e7;
          padding: 0 0.25em;
          border-radius: 0.4em;
        }
        [contenteditable='true'] img {
          max-width: 100%;
          border-radius: 0.75em;
          border: 1px solid #e4e4e7;
        }
      `}</style>
    </div>
  );
}
