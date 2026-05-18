import { NextResponse } from "next/server";
import { z } from "zod";

import { PORTAL_FEEDBACK_SETUP_SLUG, parsePortalFeedbackPayload } from "@/lib/betaFeedback";
import { requirePlatformAdminSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  ownerId: z.string().trim().min(1).max(64),
  format: z.enum(["json", "csv"]).optional(),
});

function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const auth = await requirePlatformAdminSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid query" }, { status: 400 });
  }

  const format = parsed.data.format ?? "json";
  const existing = await prisma.portalServiceSetup.findUnique({
    where: {
      ownerId_serviceSlug: {
        ownerId: parsed.data.ownerId,
        serviceSlug: PORTAL_FEEDBACK_SETUP_SLUG,
      },
    },
    select: { dataJson: true },
  });

  const items = parsePortalFeedbackPayload(existing?.dataJson ?? null).items;
  const exportedAtIso = new Date().toISOString();

  if (format === "csv") {
    const headers = [
      "id",
      "createdAtIso",
      "updatedAtIso",
      "category",
      "severity",
      "title",
      "message",
      "expected",
      "area",
      "path",
      "serviceSlug",
      "portalVariant",
      "reporterEmail",
      "artifactUrl",
      "triageStatus",
      "triagePriority",
      "backlogRef",
      "promptRef",
      "exportBucket",
      "reviewerEmail",
      "lastReviewedAtIso",
      "notes",
    ];
    const lines = [headers.join(",")];
    for (const item of items) {
      lines.push(
        [
          item.id,
          item.createdAtIso,
          item.updatedAtIso ?? "",
          item.category,
          item.severity,
          item.title,
          item.message,
          item.expected ?? "",
          item.area ?? "",
          item.path ?? "",
          item.serviceSlug ?? "",
          item.portalVariant ?? "",
          item.reporterEmail ?? "",
          item.artifactUrl ?? "",
          item.triage.status,
          item.triage.priority,
          item.triage.backlogRef ?? "",
          item.triage.promptRef ?? "",
          item.triage.exportBucket ?? "",
          item.triage.reviewerEmail ?? "",
          item.triage.lastReviewedAtIso ?? "",
          item.triage.notes ?? "",
        ]
          .map((value) => escapeCsv(value))
          .join(","),
      );
    }

    return new NextResponse(lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="portal-beta-feedback-${parsed.data.ownerId}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  return new NextResponse(
    JSON.stringify({ ok: true, ownerId: parsed.data.ownerId, exportedAtIso, count: items.length, items }, null, 2),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="portal-beta-feedback-${parsed.data.ownerId}.json"`,
        "cache-control": "no-store",
      },
    },
  );
}