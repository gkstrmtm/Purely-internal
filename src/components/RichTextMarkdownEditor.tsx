"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { LinkUrlModal } from "@/components/LinkUrlModal";

const CONTACT_SIGNATURE_MARKDOWN = "![Contact signature](pa-signature://contact)";
const CONTACT_SIGNATURE_PREVIEW_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='520' height='120' viewBox='0 0 520 120'%3E%3Crect width='520' height='120' rx='18' fill='%23f8fafc' stroke='%23cbd5e1' stroke-width='2' stroke-dasharray='8 8'/%3E%3Cpath d='M88 74c18-19 33-30 47-30 12 0 16 7 16 16 0 18-15 30-15 30s15-6 28-23c6-9 13-20 26-20 10 0 17 6 17 16 0 22-27 31-27 31s21-6 38-24c9-9 18-18 31-18 9 0 16 5 16 14 0 15-18 27-18 27h160' fill='none' stroke='%231e293b' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ctext x='260' y='102' text-anchor='middle' font-family='Arial, sans-serif' font-size='17' font-weight='700' fill='%23475569'%3EContact signature placeholder%3C/text%3E%3C/svg%3E";

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
  const flushList = () => {
    if (!listMode) return;
    html.push(listMode === "ul" ? "</ul>" : "</ol>");
    listMode = null;
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
      if (safeUrl === "pa-signature://contact") {
        return `<img src="${CONTACT_SIGNATURE_PREVIEW_SRC}" alt="${escapeHtml(safeAlt || "Contact signature")}" data-pa-signature="contact" />`;
      }
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

    // Underline __x__
    t = t.replace(/__([^_]+)__/g, "<u>$1</u>");

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
        html.push("<ol>");
      }
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

    if (tag === "u") {
      return `__${Array.from(node.childNodes).map(inline).join("")}__`;
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
      if (node.getAttribute("data-pa-signature") === "contact") {
        return CONTACT_SIGNATURE_MARKDOWN;
      }
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

export type RichTextMarkdownEditorHandle = {
  focus: () => void;
  insertMarkdown: (markdown: string, options?: { atPoint?: { x: number; y: number } }) => void;
};

type RichTextMarkdownEditorProps = {
  markdown: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onDropMarkdown?: (dataTransfer: DataTransfer) => string | null;
};

export const RichTextMarkdownEditor = forwardRef<RichTextMarkdownEditorHandle, RichTextMarkdownEditorProps>(function RichTextMarkdownEditor({
  markdown,
  onChange,
  placeholder,
  disabled,
  onDropMarkdown,
}, ref) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastMarkdownRef = useRef<string>(String(markdown || ""));
  const [focused, setFocused] = useState(false);
  const [formats, setFormats] = useState<Array<"bold" | "italic" | "underline">>([]);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const linkRangeRef = useRef<Range | null>(null);

  const saveSelectionRange = () => {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        linkRangeRef.current = null;
        return;
      }
      linkRangeRef.current = sel.getRangeAt(0).cloneRange();
    } catch {
      linkRangeRef.current = null;
    }
  };

  const restoreSelectionRange = () => {
    const range = linkRangeRef.current;
    if (!range) return;
    try {
      editorRef.current?.focus();
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // ignore
    }
  };

  const syncFromDom = () => {
    const html = editorRef.current?.innerHTML ?? "";
    const nextMd = htmlToMarkdownBasic(html);
    lastMarkdownRef.current = nextMd;
    onChange(nextMd);
  };

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
    syncFromDom();
  };

  const moveSelectionToPoint = (x: number, y: number) => {
    try {
      const selection = window.getSelection();
      if (!selection) return;
      const doc = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      };
      let nextRange: Range | null = null;
      if (typeof doc.caretRangeFromPoint === "function") {
        nextRange = doc.caretRangeFromPoint(x, y);
      } else if (typeof doc.caretPositionFromPoint === "function") {
        const pos = doc.caretPositionFromPoint(x, y);
        if (pos?.offsetNode) {
          nextRange = document.createRange();
          nextRange.setStart(pos.offsetNode, pos.offset);
          nextRange.collapse(true);
        }
      }
      if (!nextRange) return;
      selection.removeAllRanges();
      selection.addRange(nextRange);
    } catch {
      // ignore
    }
  };

  const insertMarkdownSnippet = (snippet: string, point?: { x: number; y: number }) => {
    if (disabled) return;
    const nextSnippet = String(snippet || "");
    if (!nextSnippet.trim()) return;
    editorRef.current?.focus();
    if (point) moveSelectionToPoint(point.x, point.y);
    const html = markdownToHtmlBasic(nextSnippet);
    try {
      document.execCommand("insertHTML", false, html);
    } catch {
      const el = editorRef.current;
      if (!el) return;
      el.innerHTML = `${el.innerHTML}${html}`;
    }
    syncFromDom();
    refreshFormats();
  };

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    insertMarkdown: (snippet, options) => insertMarkdownSnippet(snippet, options?.atPoint),
  }));

  const selectImageNode = (img: HTMLImageElement) => {
    try {
      const sel = window.getSelection();
      if (!sel) return;
      const r = document.createRange();
      r.selectNode(img);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch {
      // ignore
    }
  };

  const removeSelectedOrAdjacentImage = (dir: "backward" | "forward") => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);

    // If an image is directly selected, delete it.
    if (!range.collapsed) {
      try {
        const frag = range.cloneContents();
        const hasImg = (frag as any)?.querySelector?.("img");
        if (hasImg) {
          range.deleteContents();
          syncFromDom();
          refreshFormats();
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    }

    const container = range.startContainer;
    const offset = range.startOffset;

    // If the cursor is inside a text node at the edge, check adjacent siblings.
    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent ?? "";
      const parent = container.parentNode;
      if (!parent) return false;

      if (dir === "backward" && offset === 0) {
        const prev = (container as any).previousSibling as Node | null;
        const img = prev && prev instanceof HTMLElement ? (prev.tagName.toLowerCase() === "img" ? prev : prev.querySelector?.("img")) : null;
        if (img && img instanceof HTMLImageElement) {
          img.remove();
          syncFromDom();
          refreshFormats();
          return true;
        }
      }

      if (dir === "forward" && offset === text.length) {
        const next = (container as any).nextSibling as Node | null;
        const img = next && next instanceof HTMLElement ? (next.tagName.toLowerCase() === "img" ? next : next.querySelector?.("img")) : null;
        if (img && img instanceof HTMLImageElement) {
          img.remove();
          syncFromDom();
          refreshFormats();
          return true;
        }
      }

      return false;
    }

    // If the cursor is in an element node, check the child before/after the caret.
    if (container instanceof HTMLElement) {
      const children = Array.from(container.childNodes);
      const idx = Math.max(0, Math.min(children.length, offset));
      const candidate = dir === "backward" ? children[idx - 1] : children[idx];
      if (candidate instanceof HTMLImageElement) {
        candidate.remove();
        syncFromDom();
        refreshFormats();
        return true;
      }
      if (candidate instanceof HTMLElement) {
        const img = candidate.querySelector?.("img");
        if (img && img instanceof HTMLImageElement) {
          img.remove();
          syncFromDom();
          refreshFormats();
          return true;
        }
      }
    }

    return false;
  };

  const refreshFormats = () => {
    if (disabled) return;
    try {
      const next: Array<"bold" | "italic" | "underline"> = [];
      if (document.queryCommandState("bold")) next.push("bold");
      if (document.queryCommandState("italic")) next.push("italic");
      if (document.queryCommandState("underline")) next.push("underline");
      setFormats(next);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!focused) return;
    const onSel = () => refreshFormats();
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

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

        <div className="inline-flex overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {(
            [
              { key: "bold" as const, label: "B", title: "Bold" },
              { key: "italic" as const, label: "I", title: "Italic" },
              { key: "underline" as const, label: "U", title: "Underline" },
            ]
          ).map((item, idx) => {
            const pressed = formats.includes(item.key);
            return (
              <button
                key={item.key}
                type="button"
                title={item.title}
                aria-pressed={pressed}
                disabled={disabled}
                onClick={() => {
                  const was = new Set(formats);
                  const next = new Set(formats);
                  if (next.has(item.key)) next.delete(item.key);
                  else next.add(item.key);

                  // Toggle only the changed command(s).
                  if (was.has(item.key) !== next.has(item.key)) {
                    if (item.key === "bold") run("bold");
                    if (item.key === "italic") run("italic");
                    if (item.key === "underline") run("underline");
                    refreshFormats();
                  }
                }}
                className={
                  "px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 " +
                  (idx !== 0 ? "border-l border-zinc-200 " : "") +
                  (pressed ? "bg-zinc-100 text-zinc-900" : "bg-white")
                }
              >
                <span
                  className={
                    item.key === "bold"
                      ? "font-extrabold"
                      : item.key === "italic"
                        ? "italic"
                        : item.key === "underline"
                          ? "underline"
                          : ""
                  }
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

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
            saveSelectionRange();
            setLinkModalOpen(true);
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
        onMouseDown={(e) => {
          const target = e.target as HTMLElement | null;
          if (!target) return;
          const img = target instanceof HTMLImageElement ? target : (target.closest?.("img") as HTMLImageElement | null);
          if (!img) return;
          // Selecting the image node makes Backspace/Delete reliable.
          window.requestAnimationFrame(() => selectImageNode(img));
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Backspace") {
            if (removeSelectedOrAdjacentImage("backward")) e.preventDefault();
          }
          if (e.key === "Delete") {
            if (removeSelectedOrAdjacentImage("forward")) e.preventDefault();
          }
        }}
        onFocus={() => {
          setFocused(true);
          refreshFormats();
        }}
        onBlur={() => {
          setFocused(false);
          // Final sync on blur.
          syncFromDom();
        }}
        onDrop={(event) => {
          if (disabled) return;
          const nextSnippet = onDropMarkdown?.(event.dataTransfer) || "";
          if (!nextSnippet) return;
          event.preventDefault();
          insertMarkdownSnippet(nextSnippet, { x: event.clientX, y: event.clientY });
        }}
        onInput={() => {
          syncFromDom();
          refreshFormats();
        }}
        onKeyUp={() => refreshFormats()}
        onMouseUp={() => refreshFormats()}
        className="min-h-80 px-4 py-3 text-sm leading-6 outline-none"
        data-placeholder={placeholder || "Write…"}
        style={{
          // Placeholder styling for empty contentEditable.
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          "--placeholder": placeholder || "Write…",
        }}
      />

      <LinkUrlModal
        open={linkModalOpen}
        onClose={() => {
          setLinkModalOpen(false);
          linkRangeRef.current = null;
        }}
        onSubmit={(url) => {
          if (disabled) return;
          setLinkModalOpen(false);
          queueMicrotask(() => {
            restoreSelectionRange();
            run("createLink", url);
            refreshFormats();
            linkRangeRef.current = null;
          });
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
        [contenteditable='true'] u {
          text-decoration: underline;
        }
        [contenteditable='true'] img {
          max-width: 100%;
          border-radius: 0.75em;
          border: 1px solid #e4e4e7;
          display: block;
          margin: 0.75em 0;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
});

RichTextMarkdownEditor.displayName = "RichTextMarkdownEditor";
