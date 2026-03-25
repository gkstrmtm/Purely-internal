import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { uploadAiReceptionistKnowledgeBaseFile } from "@/lib/portalAiReceptionistKnowledgeBaseSync.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseKnowledgeBaseFromFormValue(value: FormDataEntryValue | null): unknown {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("aiReceptionist", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
  }

  const fileName = (file.name || "document").slice(0, 200);

  const knowledgeBaseRaw = parseKnowledgeBaseFromFormValue(form.get("knowledgeBase"));

  const result = await uploadAiReceptionistKnowledgeBaseFile({
    ownerId,
    kind: "sms",
    file,
    fileName,
    knowledgeBaseRaw,
  });

  return NextResponse.json(result.json, { status: result.status });
}
