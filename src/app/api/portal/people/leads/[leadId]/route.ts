import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { normalizePhoneStrict } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const leadIdSchema = z.string().trim().min(1).max(64);

const patchSchema = z
  .object({
    businessName: z.string().trim().min(1).max(200).optional(),
    email: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "" ? null : v.toLowerCase())),
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
    website: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
    contactId: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  })
  .refine(
    (v) =>
      v.businessName !== undefined ||
      v.email !== undefined ||
      v.phone !== undefined ||
      v.website !== undefined ||
      v.contactId !== undefined,
    { message: "No changes provided" },
  )
  .refine(
    (v) => {
      if (v.email === undefined || v.email === null) return true;
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email);
    },
    { message: "Invalid email" },
  )
  .refine(
    (v) => {
      if (v.phone === undefined || v.phone === null) return true;
      const res = normalizePhoneStrict(v.phone);
      return res.ok;
    },
    { message: "Invalid phone" },
  )
  .refine(
    (v) => {
      if (v.website === undefined || v.website === null) return true;
      try {
        const u = new URL(v.website);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Invalid website URL" },
  );

export async function PATCH(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const auth = await requireClientSessionForService("people", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const params = await ctx.params;
  const leadId = leadIdSchema.safeParse(params.leadId);
  if (!leadId.success) {
    return NextResponse.json({ ok: false, error: "Invalid lead id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const data: any = {};
  if (parsed.data.businessName !== undefined) data.businessName = parsed.data.businessName.trim();
  if (parsed.data.email !== undefined) data.email = parsed.data.email;
  if (parsed.data.phone !== undefined) {
    if (parsed.data.phone === null) data.phone = null;
    else {
      const p = normalizePhoneStrict(parsed.data.phone);
      data.phone = p.ok ? p.e164 : null;
    }
  }
  if (parsed.data.website !== undefined) data.website = parsed.data.website;
  if (parsed.data.contactId !== undefined) data.contactId = parsed.data.contactId;

  try {
    const updated = await prisma.portalLead.updateMany({
      where: { id: leadId.data, ownerId },
      data,
    });
    if (!updated.count) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Update failed" }, { status: 500 });
  }
}
