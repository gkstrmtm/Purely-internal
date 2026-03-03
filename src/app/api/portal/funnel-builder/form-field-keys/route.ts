import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseFormFields(schemaJson: unknown): Array<{ key: string; label: string }> {
  if (!schemaJson || typeof schemaJson !== "object") return [];
  const rawFields = (schemaJson as any).fields;
  if (!Array.isArray(rawFields)) return [];

  const out: Array<{ key: string; label: string }> = [];
  for (const f of rawFields) {
    if (!f || typeof f !== "object") continue;
    const key = typeof (f as any).name === "string" ? String((f as any).name).trim() : "";
    const label = typeof (f as any).label === "string" ? String((f as any).label).trim() : "";
    if (!key || !label) continue;
    out.push({ key, label });
  }

  return out;
}

export async function GET() {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const forms = await prisma.creditForm.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, name: true, schemaJson: true },
    take: 200,
  });

  const seen = new Set<string>();
  const fields: Array<{ key: string; label: string; formId: string; formSlug: string; formName: string }> = [];

  for (const form of forms) {
    const formFields = parseFormFields(form.schemaJson);
    for (const f of formFields) {
      const key = f.key;
      if (seen.has(key)) continue;
      seen.add(key);
      fields.push({
        key,
        label: f.label,
        formId: form.id,
        formSlug: form.slug,
        formName: form.name,
      });
    }
  }

  fields.sort((a, b) => {
    const al = (a.label || a.key).toLowerCase();
    const bl = (b.label || b.key).toLowerCase();
    if (al < bl) return -1;
    if (al > bl) return 1;
    return a.key.localeCompare(b.key);
  });

  return NextResponse.json({ ok: true, fields });
}
