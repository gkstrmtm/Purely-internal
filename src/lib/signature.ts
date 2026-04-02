export function normalizeStoredSignature(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (!value) return "";

  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as { dataUrl?: unknown; text?: unknown };
      if (typeof parsed?.dataUrl === "string" && parsed.dataUrl.trim()) return parsed.dataUrl.trim();
      if (typeof parsed?.text === "string" && parsed.text.trim()) return parsed.text.trim();
    } catch {
      // ignore invalid json and fall through to the raw string
    }
  }

  return value;
}

export function isSignatureImageDataUrl(raw: unknown): raw is string {
  const value = normalizeStoredSignature(raw);
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
}

export function readSignatureImageDataUrl(raw: unknown): string {
  const value = normalizeStoredSignature(raw);
  return isSignatureImageDataUrl(value) ? value : "";
}

export function readSignatureText(raw: unknown): string {
  const value = normalizeStoredSignature(raw);
  if (!value || isSignatureImageDataUrl(value)) return "";
  return value;
}

export function describeSignatureValue(raw: unknown): string {
  const text = readSignatureText(raw);
  if (text) return text;
  return readSignatureImageDataUrl(raw) ? "Drawn signature on file" : "";
}
