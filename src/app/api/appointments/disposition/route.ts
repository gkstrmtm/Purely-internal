import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  appointmentId: z.string().min(1),
  outcome: z.enum(["CLOSED", "FOLLOW_UP", "LOST"]),
  notes: z.string().optional(),
  loomUrl: z.string().url().optional(),

  // Contract / close details (only used when outcome=CLOSED)
  setupFeeDollars: z.number().min(0).optional(),
  monthlyFeeDollars: z.number().min(0).optional(),
  termMonths: z.number().int().min(0).max(120).optional(),
  servicesSelected: z.array(z.string().min(1).max(80)).max(25).optional(),
  servicesOther: z.string().max(200).optional(),
  terms: z.string().max(5000).optional(),
  clientEmail: z.string().email().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "CLOSER" && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: parsed.data.appointmentId },
    include: { outcome: true },
  });
  if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "CLOSER" && appointment.closerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const setupFeeCents =
    typeof parsed.data.setupFeeDollars === "number"
      ? Math.round(parsed.data.setupFeeDollars * 100)
      : 0;
  const monthlyFeeCents =
    typeof parsed.data.monthlyFeeDollars === "number"
      ? Math.round(parsed.data.monthlyFeeDollars * 100)
      : 0;
  const termMonths = typeof parsed.data.termMonths === "number" ? parsed.data.termMonths : 0;

  const servicesSelected = parsed.data.servicesSelected ?? [];
  const servicesOther = parsed.data.servicesOther?.trim() || null;

  const servicesText =
    servicesSelected.length > 0
      ? servicesSelected.join(", ")
      : servicesOther
        ? servicesOther
        : "TBD";

  const termsText =
    parsed.data.terms?.trim() || (termMonths > 0 ? `Term: ${termMonths} months` : "TBD");

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: "COMPLETED",
          loomUrl: parsed.data.loomUrl ?? appointment.loomUrl,
        },
      });

      const outcome = await tx.appointmentOutcome.upsert({
        where: { appointmentId: appointment.id },
        update: {
          outcome: parsed.data.outcome,
          notes: parsed.data.notes,
        },
        create: {
          appointmentId: appointment.id,
          outcome: parsed.data.outcome,
          notes: parsed.data.notes,
        },
      });

      if (parsed.data.outcome === "CLOSED") {
        if (monthlyFeeCents <= 0) {
          throw new Error("Monthly fee is required when outcome is CLOSED");
        }

        const priceCents = monthlyFeeCents;
        await tx.contractDraft.upsert({
          where: { appointmentOutcomeId: outcome.id },
          update: {
            status: "DRAFT",
            priceCents,
            setupFeeCents,
            monthlyFeeCents,
            termMonths,
            servicesJson: servicesSelected.length > 0 ? servicesSelected : undefined,
            servicesOther,
            terms: termsText,
            services: servicesText,
            clientEmail: parsed.data.clientEmail ?? null,
            submittedByUserId: userId,
          },
          create: {
            appointmentOutcomeId: outcome.id,
            status: "DRAFT",
            priceCents,
            setupFeeCents,
            monthlyFeeCents,
            termMonths,
            servicesJson: servicesSelected.length > 0 ? servicesSelected : undefined,
            servicesOther,
            terms: termsText,
            services: servicesText,
            clientEmail: parsed.data.clientEmail ?? null,
            submittedByUserId: userId,
          },
        });
      } else {
        await tx.contractDraft.deleteMany({ where: { appointmentOutcomeId: outcome.id } });
      }

      return { appt, outcome };
    });

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Disposition failed";
    const status = message.includes("Monthly fee is required") ? 400 : 500;
    if (status === 500) {
      console.error("/api/appointments/disposition failed", err);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
