import crypto from "crypto";

import { prisma } from "@/lib/db";

const MAX_PUBLIC_FORM_REQUEST_BYTES = 256 * 1024;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_SUBMISSIONS = 5;
const RECENT_SUBMISSION_LOOKBACK_MS = Math.max(DUPLICATE_WINDOW_MS, RATE_LIMIT_WINDOW_MS);

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
}

function payloadFingerprint(payload: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function sameClientIdentity(opts: { ip: string | null; userAgent: string | null }, row: { ip: string | null; userAgent: string | null }): boolean {
  const ip = String(opts.ip || "").trim();
  const rowIp = String(row.ip || "").trim();
  if (ip && rowIp) return ip === rowIp;

  const userAgent = String(opts.userAgent || "").trim();
  const rowUserAgent = String(row.userAgent || "").trim();
  if (userAgent && rowUserAgent) return userAgent === rowUserAgent;

  return false;
}

export function isPublicFormRequestTooLarge(request: Request, rawText?: string): boolean {
  const contentLength = Number(request.headers.get("content-length") || "");
  if (Number.isFinite(contentLength) && contentLength > MAX_PUBLIC_FORM_REQUEST_BYTES) return true;
  if (typeof rawText === "string" && Buffer.byteLength(rawText, "utf8") > MAX_PUBLIC_FORM_REQUEST_BYTES) return true;
  return false;
}

export async function guardPublicFormSubmission(opts: {
  formId: string;
  ip: string | null;
  userAgent: string | null;
  normalizedPayload: unknown;
}): Promise<{ ok: true } | { ok: false; status: 409 | 429; error: string }> {
  const since = new Date(Date.now() - RECENT_SUBMISSION_LOOKBACK_MS);
  const recent = await prisma.creditFormSubmission.findMany({
    where: {
      formId: opts.formId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      ip: true,
      userAgent: true,
      dataJson: true,
    },
  });

  const sameClient = recent.filter((row) => sameClientIdentity(opts, row));
  const nowMs = Date.now();
  const rateHits = sameClient.filter((row) => nowMs - row.createdAt.getTime() <= RATE_LIMIT_WINDOW_MS);
  if (rateHits.length >= RATE_LIMIT_MAX_SUBMISSIONS) {
    return {
      ok: false,
      status: 429,
      error: "Too many form submissions. Please try again shortly.",
    };
  }

  const fingerprint = payloadFingerprint(opts.normalizedPayload);
  const duplicate = sameClient.find((row) => {
    if (nowMs - row.createdAt.getTime() > DUPLICATE_WINDOW_MS) return false;
    return payloadFingerprint(row.dataJson) === fingerprint;
  });

  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error: "Duplicate submission detected.",
    };
  }

  return { ok: true };
}