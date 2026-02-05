import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { generateClientBlogDraft } from "@/lib/clientBlogAutomation";
import { consumeCredits, getCreditsState } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000).optional(),
    topic: z.string().trim().min(1).max(200).optional(),
  })
  .optional();

export async function POST(req: Request, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { postId } = await ctx.params;
  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => undefined)) as unknown;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const post = await prisma.clientBlogPost.findFirst({
    where: { id: postId, site: { ownerId } },
    select: { id: true, status: true },
  });

  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.status !== "DRAFT") {
    return NextResponse.json(
      { error: "AI generation is only available for drafts." },
      { status: 409 },
    );
  }

  const needCredits = 1;
  const consumed = await consumeCredits(ownerId, needCredits);
  if (!consumed.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "INSUFFICIENT_CREDITS",
        error: "Not enough credits to generate with AI. Top off your credits in Billing.",
        credits: consumed.state.balance,
        billingPath: "/portal/app/billing",
      },
      { status: 402 },
    );
  }

  const profile = await prisma.businessProfile.findUnique({
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
  });

  const primaryGoals = Array.isArray(profile?.primaryGoals)
    ? (profile?.primaryGoals as unknown[])
        .filter((x) => typeof x === "string")
        .map((x) => String(x))
        .slice(0, 10)
    : undefined;

  const draft = await generateClientBlogDraft({
    businessName: profile?.businessName,
    websiteUrl: profile?.websiteUrl,
    industry: profile?.industry,
    businessModel: profile?.businessModel,
    primaryGoals,
    targetCustomer: profile?.targetCustomer,
    brandVoice: profile?.brandVoice,
    topic: parsed.data?.prompt ?? parsed.data?.topic,
  });

  const state = await getCreditsState(ownerId);
  return NextResponse.json({ ok: true, draft, estimatedCredits: needCredits, creditsRemaining: state.balance });
}
