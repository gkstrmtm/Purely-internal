const REMOTE_FETCH_USER_AGENT = "purelyautomation/portal-media-import";

export const MAX_PORTAL_INBOX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

type PortalMediaSource = {
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  bytes?: Buffer | Uint8Array | null;
  storageUrl?: string | null;
};

function fallbackBaseUrl() {
  return String(process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.PUBLIC_WEBHOOK_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

function resolveStorageUrl(storageUrl: string, baseUrl?: string) {
  if (storageUrl.startsWith("http://") || storageUrl.startsWith("https://")) return storageUrl;
  const origin = String(baseUrl || fallbackBaseUrl()).trim().replace(/\/+$/, "");
  if (!origin) return null;
  return new URL(storageUrl, `${origin}/`).toString();
}

export async function resolvePortalMediaItemBytes(
  media: PortalMediaSource,
  opts?: { baseUrl?: string },
): Promise<
  | { ok: true; bytes: Buffer; mimeType: string; fileSize: number }
  | { ok: false; error: string; status: number }
> {
  const inlineBytes = media.bytes ? Buffer.from(media.bytes) : null;
  if (inlineBytes?.length) {
    if (inlineBytes.length > MAX_PORTAL_INBOX_ATTACHMENT_BYTES) {
      return { ok: false, error: 'Attachment is too large (max 10MB)', status: 400 };
    }
    return {
      ok: true,
      bytes: inlineBytes,
      mimeType: String(media.mimeType || "application/octet-stream").slice(0, 120),
      fileSize: inlineBytes.length,
    };
  }

  const storageUrl = String(media.storageUrl || "").trim();
  if (!storageUrl) {
    return { ok: false, error: "Media file is unavailable", status: 400 };
  }

  const target = resolveStorageUrl(storageUrl, opts?.baseUrl);
  if (!target) {
    return { ok: false, error: "Media file is stored externally but this environment can't resolve it yet.", status: 400 };
  }

  const resp = await fetch(target, {
    headers: { "user-agent": REMOTE_FETCH_USER_AGENT },
    cache: "no-store",
  }).catch(() => null);

  if (!resp || !resp.ok) {
    return { ok: false, error: "Media file did not load. Retry here or choose another file.", status: 502 };
  }

  const contentLength = Number(resp.headers.get("content-length") || 0);
  if (contentLength > MAX_PORTAL_INBOX_ATTACHMENT_BYTES) {
    return { ok: false, error: 'Attachment is too large (max 10MB)', status: 400 };
  }

  const arrayBuffer = await resp.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  if (!bytes.length) {
    return { ok: false, error: "Media file is empty", status: 400 };
  }
  if (bytes.length > MAX_PORTAL_INBOX_ATTACHMENT_BYTES) {
    return { ok: false, error: 'Attachment is too large (max 10MB)', status: 400 };
  }

  return {
    ok: true,
    bytes,
    mimeType: String(resp.headers.get("content-type") || media.mimeType || "application/octet-stream").slice(0, 120),
    fileSize: bytes.length,
  };
}