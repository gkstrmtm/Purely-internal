import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { executeExperianCreditPull, getConfiguredCreditPullProvider } from "@/lib/creditExperian";
import { ingestCreditReport } from "@/lib/creditReportIngest";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";
import { normalizeCreditScope } from "@/lib/creditReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  contactId: z.string().trim().min(1),
  provider: z.string().trim().max(40).optional().nullable(),
  creditScope: z.enum(["PERSONAL", "BUSINESS", "BOTH"]).optional().nullable(),
});

function normalizeProvider(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return getConfiguredCreditPullProvider() === "EXPERIAN" ? "Experian" : "IdentityIQ";
  return s.slice(0, 40);
}

function requestIpAddress(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",").map((part) => part.trim()).find(Boolean);
  const candidate = first || req.headers.get("x-real-ip") || "";
  const ipv4 = candidate.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  return ipv4 ? ipv4[0] : null;
}

export async function POST(req: Request) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const ownerId = session.session.user.id;
  const contactId = parsed.data.contactId;
  const provider = normalizeProvider(parsed.data.provider);
  const creditScope = normalizeCreditScope(parsed.data.creditScope);

  const contact = await prisma.portalContact.findFirst({
    where: { id: contactId, ownerId },
    select: { id: true, name: true, email: true, phone: true, customVariables: true },
  });
  if (!contact) return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });

  const pull = await prisma.creditPull.create({
    data: {
      ownerId,
      contactId,
      provider,
      status: "PENDING",
      requestedAt: new Date(),
      rawJson: {
        provider,
        creditScope,
        requestedAt: new Date().toISOString(),
      } as any,
    },
    select: {
      id: true,
    },
  });

  try {
    if (provider.trim().toLowerCase() !== "experian") {
      throw Object.assign(new Error("Only the Experian pull flow is wired right now. Select Experian as the provider."), { status: 400 });
    }

    const experian = await executeExperianCreditPull({
      contact,
      creditScope,
      ipAddress: requestIpAddress(req),
    });

    const report = await ingestCreditReport({
      ownerId,
      contactId,
      provider: experian.provider,
      creditScope,
      rawJson: experian.rawJson,
    });

    await prisma.creditPull.update({
      where: { id: pull.id },
      data: {
        status: "SUCCESS",
        completedAt: new Date(),
        rawJson: experian.summary as any,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500;
    const message = error instanceof Error ? error.message : "Unable to pull report";

    await prisma.creditPull.update({
      where: { id: pull.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        error: message,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
