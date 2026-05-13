import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { normalizeCreditScope } from "@/lib/creditReports";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

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
  if (!s) return "IdentityIQ";
  return s.slice(0, 40);
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
    select: { id: true, name: true, email: true },
  });
  if (!contact) return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });

  return NextResponse.json(
    {
      ok: false,
      error: "Live provider pull needs a configured provider API key and connection. Import report JSON for this contact until that is set up.",
      boundary: {
        provider,
        creditScope,
        contactId: contact.id,
        sourceType: "PROVIDER_PULL_UNAVAILABLE",
        helperText: "A provider API key and connection are required before live pulls can run.",
      },
    },
    { status: 409 },
  );
}
