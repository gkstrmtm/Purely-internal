import crypto from "crypto";

function extensionFromFileName(fileName: string): string {
  const raw = String(fileName || "").trim().toLowerCase();
  if (!raw) return "";
  const clean = raw.split("?")[0]?.split("#")[0] || raw;
  const idx = clean.lastIndexOf(".");
  if (idx < 0) return "";
  return clean.slice(idx + 1).trim();
}

export function inferMimeTypeFromFileName(fileName: string): string | null {
  const ext = extensionFromFileName(fileName);
  if (!ext) return null;

  switch (ext) {
    // images
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    case "bmp":
      return "image/bmp";
    case "ico":
      return "image/x-icon";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";

    // videos
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "m4v":
      return "video/x-m4v";
    case "mkv":
      return "video/x-matroska";
    case "avi":
      return "video/x-msvideo";
    case "wmv":
      return "video/x-ms-wmv";
    case "ogv":
      return "video/ogg";
    case "mpeg":
    case "mpg":
      return "video/mpeg";
    case "3gp":
      return "video/3gpp";
    case "3g2":
      return "video/3gpp2";

    // audio
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/x-m4a";

    // documents
    case "pdf":
      return "application/pdf";

    default:
      return null;
  }
}

export function normalizeMimeType(rawMimeType: unknown, fileName?: string): string {
  const raw = typeof rawMimeType === "string" ? rawMimeType.trim() : "";
  const lowered = raw.toLowerCase();

  if (lowered && lowered !== "application/octet-stream" && lowered !== "binary/octet-stream") {
    return raw.slice(0, 120);
  }

  const inferred = fileName ? inferMimeTypeFromFileName(fileName) : null;
  return String(inferred || "application/octet-stream").slice(0, 120);
}

export function isLikelyImageMimeType(rawMimeType: unknown, fileName?: string): boolean {
  const normalized = normalizeMimeType(rawMimeType, fileName);
  if (normalized.startsWith("image/")) return true;
  const inferred = fileName ? inferMimeTypeFromFileName(fileName) : null;
  return Boolean(inferred && inferred.startsWith("image/"));
}

export function normalizeNameKey(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

export function safeFilename(name: string) {
  return String(name || "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200) || "upload.bin";
}

export function newPublicToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function newTag(): string {
  // Short, copy-friendly tag: 10 chars base36.
  // Example: "m3d1a9k2qz"
  return crypto.randomBytes(8).toString("hex").slice(0, 10);
}
