import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function toErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

const bodySchema = z
  .object({
    force: z.boolean().optional(),
    fullEmail: z.string().email().optional(),
  })
  .optional();

function defaultDemoFullEmail() {
  const envDemoFull = (process.env.DEMO_PORTAL_FULL_EMAIL ?? "").trim().toLowerCase();
  return envDemoFull || "demo-full@purelyautomation.dev";
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "MANAGER" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers: { "cache-control": "no-store" } });
    }

    const force = parsed.data?.force === true;
    const fullEmail = (parsed.data?.fullEmail ?? defaultDemoFullEmail()).toLowerCase().trim();

    // Only allow targeting the demo-full account.
    const allowed = new Set(["demo-full@purelyautomation.dev", defaultDemoFullEmail()].filter(Boolean));
    if (!allowed.has(fullEmail)) {
      return NextResponse.json(
        {
          error: "Forbidden",
          details: "This endpoint only seeds the demo-full account.",
        },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: fullEmail },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        {
          error: "Demo full account not found",
          details: `No user exists for ${fullEmail}. Create the demo account once, then you can reseed calls without resetting passwords.`,
        },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    const serviceSlug = "ai-receptionist";
    const existing = await prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug } },
      select: { dataJson: true },
    });

    const rec = existing?.dataJson && typeof existing.dataJson === "object" && !Array.isArray(existing.dataJson)
      ? (existing.dataJson as Record<string, any>)
      : ({ version: 1 } as Record<string, any>);

    const currentEvents = Array.isArray(rec.events) ? rec.events : [];
    const isDemoEvent = (e: any) => typeof e?.id === "string" && e.id.startsWith("demo_ai_call_");
    const hasDemo = currentEvents.some(isDemoEvent);

    const now = Date.now();
    const minutesAgoIso = (m: number) => new Date(now - m * 60 * 1000).toISOString();

    const demoEvents = [
      {
        id: "demo_ai_call_1",
        callSid: "CA_DEMO_0001",
        from: "+15555550111",
        to: "+15551230000",
        createdAtIso: minutesAgoIso(55),
        status: "COMPLETED",
        contactName: "Sarah M.",
        contactEmail: "sarah@example.com",
        contactPhone: "+15555550111",
        demoRecordingId: "1",
        recordingDurationSec: 12,
        transcript:
          "Sarah: Hi, I’m calling to ask about pricing and whether you guys do same-day installs.\n\nAI Receptionist: Absolutely. What city are you in and what kind of system are you looking for?\n\nSarah: Tampa. It’s a replacement — my AC is struggling.\n\nAI Receptionist: Got it. What’s the best email to send options and next steps?\n\nSarah: sarah@example.com",
        notes: "Captured lead details. Requested pricing + availability.",
      },
      {
        id: "demo_ai_call_2",
        callSid: "CA_DEMO_0002",
        from: "+15555550222",
        to: "+15551230000",
        createdAtIso: minutesAgoIso(220),
        status: "COMPLETED",
        contactName: "Mike R.",
        contactPhone: "+15555550222",
        demoRecordingId: "2",
        recordingDurationSec: 12,
        transcript:
          "Mike: Hey — do you have anything open this Thursday afternoon?\n\nAI Receptionist: Yes. Can I grab your name and a good callback number?\n\nMike: Mike. This number is fine.\n\nAI Receptionist: Perfect — I’ll send available times via text shortly.",
        notes: "Scheduling question. No email provided.",
      },
      {
        id: "demo_ai_call_3",
        callSid: "CA_DEMO_0003",
        from: "+15555550333",
        to: "+15551230000",
        createdAtIso: minutesAgoIso(1440),
        status: "COMPLETED",
        contactName: "Unknown caller",
        contactPhone: "+15555550333",
        demoRecordingId: "3",
        recordingDurationSec: 12,
        transcript:
          "Caller: Hi — I’m returning a missed call.\n\nAI Receptionist: Sorry about that. What’s the best way to reach you and what are you calling about?\n\nCaller: Just wanted to check on my appointment.",
        notes: "General inquiry.",
      },
    ];

    if (!hasDemo || force) {
      const preserved = force ? currentEvents.filter((e: any) => !isDemoEvent(e)) : currentEvents;
      const nextEvents = [...demoEvents, ...preserved.filter((e: any) => !isDemoEvent(e))].slice(0, 200);

      const nextSettings = rec.settings && typeof rec.settings === "object" && !Array.isArray(rec.settings)
        ? rec.settings
        : {
            version: 1,
            enabled: true,
            mode: "AI",
            webhookToken: "demo_ai_receptionist_token_123456",
            businessName: "Purely Automation",
            greeting: "Thanks for calling — how can I help?",
            systemPrompt: "You are a helpful AI receptionist.",
            forwardToPhoneE164: null,
            voiceAgentId: "",
            voiceAgentApiKey: null,
          };

      await prisma.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug } },
        create: {
          ownerId: user.id,
          serviceSlug,
          status: "COMPLETE",
          dataJson: { ...rec, version: 1, settings: nextSettings, events: nextEvents } as any,
        },
        update: {
          status: "COMPLETE",
          dataJson: { ...rec, version: 1, settings: nextSettings, events: nextEvents } as any,
        },
        select: { id: true },
      });

      return NextResponse.json(
        {
          ok: true,
          forced: force,
          inserted: demoEvents.length,
          skipped: false,
          fullEmail: user.email,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        forced: force,
        inserted: 0,
        skipped: true,
        fullEmail: user.email,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Seed failed", details: toErrorMessage(err) },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
