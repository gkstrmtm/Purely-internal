import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { ensurePortalNurtureSchema } from "@/lib/portalNurtureSchema";
import { sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { sendEmail } from "@/lib/leadOutbound";
import { buildPortalTemplateVars } from "@/lib/portalTemplateVars";
import { renderTextTemplate } from "@/lib/textTemplate";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function checkAuth(req: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.NURTURE_CRON_SECRET;
  if (isProd && !secret) return { ok: false as const, status: 503 as const, error: "Missing NURTURE_CRON_SECRET" };
  if (!secret) return { ok: true as const, status: 200 as const };

  const url = new URL(req.url);
  const authz = req.headers.get("authorization") ?? "";
  const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : null;
  const provided = req.headers.get("x-nurture-cron-secret") ?? bearer ?? url.searchParams.get("secret");
  if (provided !== secret) return { ok: false as const, status: 401 as const, error: "Unauthorized" };

  return { ok: true as const, status: 200 as const };
}

function appendFooter(body: string, footer: string) {
  const b = String(body ?? "").trimEnd();
  const f = String(footer ?? "").trim();
  if (!f) return b;
  if (!b) return f;
  return b + "\n\n" + f;
}

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  await ensurePortalNurtureSchema();

  const now = new Date();
  const due = await prisma.portalNurtureEnrollment.findMany({
    where: {
      status: "ACTIVE",
      nextSendAt: { lte: now },
    },
    select: {
      id: true,
      ownerId: true,
      campaignId: true,
      contactId: true,
      stepIndex: true,
      nextSendAt: true,
      campaign: {
        select: { id: true, name: true, smsFooter: true, emailFooter: true, status: true },
      },
      contact: {
        select: { id: true, name: true, email: true, phone: true },
      },
    },
    orderBy: [{ nextSendAt: "asc" }, { id: "asc" }],
    take: 120,
  });

  let processed = 0;
  const errors: Array<{ enrollmentId: string; error: string }> = [];

  for (const e of due) {
    if (e.campaign.status !== "ACTIVE") {
      await prisma.portalNurtureEnrollment.update({
        where: { id: e.id },
        data: { status: "STOPPED", lastError: "Campaign is not active.", nextSendAt: null, updatedAt: now },
      });
      processed += 1;
      continue;
    }

    const steps = await prisma.portalNurtureStep.findMany({
      where: { ownerId: e.ownerId, campaignId: e.campaignId },
      select: { ord: true, kind: true, delayMinutes: true, subject: true, body: true },
      orderBy: [{ ord: "asc" }],
      take: 250,
    });

    const step = steps[e.stepIndex] ?? null;
    if (!step) {
      await prisma.portalNurtureEnrollment.update({
        where: { id: e.id },
        data: { status: "COMPLETED", nextSendAt: null, lastError: null, updatedAt: now },
      });
      processed += 1;
      continue;
    }

    const profile = await prisma.businessProfile.findUnique({ where: { ownerId: e.ownerId }, select: { businessName: true } }).catch(
      () => null,
    );

    const ownerUser = await prisma.user.findUnique({ where: { id: e.ownerId }, select: { email: true, name: true } }).catch(() => null);

    const templateVars = buildPortalTemplateVars({
      contact: {
        id: e.contact?.id ? String(e.contact.id) : null,
        name: e.contact?.name ? String(e.contact.name) : null,
        email: e.contact?.email ? String(e.contact.email) : null,
        phone: e.contact?.phone ? String(e.contact.phone) : null,
      },
      business: { name: profile?.businessName?.trim() || "Purely Automation" },
      owner: {
        name: ownerUser?.name?.trim() || null,
        email: ownerUser?.email?.trim() || null,
        phone: null,
      },
      message: { body: step.body },
    });

    try {
      if (step.kind === "SMS") {
        const to = String(e.contact?.phone ?? "").trim();
        if (!to) throw new Error("Contact has no phone number.");

        const bodyRaw = renderTextTemplate(step.body, templateVars).trim();
        const body = appendFooter(bodyRaw, e.campaign.smsFooter);

        const sendResult = await sendOwnerTwilioSms({ ownerId: e.ownerId, to, body, mediaUrls: [] });
        if (!sendResult.ok) throw new Error(String(sendResult.error || "Failed to send SMS"));
      } else {
        const to = String(e.contact?.email ?? "").trim();
        if (!to) throw new Error("Contact has no email address.");

        const subjectRaw = renderTextTemplate(String(step.subject ?? ""), templateVars).trim() || "(no subject)";
        const bodyRaw = renderTextTemplate(step.body, templateVars).trim();
        const text = appendFooter(bodyRaw, e.campaign.emailFooter) || " ";

        await sendEmail({
          to,
          subject: subjectRaw,
          text,
          fromName: profile?.businessName || "Purely Automation",
          ownerId: e.ownerId,
          attachments: [],
        });
      }

      const nextIndex = e.stepIndex + 1;
      const nextStep = steps[nextIndex] ?? null;
      const nextSendAt = nextStep ? new Date(now.getTime() + Math.max(0, Number(nextStep.delayMinutes) || 0) * 60 * 1000) : null;

      await prisma.portalNurtureEnrollment.update({
        where: { id: e.id },
        data: {
          stepIndex: nextIndex,
          lastSentAt: now,
          lastError: null,
          status: nextStep ? "ACTIVE" : "COMPLETED",
          nextSendAt,
          updatedAt: now,
        },
      });

      processed += 1;
    } catch (err: any) {
      const msg = String(err?.message || err || "Send failed").slice(0, 500);
      errors.push({ enrollmentId: e.id, error: msg });

      // Backoff a bit and keep active.
      const retryAt = new Date(now.getTime() + 15 * 60 * 1000);
      await prisma.portalNurtureEnrollment.update({
        where: { id: e.id },
        data: { lastError: msg, nextSendAt: retryAt, updatedAt: now },
      });

      processed += 1;
    }
  }

  return NextResponse.json({ ok: true, processed, errors });
}
