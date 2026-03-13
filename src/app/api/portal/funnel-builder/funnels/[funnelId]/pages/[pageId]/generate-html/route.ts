import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { generateText, generateTextWithImages } from "@/lib/ai";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function clampText(s: string, maxLen: number) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "\n<!-- truncated -->";
}

function extractHtml(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  const fenced = text.match(/```html\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const anyFence = text.match(/```\s*([\s\S]*?)\s*```/);
  if (anyFence?.[1]) return anyFence[1].trim();

  return text;
}

function extractJson(raw: string): unknown {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ? fenced[1].trim() : "";
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function extractAiQuestion(raw: string): string | null {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const q = typeof (parsed as any).question === "string" ? String((parsed as any).question).trim() : "";
  if (!q) return null;
  return q.slice(0, 800);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

type AiAttachment = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

function coerceAttachments(raw: unknown): AiAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: AiAttachment[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const url = typeof (it as any).url === "string" ? (it as any).url.trim() : "";
    if (!url) continue;
    const fileName = typeof (it as any).fileName === "string" ? (it as any).fileName.trim() : undefined;
    const mimeType = typeof (it as any).mimeType === "string" ? (it as any).mimeType.trim() : undefined;
    out.push({ url, fileName, mimeType });
    if (out.length >= 12) break;
  }
  return out;
}

function toAbsoluteUrl(req: Request, url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const origin = new URL(req.url).origin;
  return new URL(u, origin).toString();
}

function coerceContextKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    out.push(s.slice(0, 80));
    if (out.length >= 30) break;
  }
  return out;
}

export async function POST(req: Request, ctx: { params: Promise<{ funnelId: string; pageId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const basePath = auth.variant === "credit" ? "/credit" : "/portal";

  const { funnelId: funnelIdRaw, pageId: pageIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  const pageId = String(pageIdRaw || "").trim();
  if (!funnelId || !pageId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ ok: false, error: "Prompt is required" }, { status: 400 });

  const currentHtmlFromClient = typeof body?.currentHtml === "string" ? body.currentHtml : null;
  const attachments = coerceAttachments(body?.attachments);
  const contextKeys = coerceContextKeys(body?.contextKeys);

  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: {
      id: true,
      slug: true,
      title: true,
      customChatJson: true,
      customHtml: true,
      funnel: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const ownerId = auth.session.user.id;
  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");

  const forms = await prisma.creditForm.findMany({
    where: { ownerId: auth.session.user.id },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
    select: { slug: true, name: true, status: true },
  });

  const baseSystem = [
    "You generate a single self-contained HTML document for a marketing funnel page for the user's business.",
    "If the request is ambiguous or missing key details, ask ONE concise follow-up question instead of guessing.",
    "Return EITHER:",
    "- A single ```html fenced block containing the full HTML document, OR",
    "- A single ```json fenced block: { \"question\": \"...\" }",
    "Do NOT output anything else.",
    "Constraints:",
    "- Use plain HTML + inline <style>. No external JS/CSS, no frameworks.",
    "- Mobile-first, modern, clean styling.",
    `- Use relative links that keep the user inside ${basePath}.`,
    "Integration:",
    `- This page will be hosted at: ${basePath}/f/${page.funnel.slug}`,
    `- Hosted forms are at: ${basePath}/forms/{formSlug}`,
    `- Form submissions happen via POST /api/public${basePath}/forms/{formSlug}/submit (handled by our hosted form pages)`,
    `- If you need a form, link to ${basePath}/forms/{formSlug} with a clear CTA button.`,
    "Rules:",
    "- Do not invent form slugs. Only reference a form if the user explicitly asks to embed/link a form, or if they clearly asked for a lead-capture form.",
    "- If the user asks for a shop/store but provides no product info, ask what they sell (and how many products).",
    "Available forms (slug: name [status]):",
    ...forms.map((f) => `- ${f.slug}: ${f.name} [${f.status}]`),
    "Output rules:",
    "- Include <meta name=\"viewport\"> and a <title>.",
    "- Avoid placeholder braces like {{var}} unless asked.",
  ];

  const effectiveCurrentHtml =
    (currentHtmlFromClient && currentHtmlFromClient.trim() ? currentHtmlFromClient : page.customHtml || "").trim();
  const hasCurrentHtml = Boolean(effectiveCurrentHtml);

  const system = [
    ...baseSystem,
    hasCurrentHtml
      ? "Editing mode: You will be given CURRENT_HTML. Apply the user's instruction as a minimal change to CURRENT_HTML. Return the FULL updated HTML document."
      : "Generation mode: Create a new HTML document from the user's instruction.",
  ].join("\n");

  const prevChat = Array.isArray(page.customChatJson) ? (page.customChatJson as any[]) : [];
  const attachmentsBlock = attachments.length
    ? [
        "",
        "ATTACHMENTS:",
        ...attachments.map((a) => {
          const name = a.fileName ? ` ${a.fileName}` : "";
          const mime = a.mimeType ? ` (${a.mimeType})` : "";
          const url = toAbsoluteUrl(req, a.url);
          return `- ${name}${mime}: ${url}`.trim();
        }),
        "",
      ].join("\n")
    : "";

  const contextBlock = contextKeys.length
    ? [
        "",
        "SELECTED_CONTEXT (use these elements if relevant):",
        ...contextKeys.map((k) => `- ${k}`),
        "",
      ].join("\n")
    : "";
  const userMsg = { role: "user", content: `${prompt}${attachmentsBlock}`, at: new Date().toISOString() };

  let html = "";
  let question: string | null = null;
  try {
    const currentHtmlBlock = hasCurrentHtml
      ? [
          "CURRENT_HTML:",
          "```html",
          clampText(effectiveCurrentHtml, 24000),
          "```",
          "",
        ].join("\n")
      : "";

    const imageUrls = attachments
      .filter((a) => String(a.mimeType || "").toLowerCase().startsWith("image/"))
      .map((a) => toAbsoluteUrl(req, a.url))
      .filter(Boolean)
      .slice(0, 6);

    const userText = [
      businessContext ? businessContext : "",
      `Funnel: ${page.funnel.name} (slug: ${page.funnel.slug})`,
      `Page: ${page.title} (slug: ${page.slug})`,
      "",
      currentHtmlBlock,
      prompt,
      contextBlock,
      attachmentsBlock,
    ].join("\n");

    const aiRaw = imageUrls.length
      ? await generateTextWithImages({ system, user: userText, imageUrls })
      : await generateText({ system, user: userText });

    question = extractAiQuestion(aiRaw);
    if (!question) {
      html = extractHtml(aiRaw);
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as any)?.message ? String((e as any).message) : "AI generation failed" },
      { status: 500 },
    );
  }

  if (question) {
    const assistantMsg = { role: "assistant", content: question, at: new Date().toISOString() };
    const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

    const updated = await prisma.creditFunnelPage.update({
      where: { id: page.id },
      data: {
        editorMode: "CUSTOM_HTML",
        customChatJson: nextChat,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        editorMode: true,
        customHtml: true,
        customChatJson: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, question, page: updated });
  }

  if (!html) return NextResponse.json({ ok: false, error: "AI returned empty HTML" }, { status: 502 });

  if (!/<!doctype\s+html|<html\b/i.test(html)) {
    html = [
      "<!doctype html>",
      "<html>",
      "<head>",
      "  <meta charset=\"utf-8\" />",
      "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
      "  <title>AI Output</title>",
      "  <style>body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; padding:24px} pre{white-space:pre-wrap; word-break:break-word}</style>",
      "</head>",
      "<body>",
      `  <pre>${escapeHtml(html)}</pre>`,
      "</body>",
      "</html>",
    ].join("\n");
  }

  const assistantMsg = {
    role: "assistant",
    content: "OK — I updated your page. Check the preview and tell me what you want changed.",
    at: new Date().toISOString(),
  };
  const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

  const updated = await prisma.creditFunnelPage.update({
    where: { id: page.id },
    data: {
      editorMode: "CUSTOM_HTML",
      customHtml: html,
      customChatJson: nextChat,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      editorMode: true,
      customHtml: true,
      customChatJson: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, html: updated.customHtml, page: updated });
}
