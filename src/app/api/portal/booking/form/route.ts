import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getBookingFormConfig, setBookingFormConfig } from "@/lib/bookingForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const putSchema = z.object({
  thankYouMessage: z.string().max(500).optional(),
  phone: z
    .object({
      enabled: z.boolean().optional(),
      required: z.boolean().optional(),
    })
    .optional(),
  notes: z
    .object({
      enabled: z.boolean().optional(),
      required: z.boolean().optional(),
    })
    .optional(),
  questions: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(50),
        label: z.string().trim().min(1).max(120),
        required: z.boolean().optional(),
        kind: z.enum(["short", "long", "single_choice", "multiple_choice"]).optional(),
        options: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
      }),
    )
    .max(20)
    .optional(),
});

export async function GET() {
  const auth = await requireClientSessionForService("booking");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const config = await getBookingFormConfig(ownerId);

  return NextResponse.json({ ok: true, config });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("booking");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const current = await getBookingFormConfig(ownerId);

  const next = {
    ...current,
    thankYouMessage: parsed.data.thankYouMessage ?? current.thankYouMessage,
    phone: {
      enabled: parsed.data.phone?.enabled ?? current.phone.enabled,
      required: parsed.data.phone?.required ?? current.phone.required,
    },
    notes: {
      enabled: parsed.data.notes?.enabled ?? current.notes.enabled,
      required: parsed.data.notes?.required ?? current.notes.required,
    },
    questions:
      parsed.data.questions?.map((q) => ({
        id: q.id,
        label: q.label,
        required: Boolean(q.required),
        kind: (q.kind ?? "short") as any,
        options: q.options,
      })) ?? current.questions,
  } as const;

  // If a field is disabled, it cannot be required.
  const normalized = {
    ...next,
    phone: { ...next.phone, required: next.phone.enabled ? next.phone.required : false },
    notes: { ...next.notes, required: next.notes.enabled ? next.notes.required : false },
  };

  const saved = await setBookingFormConfig(ownerId, normalized);
  return NextResponse.json({ ok: true, config: saved });
}
