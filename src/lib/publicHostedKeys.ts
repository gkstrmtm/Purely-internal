export const DEFAULT_PUBLIC_KEY_LEN = 8;

export function publicKeyFromId(id: string, len: number = DEFAULT_PUBLIC_KEY_LEN): string {
  const s = String(id || "").trim();
  if (!s) return "";

  const cleanLen = Number.isFinite(len) ? Math.max(4, Math.min(24, Math.floor(len))) : DEFAULT_PUBLIC_KEY_LEN;
  if (s.length <= cleanLen) return s;
  return s.slice(-cleanLen);
}

export function hostedFunnelPath(slug: string, funnelId: string, len: number = DEFAULT_PUBLIC_KEY_LEN): string | null {
  const s = String(slug || "").trim();
  const id = String(funnelId || "").trim();
  if (!s || !id) return null;
  const k = publicKeyFromId(id, len);
  if (!k) return null;
  return `/f/${encodeURIComponent(s)}/${encodeURIComponent(k)}`;
}

export function hostedFormPath(slug: string, formId: string, len: number = DEFAULT_PUBLIC_KEY_LEN): string | null {
  const s = String(slug || "").trim();
  const id = String(formId || "").trim();
  if (!s || !id) return null;
  const k = publicKeyFromId(id, len);
  if (!k) return null;
  return `/forms/${encodeURIComponent(s)}/${encodeURIComponent(k)}`;
}
