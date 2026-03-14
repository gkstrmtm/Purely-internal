import crypto from "crypto";

export type HostedAdsPlacement = "HOSTED_BLOG_PAGE" | "HOSTED_REVIEWS_PAGE";

export type HostedAdsTokenPayload = {
  v: 1;
  campaignId: string;
  ownerId: string;
  placement: HostedAdsPlacement;
  path?: string | null;
  exp: number; // unix ms
};

function base64UrlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(Buffer.from(JSON.stringify(value), "utf8"));
}

function base64UrlDecodeToString(s: string): string | null {
  const raw = String(s || "").trim();
  if (!raw) return null;
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((raw.length + 3) % 4);
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function getSecret() {
  return (
    process.env.HOSTED_ADS_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    ""
  );
}

function signPart(part: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const mac = crypto.createHmac("sha256", secret).update(part).digest();
  return base64UrlEncode(mac);
}

export function signHostedAdsToken(payload: HostedAdsTokenPayload): string | null {
  if (!payload || payload.v !== 1) return null;
  const b64 = base64UrlEncodeJson(payload);
  const sig = signPart(b64);
  if (!sig) return null;
  return `${b64}.${sig}`;
}

export function verifyHostedAdsToken(token: string): HostedAdsTokenPayload | null {
  const raw = String(token || "").trim();
  if (!raw || raw.length > 4000) return null;

  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  if (!b64 || !sig) return null;

  const expected = signPart(b64);
  if (!expected) return null;
  if (!timingSafeEqual(expected, sig)) return null;

  const decoded = base64UrlDecodeToString(b64);
  if (!decoded) return null;

  try {
    const obj = JSON.parse(decoded) as Partial<HostedAdsTokenPayload>;
    if (obj.v !== 1) return null;

    const campaignId = typeof obj.campaignId === "string" ? obj.campaignId.trim() : "";
    const ownerId = typeof obj.ownerId === "string" ? obj.ownerId.trim() : "";
    const placement = typeof obj.placement === "string" ? (obj.placement as HostedAdsPlacement) : null;
    const exp = typeof obj.exp === "number" ? obj.exp : NaN;
    const path = typeof obj.path === "string" ? obj.path.trim().slice(0, 500) : null;

    if (!campaignId || !ownerId) return null;
    if (placement !== "HOSTED_BLOG_PAGE" && placement !== "HOSTED_REVIEWS_PAGE") return null;
    if (!Number.isFinite(exp) || exp <= 0) return null;

    return { v: 1, campaignId, ownerId, placement, path, exp };
  } catch {
    return null;
  }
}
