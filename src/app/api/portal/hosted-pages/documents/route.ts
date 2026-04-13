import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { requireClientSessionForService } from "@/lib/portalAccess";
import {
  bootstrapHostedPageDocuments,
  getDefaultHostedPagePrompt,
  listAllHostedPageDocuments,
  parseHostedPageService,
  portalServiceKeyForHostedPageService,
} from "@/lib/hostedPageDocuments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestedService = String(url.searchParams.get("service") || "").trim();
  if (requestedService.toUpperCase() === "ALL") {
    const auth = await requireClientSession(req);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: auth.status },
      );
    }

    const documents = await listAllHostedPageDocuments(auth.session.user.id);
    return NextResponse.json({
      ok: true,
      service: "ALL",
      generatorPrompt: null,
      documents,
    });
  }

  const service = parseHostedPageService(requestedService);
  if (!service) {
    return NextResponse.json({ ok: false, error: "Invalid service" }, { status: 400 });
  }

  const auth = await requireClientSessionForService(portalServiceKeyForHostedPageService(service), "view");
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
