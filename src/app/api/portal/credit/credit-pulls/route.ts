import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { configuredCreditPullProviderLabel, getConfiguredCreditPullProvider } from "@/lib/creditExperian";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const createSchema = z.object({
  contactId: z.string().min(1),
});

function creditPullProvider() {
  return getConfiguredCreditPullProvider();
}

export async function GET(req: Request) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const url = new URL(req.url);
  const contactId = (url.searchParams.get("contactId") || "").trim();

  const pulls = await prisma.creditPull.findMany({
    where: {
      ownerId: session.session.user.id,
      ...(contactId ? { contactId } : {}),
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    take: 20,
    select: {
      id: true,
      status: true,
      provider: true,
      requestedAt: true,
      completedAt: true,
      error: true,
      contactId: true,
    },
  });

  return NextResponse.json({ ok: true, pulls });
}

export async function POST(req: Request) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const ownerId = session.session.user.id;
  const contactId = parsed.data.contactId;

  const contact = await prisma.portalContact.findFirst({ where: { id: contactId, ownerId }, select: { id: true } });
  if (!contact) return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });

  const provider = creditPullProvider();

  const configured = Boolean((process.env.CREDIT_PULL_PROVIDER || "").trim()) && provider !== "STUB";

  const status = configured ? "PENDING" : "FAILED";
  const error = configured ? "" : "Credit pull provider not configured yet.";

  const rec = await prisma.creditPull.create({
    data: {
      ownerId,
      contactId,
      provider,
      status,
      ...(configured
        ? {
            rawJson: {
              provider,
              note: `${configuredCreditPullProviderLabel()} is configured. Use the report pull endpoint to run the live pull and store the report output.`,
              pulledAt: new Date().toISOString(),
            },
          }
        : {}),
      ...(error ? { error } : {}),
      requestedAt: new Date(),
      ...(configured ? {} : { completedAt: new Date() }),
      updatedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      provider: true,
      requestedAt: true,
      completedAt: true,
      error: true,
      contactId: true,
    },
  });

  return NextResponse.json({ ok: true, pull: rec });
}
