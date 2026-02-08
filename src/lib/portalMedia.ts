import crypto from "crypto";

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
