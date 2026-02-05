import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const [profile, blogSite] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { ownerId },
      select: {
        businessName: true,
        websiteUrl: true,
        industry: true,
        businessModel: true,
        primaryGoals: true,
        targetCustomer: true,
        brandVoice: true,
      },
    }),
    prisma.clientBlogSite.findUnique({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
      },
    }),
  ]);

  const businessProfileComplete = Boolean(profile?.businessName?.trim());
  const blogsSetupComplete = Boolean(blogSite?.id);

  return NextResponse.json({
    businessProfileComplete,
    blogsSetupComplete,
    needsOnboarding: !businessProfileComplete,
    profile,
    blogSite,
  });
}
