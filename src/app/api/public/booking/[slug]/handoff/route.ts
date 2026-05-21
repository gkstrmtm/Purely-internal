import { handlePublicExternalBookingHandoff } from "@/lib/externalBookingHandoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handlePublicExternalBookingHandoff(req, slug);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handlePublicExternalBookingHandoff(req, slug);
}