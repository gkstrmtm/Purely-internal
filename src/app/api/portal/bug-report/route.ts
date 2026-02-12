import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { missingOutboundEmailConfigReason, trySendTransactionalEmail } from "@/lib/emailSender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "bug-reports";
const MAX_REPORTS = 200;

const bodySchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    url: z.string().trim().max(2000).optional(),
    area: z.string().trim().max(200).optional(),
    meta: z.unknown().optional(),
  })
  .strict();

type StoredBugReport = {
  id: string;
  createdAtIso: string;
  message: string;
  url?: string;
  area?: string;
  reporterEmail?: string;
  buildSha?: string | null;
  commitRef?: string | null;
  deploymentId?: string | null;
  meta?: Record<string, unknown>;
};

type StoredPayload = {
  version: 1;
  reports: StoredBugReport[];
};

function parsePayload(raw: unknown): StoredPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { version: 1, reports: [] };
  const rec = raw as Record<string, unknown>;
  const reports = Array.isArray(rec.reports) ? (rec.reports as unknown[]).flatMap((r) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) return [] as StoredBugReport[];
    const rr = r as Record<string, unknown>;
    const id = typeof rr.id === "string" ? rr.id : "";
    const createdAtIso = typeof rr.createdAtIso === "string" ? rr.createdAtIso : "";
    const message = typeof rr.message === "string" ? rr.message : "";
    if (!id || !createdAtIso || !message) return [] as StoredBugReport[];
    const out: StoredBugReport = {
      id,
      createdAtIso,
      message: message.slice(0, 4000),
    };
    if (typeof rr.url === "string" && rr.url.trim()) out.url = rr.url.trim().slice(0, 2000);
    if (typeof rr.area === "string" && rr.area.trim()) out.area = rr.area.trim().slice(0, 200);
    if (typeof rr.reporterEmail === "string" && rr.reporterEmail.trim()) out.reporterEmail = rr.reporterEmail.trim().slice(0, 200);
    if (typeof rr.buildSha === "string" || rr.buildSha === null) out.buildSha = rr.buildSha as any;
    if (typeof rr.commitRef === "string" || rr.commitRef === null) out.commitRef = rr.commitRef as any;
    if (typeof rr.deploymentId === "string" || rr.deploymentId === null) out.deploymentId = rr.deploymentId as any;
    if (rr.meta && typeof rr.meta === "object" && !Array.isArray(rr.meta)) out.meta = rr.meta as any;
    return [out];
  }) : [];

  return { version: 1, reports: reports.slice(0, MAX_REPORTS) };
}

function nowIso() {
  return new Date().toISOString();
}

function buildEnvInfo() {
  return {
    buildSha:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
      null,
    commitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  };
}

async function sendBugReportEmail(opts: {
  to: string[];
  subject: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; skipped: true; reason: string } | { ok: false; skipped?: false; reason: string }> {
  const recipients = opts.to.filter(Boolean);
  if (!recipients.length) {
    return { ok: false, skipped: true, reason: "Missing bug report recipients" };
  }

  try {
    const r = await trySendTransactionalEmail({
      to: recipients,
      subject: opts.subject,
      text: opts.body.slice(0, 20000),
      fromName: "Purely Automation",
    });

    if (r.ok) return { ok: true };
    if (r.skipped) return { ok: false, skipped: true, reason: missingOutboundEmailConfigReason() };
    return { ok: false, reason: r.reason };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? "Email send failed" };
  }
}

function recipientsFromEnv(): string[] {
  const raw = process.env.BUG_REPORT_TO_EMAIL ?? process.env.MANAGER_DASHBOARD_EMAIL ?? "purestayservice@gmail.com";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const reporterEmail = auth.session.user.email;
  const envInfo = buildEnvInfo();

  const meta =
    parsed.data.meta && typeof parsed.data.meta === "object" && !Array.isArray(parsed.data.meta)
      ? (parsed.data.meta as Record<string, unknown>)
      : undefined;

  const report: StoredBugReport = {
    id: `bug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAtIso: nowIso(),
    message: parsed.data.message,
    ...(parsed.data.url ? { url: parsed.data.url } : {}),
    ...(parsed.data.area ? { area: parsed.data.area } : {}),
    ...(reporterEmail ? { reporterEmail } : {}),
    ...envInfo,
    ...(meta ? { meta } : {}),
  };

  // Internal notification: persist the last N bug reports for this owner.
  try {
    const existing = await prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      select: { dataJson: true },
    });

    const prev = parsePayload(existing?.dataJson ?? null);
    const next: StoredPayload = { version: 1, reports: [report, ...prev.reports].slice(0, MAX_REPORTS) };

    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: next as any },
      update: { status: "COMPLETE", dataJson: next as any },
      select: { id: true },
    });
  } catch (err) {
    console.error("/api/portal/bug-report: persist failed", err);
    // Do not fail the request if persistence fails.
  }

  const subject = `Bug report: ${report.reporterEmail ?? ownerId}${report.area ? ` (${report.area})` : ""}`;
  const emailBody = [
    "New portal bug report",
    "",
    `When: ${report.createdAtIso}`,
    `Reporter: ${report.reporterEmail ?? "(unknown)"}`,
    `OwnerId: ${ownerId}`,
    `URL: ${report.url ?? ""}`,
    `Area: ${report.area ?? ""}`,
    `Build: ${report.buildSha ?? ""}`,
    `Ref: ${report.commitRef ?? ""}`,
    `Deployment: ${report.deploymentId ?? ""}`,
    "",
    "Message:",
    report.message,
    "",
    "Meta:",
    JSON.stringify(report.meta ?? {}, null, 2),
  ].join("\n");

  const emailResult = await sendBugReportEmail({
    to: recipientsFromEnv(),
    subject,
    body: emailBody,
  });

  if (!emailResult.ok) {
    console.error("/api/portal/bug-report: email failed", emailResult);
  }

  return NextResponse.json({ ok: true, reportId: report.id, emailed: emailResult.ok });
}
