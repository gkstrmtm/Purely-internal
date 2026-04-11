import { NextResponse } from "next/server";

import { parseDisputeLetterPromptMeta, readContactAddress, readContactSignature, readContactSignatureImage } from "@/lib/creditDisputeLetters";
import { prisma } from "@/lib/db";
import { renderDisputeLetterPdfBytes } from "@/lib/disputeLetterPdf";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(_req: Request, ctx: { params: Promise<{ letterId: string }> }) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const { letterId } = await ctx.params;
  const id = String(letterId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const ownerId = session.session.user.id;

  const letter = await prisma.creditDisputeLetter.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      subject: true,
      bodyText: true,
      promptText: true,
      pdfMediaItemId: true,
      pdfGeneratedAt: true,
      contact: { select: { id: true, name: true, customVariables: true } },
      pdfMediaItem: { select: { id: true, publicToken: true } },
    },
  });

  if (!letter) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const json = await _req.json().catch(() => null);
  const force = Boolean(json && typeof json === "object" && "force" in json ? (json as { force?: unknown }).force : false);

  // If already generated, return existing URLs unless forced.
  if (!force && letter.pdfMediaItem?.id && letter.pdfMediaItem.publicToken) {
    const openUrl = `/api/public/media/item/${letter.pdfMediaItem.id}/${letter.pdfMediaItem.publicToken}`;
    return NextResponse.json({
      ok: true,
      pdf: {
        mediaItemId: letter.pdfMediaItem.id,
        openUrl,
        downloadUrl: `${openUrl}?download=1`,
        shareUrl: openUrl,
        generatedAt: letter.pdfGeneratedAt,
      },
    });
  }

  const parsedMeta = parseDisputeLetterPromptMeta(letter.promptText || "");
  const senderName = parsedMeta.consumerName || letter.contact?.name || "";
  const senderAddress = parsedMeta.consumerAddress || readContactAddress(letter.contact?.customVariables) || "";

  const pdfBytes = await renderDisputeLetterPdfBytes({
    text: letter.bodyText || "(empty)",
    meta: {
      dateIso: parsedMeta.dateIso || null,
      senderName,
      senderAddress,
      recipientName: parsedMeta.recipientName || null,
      recipientAddress: parsedMeta.recipientAddress || null,
    },
    signatureDataUrl: readContactSignatureImage(letter.contact?.customVariables) || null,
    signatureText: readContactSignature(letter.contact?.customVariables) || null,
    printedName: letter.contact?.name || "",
  });

  const safeContact = (letter.contact?.name || "contact").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  const fileName = `dispute-letter-${safeContact || "contact"}-${letter.id.slice(0, 8)}.pdf`;

  const media = await mirrorUploadToMediaLibrary({
    ownerId,
    fileName,
    mimeType: "application/pdf",
    bytes: pdfBytes,
  });

  if (!media) return NextResponse.json({ ok: false, error: "Failed to save PDF" }, { status: 500 });

  await prisma.creditDisputeLetter.updateMany({
    where: { id, ownerId },
    data: {
      pdfMediaItemId: media.id,
      pdfGeneratedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    pdf: {
      mediaItemId: media.id,
      openUrl: media.openUrl,
      downloadUrl: media.downloadUrl,
      shareUrl: media.shareUrl,
      generatedAt: new Date().toISOString(),
    },
  });
}
