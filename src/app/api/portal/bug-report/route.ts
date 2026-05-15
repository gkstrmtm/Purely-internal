import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import {
  FEEDBACK_CATEGORY_VALUES,
  FEEDBACK_PORTAL_VARIANT_VALUES,
  FEEDBACK_SEVERITY_VALUES,
  PORTAL_FEEDBACK_SETUP_SLUG,
  appendPortalFeedbackItem,
  buildPortalFeedbackTitle,
  normalizePortalPath,
  sanitizePortalFeedbackMeta,
  type StoredPortalFeedbackItem,
} from "@/lib/betaFeedback";
import { prisma } from "@/lib/db";
import { missingOutboundEmailConfigReason, trySendTransactionalEmail } from "@/lib/emailSender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = PORTAL_FEEDBACK_SETUP_SLUG;

const bodySchema = z
  .object({
    title: z.string().trim().max(160).optional(),
    message: z.string().trim().min(1).max(4000),
    expected: z.string().trim().max(2000).optional(),
    category: z.enum(FEEDBACK_CATEGORY_VALUES).optional(),
    severity: z.enum(FEEDBACK_SEVERITY_VALUES).optional(),
    url: z.string().trim().max(2000).optional(),
    path: z.string().trim().max(2000).optional(),
    area: z.string().trim().max(200).optional(),
    serviceSlug: z.string().trim().max(120).optional(),
    portalVariant: z.enum(FEEDBACK_PORTAL_VARIANT_VALUES).optional(),
    artifactUrl: z.string().trim().max(2000).optional(),
    meta: z.unknown().optional(),
  })
  .strict();

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
    nodeEnv: process.env.NODE_ENV ?? null,
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

  const meta = sanitizePortalFeedbackMeta(
    parsed.data.meta && typeof parsed.data.meta === "object" && !Array.isArray(parsed.data.meta)
      ? {
          ...(parsed.data.meta as Record<string, unknown>),
          nodeEnv: envInfo.nodeEnv,
        }
      : { nodeEnv: envInfo.nodeEnv },
  );

  const normalizedPath = normalizePortalPath(parsed.data.path ?? parsed.data.url);

  const report: StoredPortalFeedbackItem = {
    id: `bug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAtIso: nowIso(),
    title: parsed.data.title || buildPortalFeedbackTitle(parsed.data.message, parsed.data.area),
    message: parsed.data.message,
    ...(parsed.data.expected ? { expected: parsed.data.expected } : {}),
    category: parsed.data.category ?? "bug",
    severity: parsed.data.severity ?? "medium",
    ...(parsed.data.area ? { area: parsed.data.area } : {}),
    ...(normalizedPath ? { path: normalizedPath } : {}),
    ...(parsed.data.serviceSlug ? { serviceSlug: parsed.data.serviceSlug } : {}),
    ...(parsed.data.portalVariant ? { portalVariant: parsed.data.portalVariant } : {}),
    ...(reporterEmail ? { reporterEmail } : {}),
    ...(parsed.data.artifactUrl ? { artifactUrl: parsed.data.artifactUrl } : {}),
    buildSha: envInfo.buildSha,
    commitRef: envInfo.commitRef,
    deploymentId: envInfo.deploymentId,
    ...(meta ? { meta } : {}),
    triage: { status: "new", priority: "p2" },
  };

  // Internal notification: persist the last N owner-scoped feedback items.
  try {
    const existing = await prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      select: { dataJson: true },
    });

    const next = appendPortalFeedbackItem(existing?.dataJson ?? null, report);

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

  const subject = `Feedback: ${report.reporterEmail ?? ownerId}${report.category ? ` [${report.category}]` : ""}${report.area ? ` (${report.area})` : ""}`;
  const emailBody = [
    "New portal feedback item",
    "",
    `When: ${report.createdAtIso}`,
    `Reporter: ${report.reporterEmail ?? "(unknown)"}`,
    `OwnerId: ${ownerId}`,
    `Category: ${report.category}`,
    `Severity: ${report.severity}`,
    `Portal: ${report.portalVariant ?? ""}`,
    `Service: ${report.serviceSlug ?? ""}`,
    `Path: ${report.path ?? ""}`,
    `Area: ${report.area ?? ""}`,
    `Build: ${report.buildSha ?? ""}`,
    `Ref: ${report.commitRef ?? ""}`,
    `Deployment: ${report.deploymentId ?? ""}`,
    "",
    ...(report.expected ? ["Expected:", report.expected, ""] : []),
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

  return NextResponse.json({ ok: true, reportId: report.id, feedbackId: report.id, emailed: emailResult.ok });
}
