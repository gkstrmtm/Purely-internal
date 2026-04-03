import crypto from "crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fingerprintDevice(ip: string, userAgent: string): string {
  return crypto.createHash("sha256").update(`${ip}|${userAgent}`).digest("hex").slice(0, 12);
}

export async function GET(_req: Request, ctx: { params: Promise<{ formId: string; submissionId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { formId, submissionId } = await ctx.params;
  const id = String(formId || "").trim();
  const sid = String(submissionId || "").trim();
  if (!id || !sid) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const form = await prisma.creditForm.findFirst({
    where: { id, ownerId: auth.session.user.id },
    select: { id: true, slug: true, name: true },
  });
  if (!form) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const submission = await prisma.creditFormSubmission.findFirst({
    where: { id: sid, formId: form.id },
    select: { id: true, createdAt: true, dataJson: true, ip: true, userAgent: true },
  });
  if (!submission) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const ip = submission.ip || null;
  const userAgent = submission.userAgent || null;
  const deviceFingerprint = ip && userAgent ? fingerprintDevice(ip, userAgent) : null;

  let otherSubmissionCount: number | null = null;
  let recentOtherSubmissions:
    | Array<{ id: string; createdAt: string; form: { id: string; slug: string; name: string } }>
    | null = null;

  if (ip && userAgent) {
    otherSubmissionCount = await prisma.creditFormSubmission.count({
      where: {
        ip,
        userAgent,
        form: { ownerId: auth.session.user.id },
      },
    });

    const recent = await prisma.creditFormSubmission.findMany({
      where: {
        ip,
        userAgent,
        form: { ownerId: auth.session.user.id },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 15,
      select: {
        id: true,
        createdAt: true,
        form: { select: { id: true, slug: true, name: true } },
      },
    });

    recentOtherSubmissions = recent.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      form: { id: s.form.id, slug: s.form.slug, name: s.form.name },
    }));
  }

  return NextResponse.json({
    ok: true,
    form,
    submission: {
      id: submission.id,
      createdAt: submission.createdAt.toISOString(),
      dataJson: submission.dataJson,
      ip,
      userAgent,
    },
    device: {
      fingerprint: deviceFingerprint,
      ip,
      userAgent,
      otherSubmissionCount,
      recentOtherSubmissions,
    },
  });
}
