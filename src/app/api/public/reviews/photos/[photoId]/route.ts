import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params;
  const id = String(photoId || "").trim();
  if (!id) return new NextResponse("Not found", { status: 404 });

  try {
    const photo = await prisma.portalReviewPhoto.findUnique({
      where: { id },
      select: { bytes: true, contentType: true, review: { select: { archivedAt: true } } },
    });

    if (!photo || photo.review?.archivedAt) return new NextResponse("Not found", { status: 404 });

    return new NextResponse(photo.bytes, {
      headers: {
        "Content-Type": photo.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
