import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import {
  bootstrapHostedPageDocuments,
  getDefaultHostedPagePrompt,
  parseHostedPageService,
  portalServiceKeyForHostedPageService,
} from "@/lib/hostedPageDocuments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  service: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const service = parseHostedPageService(parsed.data.service);
  if (!service) {
    return NextResponse.json({ ok: false, error: "Invalid service" }, { status: 400 });
  }

  const auth = await requireClientSessionForService(portalServiceKeyForHostedPageService(service), "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const documents = await bootstrapHostedPageDocuments(auth.session.user.id, service);
  return NextResponse.json({
    ok: true,
    service,
    generatorPrompt: getDefaultHostedPagePrompt(service),
    documents,
  });
}
