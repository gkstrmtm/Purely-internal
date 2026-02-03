import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { AppointmentMethod, CallDisposition } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (role !== "DIALER" && role !== "MANAGER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        leadId?: unknown;
        disposition?: unknown;
        contactName?: unknown;
        contactEmail?: unknown;
        contactPhone?: unknown;
        companyName?: unknown;
        method?: unknown;
        methodOther?: unknown;
        notes?: unknown;
        followUpAt?: unknown;
        createTranscript?: unknown;
      }
    | null;

  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const leadId = typeof body.leadId === "string" ? body.leadId : null;
  const disposition = typeof body.disposition === "string" ? body.disposition : null;

  const contactName = typeof body.contactName === "string" ? body.contactName : null;
  const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail : null;
  const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone : null;
  const companyName = typeof body.companyName === "string" ? body.companyName : null;

  const method = typeof body.method === "string" ? body.method : null;
  const methodOther = typeof body.methodOther === "string" ? body.methodOther : null;

  const notes = typeof body.notes === "string" ? body.notes : null;
  const followUpAtIso = typeof body.followUpAt === "string" ? body.followUpAt : null;
  const createTranscript = body.createTranscript === true;

  if (!leadId || !disposition) {
    return NextResponse.json({ error: "leadId and disposition are required" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const allowed: ReadonlyArray<CallDisposition> = [
    "NO_ANSWER",
    "LEFT_VOICEMAIL",
    "FOLLOW_UP",
    "BOOKED",
    "NOT_INTERESTED",
    "BAD_NUMBER",
  ];
  if (!allowed.includes(disposition as CallDisposition)) {
    return NextResponse.json({ error: "Invalid disposition" }, { status: 400 });
  }

  const allowedMethods: ReadonlyArray<AppointmentMethod> = [
    "PHONE",
    "ZOOM",
    "GOOGLE_MEET",
    "IN_PERSON",
    "OTHER",
  ];
  const parsedMethod = method ? (method as AppointmentMethod) : null;
  if (parsedMethod && !allowedMethods.includes(parsedMethod)) {
    return NextResponse.json({ error: "Invalid method" }, { status: 400 });
  }
  if (parsedMethod === "OTHER" && (!methodOther || methodOther.trim().length < 2)) {
    return NextResponse.json(
      { error: "methodOther is required when method is OTHER" },
      { status: 400 },
    );
  }

  const followUpAt = followUpAtIso ? new Date(followUpAtIso) : null;

  const log = await prisma.$transaction(async (tx) => {
    if (contactName || contactEmail || contactPhone) {
      await tx.lead.update({
        where: { id: leadId },
        data: {
          contactName: contactName ? contactName.trim() : undefined,
          contactEmail: contactEmail ? contactEmail.trim() : undefined,
          contactPhone: contactPhone ? contactPhone.trim() : undefined,
          source: lead.source ?? "DIALER",
        },
      });
    } else if (!lead.source) {
      await tx.lead.update({ where: { id: leadId }, data: { source: "DIALER" } });
    }

    const created = await tx.callLog.create({
      data: {
        dialerId: userId,
        leadId,
        disposition: disposition as CallDisposition,
        contactName,
        contactEmail,
        contactPhone,
        companyName,
        method: parsedMethod,
        methodOther: parsedMethod === "OTHER" ? methodOther : null,
        notes,
        followUpAt,
      },
      include: { lead: true },
    });

    if (createTranscript) {
      const doc = await tx.doc.create({
        data: {
          ownerId: userId,
          title: `Transcript – ${lead.businessName}`,
          kind: "CALL_TRANSCRIPT",
          content: "(Paste transcript here — demo)\n",
        },
      });

      return tx.callLog.update({
        where: { id: created.id },
        data: { transcriptDocId: doc.id },
        include: {
          lead: true,
          transcriptDoc: { select: { id: true, title: true, content: true, kind: true } },
          recording: true,
        },
      });
    }

    return tx.callLog.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        lead: true,
        transcriptDoc: { select: { id: true, title: true, content: true, kind: true } },
        recording: true,
      },
    });
  });

  return NextResponse.json({ callLog: log });
}
