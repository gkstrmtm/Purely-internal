import { prisma } from "@/lib/db";
import { generateTextWithImages, transcribeAudio } from "@/lib/ai";

export type BlogAutomationContextFileRef = {
  id?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  tag?: string;
  shareUrl?: string;
  previewUrl?: string;
  createdAt?: string;
};

export type BlogAutomationExtractedContext = {
  id: string;
  fileName: string;
  mimeType: string;
  tag?: string;
  sourceUrl?: string;
  extractionKind: "text" | "pdf" | "docx" | "image" | "audio" | "metadata";
  extractedText: string;
};

function normalizeString(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeContextRefs(items: unknown): BlogAutomationContextFileRef[] {
  if (!Array.isArray(items)) return [];
  const out: BlogAutomationContextFileRef[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const id = normalizeString((item as any).id, 120);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      fileName: normalizeString((item as any).fileName, 260),
      mimeType: normalizeString((item as any).mimeType, 160),
      fileSize: Number.isFinite((item as any).fileSize) ? Number((item as any).fileSize) : undefined,
      tag: normalizeString((item as any).tag, 120),
      shareUrl: normalizeString((item as any).shareUrl, 2000),
      previewUrl: normalizeString((item as any).previewUrl, 2000),
      createdAt: normalizeString((item as any).createdAt, 120),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function fileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx + 1).trim().toLowerCase() : "";
}

function isTextLike(fileName: string, mimeType: string) {
  const ext = fileExtension(fileName);
  if (mimeType.startsWith("text/")) return true;
  if (["application/json", "application/xml", "image/svg+xml"].includes(mimeType)) return true;
  return ["txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm", "yaml", "yml", "svg", "log", "rtf"].includes(ext);
}

function isPdf(fileName: string, mimeType: string) {
  return mimeType === "application/pdf" || fileExtension(fileName) === "pdf";
}

function isDocx(fileName: string, mimeType: string) {
  return mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileExtension(fileName) === "docx";
}

function isImage(fileName: string, mimeType: string) {
  return mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif", "avif"].includes(fileExtension(fileName));
}

function isAudio(fileName: string, mimeType: string) {
  return mimeType.startsWith("audio/") || ["mp3", "wav", "m4a", "aac", "ogg", "oga", "webm", "flac", "mpeg"].includes(fileExtension(fileName));
}

function cleanExtractedText(raw: string, maxChars: number) {
  const text = String(raw || "")
    .replace(/\u0000/g, " ")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, Math.max(0, maxChars)).trim();
}

function stripHtml(raw: string) {
  return String(raw || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const mod: any = await import("pdf-parse");
  const pdfParse: any = mod?.default ?? mod;
  const res = await pdfParse(bytes);
  return typeof res?.text === "string" ? String(res.text) : "";
}

async function extractDocxText(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const res = await (mammoth as any).extractRawText({ buffer: bytes });
  return typeof res?.value === "string" ? String(res.value) : "";
}

async function fetchExternalBytes(url: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target)) return null;
  const res = await fetch(target, { cache: "no-store" }).catch(() => null as any);
  if (!res?.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    bytes,
    mimeType: String(res.headers.get("content-type") || "application/octet-stream").trim() || "application/octet-stream",
  };
}

async function imageToContextText(opts: { fileName: string; mimeType: string; bytes: Buffer }): Promise<string> {
  const mimeType = normalizeString(opts.mimeType, 160) || "image/png";
  const dataUrl = `data:${mimeType};base64,${opts.bytes.toString("base64")}`;
  const out = await generateTextWithImages({
    system: "Extract visible text and concrete business-relevant details from the image. Return plain text only. Be concise, factual, and do not invent unreadable text.",
    user: `Analyze this image file named \"${normalizeString(opts.fileName, 180) || "image"}\" and extract any readable text, headings, labels, prices, bullet points, or business facts that would help write an accurate blog post.`,
    imageUrls: [dataUrl],
    temperature: 0.1,
  });
  return out;
}

async function audioToContextText(opts: { fileName: string; mimeType: string; bytes: Buffer }): Promise<string> {
  return await transcribeAudio({
    bytes: opts.bytes,
    filename: opts.fileName,
    mimeType: opts.mimeType,
  });
}

export async function extractBlogAutomationContextFiles(opts: {
  ownerId: string;
  contextFiles: unknown;
  maxFiles?: number;
  maxTotalChars?: number;
}): Promise<BlogAutomationExtractedContext[]> {
  const ownerId = normalizeString(opts.ownerId, 120);
  const refs = normalizeContextRefs(opts.contextFiles).slice(0, typeof opts.maxFiles === "number" ? Math.max(1, Math.min(12, Math.floor(opts.maxFiles))) : 8);
  if (!ownerId || !refs.length) return [];

  const rows = await (prisma as any).portalMediaItem.findMany({
    where: { ownerId, id: { in: refs.map((ref) => ref.id).filter(Boolean) } },
    select: { id: true, fileName: true, mimeType: true, fileSize: true, bytes: true, storageUrl: true, tag: true },
  });
  const byId = new Map<string, any>();
  for (const row of rows || []) byId.set(String(row.id), row);

  let remainingChars = typeof opts.maxTotalChars === "number" && Number.isFinite(opts.maxTotalChars)
    ? Math.max(2000, Math.min(24000, Math.floor(opts.maxTotalChars)))
    : 12000;

  const out: BlogAutomationExtractedContext[] = [];

  for (const ref of refs) {
    if (remainingChars <= 0) break;
    const row = byId.get(String(ref.id || ""));
    if (!row) continue;

    const fileName = normalizeString(row.fileName || ref.fileName, 260) || "Reference file";
    const mimeType = normalizeString(row.mimeType || ref.mimeType, 160) || "application/octet-stream";
    const tag = normalizeString(row.tag || ref.tag, 120) || undefined;
    const sourceUrl = normalizeString(row.storageUrl || ref.shareUrl, 2000) || undefined;
    const fileSize = Number.isFinite(row.fileSize) ? Number(row.fileSize) : Number.isFinite(ref.fileSize) ? Number(ref.fileSize) : 0;

    let bytes: Buffer | null = null;
    if (row.bytes) {
      bytes = Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes);
    } else if (sourceUrl) {
      const fetched = await fetchExternalBytes(sourceUrl);
      if (fetched?.bytes) {
        bytes = fetched.bytes;
      }
    }

    let extractionKind: BlogAutomationExtractedContext["extractionKind"] = "metadata";
    let extractedText = "";

    if (bytes && isTextLike(fileName, mimeType) && bytes.length <= 2_000_000) {
      extractionKind = "text";
      const raw = bytes.subarray(0, Math.min(bytes.length, 500_000)).toString("utf8");
      extractedText = mimeType.includes("html") || ["html", "htm", "xml", "svg"].includes(fileExtension(fileName)) ? stripHtml(raw) : raw;
    } else if (bytes && isPdf(fileName, mimeType) && (fileSize || bytes.length) <= 6_000_000) {
      extractionKind = "pdf";
      extractedText = await extractPdfText(bytes).catch(() => "");
    } else if (bytes && isDocx(fileName, mimeType) && (fileSize || bytes.length) <= 6_000_000) {
      extractionKind = "docx";
      extractedText = await extractDocxText(bytes).catch(() => "");
    } else if (bytes && isAudio(fileName, mimeType) && (fileSize || bytes.length) <= 24_000_000) {
      extractionKind = "audio";
      extractedText = await audioToContextText({ fileName, mimeType, bytes }).catch(() => "");
    } else if (bytes && isImage(fileName, mimeType) && (fileSize || bytes.length) <= 6_000_000) {
      extractionKind = "image";
      extractedText = await imageToContextText({ fileName, mimeType, bytes }).catch(() => "");
    }

    const cleaned = cleanExtractedText(extractedText, Math.min(remainingChars, 5000));
    if (!cleaned) {
      const fallback = [
        fileName ? `Filename: ${fileName}` : "",
        tag ? `Tag: ${tag}` : "",
        sourceUrl ? `Source: ${sourceUrl}` : "",
      ].filter(Boolean).join("\n");
      if (!fallback) continue;
      out.push({
        id: String(row.id),
        fileName,
        mimeType,
        ...(tag ? { tag } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
        extractionKind: "metadata",
        extractedText: cleanExtractedText(fallback, Math.min(remainingChars, 600)),
      });
      remainingChars -= Math.min(remainingChars, 600);
      continue;
    }

    out.push({
      id: String(row.id),
      fileName,
      mimeType,
      ...(tag ? { tag } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      extractionKind,
      extractedText: cleaned,
    });
    remainingChars -= cleaned.length;
  }

  return out;
}