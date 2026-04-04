import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";
import { generateText } from "@/lib/ai";
import { normalizeDisputeLetterText, readContactAddress, readContactSignature, readContactSignatureImage } from "@/lib/creditDisputeLetters";
import { renderDisputeLetterPdfBytes } from "@/lib/disputeLetterPdf";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const createSchema = z.object({
  contactId: z.string().min(1),
  recipientName: z.string().trim().max(120).optional().nullable(),
  recipientAddress: z.string().trim().max(600).optional().nullable(),
  disputesText: z.string().trim().min(3).max(5000),
  templateLabel: z.string().trim().optional(),
  templatePrompt: z.string().trim().optional(),
  templateBodyStarter: z.string().trim().optional(),
  creditPullId: z.string().trim().optional().nullable(),
  subjectLine: z.string().trim().max(200).optional(),
  roundNumber: z.number().int().min(1).max(12).optional(),
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
    select: { id: true, name: true, email: true, phone: true, customVariables: true },
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

  const templateLabel = parsed.data.templateLabel;
  const templatePrompt = parsed.data.templatePrompt;
  const templateBodyStarter = parsed.data.templateBodyStarter;
  const roundNumber = parsed.data.roundNumber;
  const signature = readContactSignature(contact.customVariables);
  const signatureImage = readContactSignatureImage(contact.customVariables);
  const address = readContactAddress(contact.customVariables);

  const subjectFromClient = (parsed.data.subjectLine || "").trim();
  const roundLabel = roundNumber ? `Round ${roundNumber}` : "Round 1";
  const recipientLabel = recipientName || "Recipient";
  const subjectFallback = `${roundLabel} - ${contact.name} - ${recipientLabel}`.trim();
  const subject = subjectFromClient || subjectFallback;

  const system =
    "You draft consumer credit dispute letters. Output ONLY a plain-text mailed letter. " +
    "Do not invent facts. If a needed detail is missing, leave a simple blank line instead of writing placeholder text. " +
    "Never write bracket or template placeholders like [Date] or {{date}} - always output the real date provided. " +
    "Do not write the phrase 'signature on file' anywhere in the letter body. Leave a normal signature space instead. " +
    "Do not repeat the drafting metadata labels (for example 'Recipient address:' or 'Consumer address:') in the letter text. " +
    "Keep it professional, natural, and specific. " +
    "Write a fuller letter, not a stub: use a real correspondence structure with a clear opening, meaningful dispute framing, a concrete itemized section, and a firm closing request. " +
    "If this is follow-up correspondence, acknowledge prior notice naturally without using internal workflow labels. " +
    "Do not use markdown, asterisks, bullet-star formatting, or placeholder words. " +
    "Avoid generic AI filler, exaggerated threats, or cinematic legal language. " +
    "Prefer plain business wording that sounds like a real mailed consumer dispute. " +
    "Do not mention internal workflow labels such as round, stage, template, escalation, or strategy unless the consumer explicitly used those terms in the dispute facts.";

  const user = [
    `Date: ${isoDate}`,
    "",
    recipientName ? `Recipient: ${recipientName}` : "Recipient: not provided",
    recipientAddress ? `Recipient address: ${recipientAddress}` : "Recipient address: not provided",
    "",
    `Consumer/contact name: ${contact.name}`,
    address ? `Consumer address: ${address}` : "Consumer address: not provided",
    contact.email ? `Consumer email: ${contact.email}` : "Consumer email: not provided",
    contact.phone ? `Consumer phone: ${contact.phone}` : "Consumer phone: not provided",
    signature ? `Consumer signature text (optional): ${signature}` : null,
    signatureImage ? "Consumer has a drawn signature image on file (this will be placed onto the PDF automatically; do not mention it in the letter text)." : null,
    "",
    roundNumber && roundNumber > 1 ? `This is follow-up correspondence after an earlier dispute attempt.` : "This is the first dispute letter for these items.",
    templateLabel ? `Template selected: ${templateLabel}` : null,
    templatePrompt ? `Draft direction:\n${templatePrompt}` : null,
    templateBodyStarter ? `Optional sample structure:\n${templateBodyStarter}` : null,
    "",
    "Dispute context:",
    disputesText,
    "",
    creditPull?.rawJson
      ? `Credit data (JSON):\n${JSON.stringify(creditPull.rawJson).slice(0, 6000)}`
      : "Credit data: (not available yet)",
    "",
    "Write the letter now.",
    "If recipient details are missing, use a normal generic salutation and keep the missing fields blank rather than naming placeholders.",
    "If an itemized section helps clarity, use short numbered lines instead of markdown bullets.",
    "The final letter must read like normal mailed correspondence and should not expose the drafting metadata above.",
  ]
    .filter(Boolean)
    .join("\n");

  const model = (process.env.AI_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
  const bodyTextRaw = await generateText({ system, user, model });
  const bodyText = normalizeDisputeLetterText(String(bodyTextRaw || "").trim(), {
    contactName: contact.name,
    signature: signature,
    email: contact.email,
    phone: contact.phone,
    address,
    date: isoDate,
  });

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
    const pdfBytes = await renderDisputeLetterPdfBytes({
      text: created.bodyText || "(empty)",
      meta: {
        dateIso: isoDate,
        senderName: contact.name,
        senderAddress: address,
        recipientName: recipientName,
        recipientAddress: recipientAddress,
      },
      signatureDataUrl: signatureImage || null,
      printedName: contact.name,
    });
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
