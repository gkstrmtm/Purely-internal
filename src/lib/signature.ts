export function normalizeStoredSignature(raw: unknown): string {
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const normalized = normalizeStoredSignature(entry);
      if (normalized) return normalized;
    }
    return "";
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const candidates = [
      record.dataUrl,
      record.text,
      record.value,
      record.answer,
      record.response,
      record.signature,
      record.signatureDataUrl,
      record.imageDataUrl,
      Array.isArray(record.values) ? record.values : undefined,
    ];
    for (const candidate of candidates) {
      const normalized = normalizeStoredSignature(candidate);
      if (normalized) return normalized;
    }
    return "";
  }

  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (!value) return "";

  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      const normalized = normalizeStoredSignature(parsed);
      if (normalized) return normalized;
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
