import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";
import { generateCreditText } from "@/lib/creditAi";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";
import { renderTextToPdfBytes } from "@/lib/simplePdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const createSchema = z.object({
  contactId: z.string().min(1),
  recipientName: z.string().trim().max(120).optional().nullable(),
  recipientAddress: z.string().trim().max(600).optional().nullable(),
  disputesText: z.string().trim().min(3).max(5000),
  creditPullId: z.string().trim().optional().nullable(),
});

export async function GET(req: Request) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const url = new URL(req.url);
  const contactId = (url.searchParams.get("contactId") || "").trim();

  const letters = await prisma.creditDisputeLetter.findMany({
    where: {
      ownerId: session.session.user.id,
      ...(contactId ? { contactId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      id: true,
      status: true,
      subject: true,
      createdAt: true,
      updatedAt: true,
      generatedAt: true,
      pdfMediaItemId: true,
      pdfGeneratedAt: true,
      sentAt: true,
      lastSentTo: true,
      contactId: true,
      creditPullId: true,
      contact: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  return NextResponse.json({ ok: true, letters });
}

export async function POST(req: Request) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const ownerId = session.session.user.id;
  const { contactId, disputesText } = parsed.data;

  const contact = await prisma.portalContact.findFirst({
    where: { id: contactId, ownerId },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!contact) return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });

  const creditPullId = parsed.data.creditPullId ? String(parsed.data.creditPullId).trim() : "";
  const creditPull = creditPullId
    ? await prisma.creditPull
        .findFirst({ where: { id: creditPullId, ownerId, contactId }, select: { id: true, status: true, rawJson: true } })
        .catch(() => null)
    : null;

  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);

  const recipientName = (parsed.data.recipientName || "").trim();
  const recipientAddress = (parsed.data.recipientAddress || "").trim();

  const system =
    "You draft consumer credit dispute letters. Output ONLY a plain-text letter. " +
    "Do not invent facts. If a needed detail is missing, include a placeholder in double braces like {{placeholder}}. " +
    "Keep it professional and concise.";

  const user = [
    `Date: ${isoDate}`,
    "",
    recipientName ? `Recipient: ${recipientName}` : "Recipient: {{credit bureau / creditor name}}",
    recipientAddress ? `Recipient address: ${recipientAddress}` : "Recipient address: {{recipient address}}",
    "",
    `Consumer/contact name: ${contact.name}`,
    contact.email ? `Consumer email: ${contact.email}` : "Consumer email: {{email}}",
    contact.phone ? `Consumer phone: ${contact.phone}` : "Consumer phone: {{phone}}",
    "",
    "Dispute context:",
    disputesText,
    "",
    creditPull?.rawJson
      ? `Credit data (JSON):\n${JSON.stringify(creditPull.rawJson).slice(0, 6000)}`
      : "Credit data: (not available yet)",
    "",
    "Write the letter now.",
  ].join("\n");

  const model = (process.env.CREDIT_AI_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
  const bodyTextRaw = await generateCreditText({ system, user, model });
  const bodyText = String(bodyTextRaw || "").trim();

  const subject = "Credit Report Dispute Letter";

  const created = await prisma.creditDisputeLetter.create({
    data: {
      ownerId,
      contactId,
      creditPullId: creditPull?.id || null,
      status: "GENERATED",
      subject,
      bodyText: bodyText || "(empty)",
      promptText: user,
      model,
      generatedAt: new Date(),
      updatedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      subject: true,
      bodyText: true,
      createdAt: true,
      updatedAt: true,
      generatedAt: true,
      pdfMediaItemId: true,
      pdfGeneratedAt: true,
      sentAt: true,
      lastSentTo: true,
      contact: { select: { id: true, name: true, email: true, phone: true } },
      creditPullId: true,
    },
  });

  // Auto-export PDF into Media Library.
  let pdf: null | { mediaItemId: string; openUrl: string; downloadUrl: string; shareUrl: string } = null;
  try {
    const pdfBytes = renderTextToPdfBytes({ title: created.subject || "Dispute Letter", text: created.bodyText || "(empty)" });
    const safeContact = (created.contact?.name || "contact").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    const fileName = `dispute-letter-${safeContact || "contact"}-${created.id.slice(0, 8)}.pdf`;
    const media = await mirrorUploadToMediaLibrary({ ownerId, fileName, mimeType: "application/pdf", bytes: pdfBytes });
    if (media) {
      await prisma.creditDisputeLetter.updateMany({
        where: { id: created.id, ownerId },
        data: { pdfMediaItemId: media.id, pdfGeneratedAt: new Date(), updatedAt: new Date() },
      });
      pdf = { mediaItemId: media.id, openUrl: media.openUrl, downloadUrl: media.downloadUrl, shareUrl: media.shareUrl };
    }
  } catch {
    // Best-effort: PDF export should not block letter generation.
  }

  return NextResponse.json({ ok: true, letter: created, pdf });
}
