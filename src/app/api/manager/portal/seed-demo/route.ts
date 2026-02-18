import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ensureClientRoleAllowed, isClientRoleMissingError } from "@/lib/ensureClientRoleAllowed";
import { makeEmailThreadKey, makeSmsThreadKey, upsertPortalInboxMessage } from "@/lib/portalInbox";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";

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

function hintForError(message: string) {
  const msg = message.toLowerCase();
  if (
    msg.includes("invalid input value for enum") ||
    (msg.includes("role") && msg.includes("client") && msg.includes("enum"))
  ) {
    return "Database schema looks behind. Deploy with Prisma schema sync (e.g. run `prisma db push`) so the Role enum includes CLIENT, then try again.";
  }
  if (msg.includes("prisma") && msg.includes("connect")) {
    return "Database connection failed. Confirm DATABASE_URL is set and reachable from the deployed environment.";
  }
  return null;
}

function randomPassword() {
  // Avoid ambiguous characters
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 14; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

const bodySchema = z
  .object({
    fullEmail: z.string().email().optional(),
    fullPassword: z.string().min(6).optional(),
    limitedEmail: z.string().email().optional(),
    limitedPassword: z.string().min(6).optional(),
    forceInboxSeed: z.boolean().optional(),
    forceAiReceptionistSeed: z.boolean().optional(),
  })
  .optional();

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "MANAGER" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const fullEmail = (parsed.data?.fullEmail ?? "demo-full@purelyautomation.dev")
      .toLowerCase()
      .trim();
    const limitedEmail = (parsed.data?.limitedEmail ?? "demo-limited@purelyautomation.dev")
      .toLowerCase()
      .trim();

    const fullPassword = parsed.data?.fullPassword ?? randomPassword();
    const limitedPassword = parsed.data?.limitedPassword ?? randomPassword();
    const forceInboxSeed = parsed.data?.forceInboxSeed === true;
    const forceAiReceptionistSeed = parsed.data?.forceAiReceptionistSeed === true;

    const envDemoFull = (process.env.DEMO_PORTAL_FULL_EMAIL ?? "").trim().toLowerCase();
    const allowForceInbox = fullEmail === "demo-full@purelyautomation.dev" || (envDemoFull && fullEmail === envDemoFull);
    if (forceInboxSeed && !allowForceInbox) {
      return NextResponse.json(
        {
          error: "Forbidden",
          details: "forceInboxSeed is only allowed for the demo-full account.",
        },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }

    if (forceAiReceptionistSeed && !allowForceInbox) {
      return NextResponse.json(
        {
          error: "Forbidden",
          details: "forceAiReceptionistSeed is only allowed for the demo-full account.",
        },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }

    const fullPasswordHash = await hashPassword(fullPassword);
    const limitedPasswordHash = await hashPassword(limitedPassword);

    const runUpserts = async () => {
      const [fullUser, limitedUser] = await prisma.$transaction([
        prisma.user.upsert({
          where: { email: fullEmail },
          update: {
            role: "CLIENT",
            active: true,
            name: "Demo Client (Full)",
            passwordHash: fullPasswordHash,
          },
          create: {
            email: fullEmail,
            name: "Demo Client (Full)",
            role: "CLIENT",
            active: true,
            passwordHash: fullPasswordHash,
          },
          select: { id: true, email: true, name: true, role: true },
        }),
        prisma.user.upsert({
          where: { email: limitedEmail },
          update: {
            role: "CLIENT",
            active: true,
            name: "Demo Client (Limited)",
            passwordHash: limitedPasswordHash,
          },
          create: {
            email: limitedEmail,
            name: "Demo Client (Limited)",
            role: "CLIENT",
            active: true,
            passwordHash: limitedPasswordHash,
          },
          select: { id: true, email: true, name: true, role: true },
        }),
      ]);

      return [fullUser, limitedUser] as const;
    };

    let fullUser;
    let limitedUser;
    try {
      [fullUser, limitedUser] = await runUpserts();
    } catch (e) {
      if (isClientRoleMissingError(e)) {
        await ensureClientRoleAllowed(prisma);
        [fullUser, limitedUser] = await runUpserts();
      } else {
        throw e;
      }
    }

    // Seed sample Inbox / Outbox data for the full demo user.
    // Idempotent by default: only seeds when the user has no inbox messages.
    // Use `forceInboxSeed` to wipe demo inbox data and reseed.
    let inboxSeed:
      | {
          ok: true;
          forced: boolean;
          existingCountBefore: number;
          deletedThreads: number;
          deletedAttachments: number;
          insertedMessages: number;
          seededThreads: number;
          skipped: boolean;
        }
      | { ok: false; forced: boolean; error: string } = {
      ok: true,
      forced: forceInboxSeed,
      existingCountBefore: 0,
      deletedThreads: 0,
      deletedAttachments: 0,
      insertedMessages: 0,
      seededThreads: 0,
      skipped: true,
    };

    try {
      await ensurePortalInboxSchema();

      const existingCountBefore = await (prisma as any).portalInboxMessage.count({
        where: { ownerId: fullUser.id },
      });

      let deletedThreads = 0;
      let deletedAttachments = 0;

      if (forceInboxSeed) {
        // Remove any demo inbox data for the demo-full account.
        // Delete threads (cascades to messages) and attachments owned by the user.
        const attachmentsRes = await (prisma as any).portalInboxAttachment.deleteMany({
          where: { ownerId: fullUser.id },
        });
        deletedAttachments = attachmentsRes?.count ?? 0;

        const threadsRes = await (prisma as any).portalInboxThread.deleteMany({
          where: { ownerId: fullUser.id },
        });
        deletedThreads = threadsRes?.count ?? 0;
      }

      const existingCountAfter = await (prisma as any).portalInboxMessage.count({
        where: { ownerId: fullUser.id },
      });

      let insertedMessages = 0;
      const seededThreadKeys = new Set<string>();

      if (!existingCountAfter) {
        const now = Date.now();
        const minutesAgo = (m: number) => new Date(now - m * 60 * 1000);

        const seedEmailThread = async (
          peerEmail: string,
          subject: string,
          msgs: Array<{ dir: "IN" | "OUT"; body: string; atMinAgo: number }>,
        ) => {
          const key = makeEmailThreadKey(peerEmail, subject);
          if (!key) return;

          for (const msg of msgs) {
            const fromAddress = msg.dir === "IN" ? peerEmail : "no-reply@purelyautomation.com";
            const toAddress = msg.dir === "IN" ? fullEmail : peerEmail;
            await upsertPortalInboxMessage({
              ownerId: fullUser.id,
              channel: "EMAIL",
              direction: msg.dir,
              threadKey: key.threadKey,
              peerAddress: key.peerAddress,
              peerKey: key.peerKey,
              subject: key.subject,
              subjectKey: key.subjectKey,
              fromAddress,
              toAddress,
              bodyText: msg.body,
              provider: "demo",
              providerMessageId: `demo-email-${key.peerKey}-${Math.abs(msg.atMinAgo)}`,
              createdAt: minutesAgo(msg.atMinAgo),
            });
            insertedMessages += 1;
            seededThreadKeys.add(`EMAIL:${key.threadKey}`);
          }
        };

        const seedSmsThread = async (
          peerE164: string,
          msgs: Array<{ dir: "IN" | "OUT"; body: string; atMinAgo: number }>,
        ) => {
          const key = makeSmsThreadKey(peerE164);
          for (const msg of msgs) {
            const fromAddress = msg.dir === "IN" ? peerE164 : "+15551230000";
            const toAddress = msg.dir === "IN" ? "+15551230000" : peerE164;
            await upsertPortalInboxMessage({
              ownerId: fullUser.id,
              channel: "SMS",
              direction: msg.dir,
              threadKey: key.threadKey,
              peerAddress: key.peerAddress,
              peerKey: key.peerKey,
              fromAddress,
              toAddress,
              bodyText: msg.body,
              provider: "demo",
              providerMessageId: `demo-sms-${peerE164}-${Math.abs(msg.atMinAgo)}`,
              createdAt: minutesAgo(msg.atMinAgo),
            });
            insertedMessages += 1;
            seededThreadKeys.add(`SMS:${key.threadKey}`);
          }
        };

        await seedEmailThread("sarah@acmehomes.com", "Follow up on your quote", [
          {
            dir: "IN",
            atMinAgo: 720,
            body: "Hi! Quick question: does your quote include installation and removal of the old unit?",
          },
          {
            dir: "OUT",
            atMinAgo: 700,
            body: "Yes, installation is included, and we can remove the old unit as well. Want me to send over a couple available time slots?",
          },
          { dir: "IN", atMinAgo: 680, body: "That works. Do you have anything Thursday afternoon?" },
          {
            dir: "OUT",
            atMinAgo: 670,
            body: "Thursday 2:30pm or 4:00pm are open. Reply with the best one and we’ll lock it in.",
          },
        ]);

        await seedEmailThread("billing@vendor-example.com", "Invoice #10492", [
          {
            dir: "IN",
            atMinAgo: 2880,
            body: "Hello, attached is Invoice #10492. Let us know if you need anything.",
          },
          { dir: "OUT", atMinAgo: 2870, body: "Thanks! We received it and will process payment today." },
        ]);

        await seedEmailThread("alex@partnerships.example", "Partnership opportunity", [
          {
            dir: "IN",
            atMinAgo: 10080,
            body: "Hey there, I’d love to explore a partnership. Are you open to a quick call next week?",
          },
          { dir: "OUT", atMinAgo: 10060, body: "Yes, open to it. What days/times work best for you?" },
          { dir: "IN", atMinAgo: 10020, body: "Tuesday at 11am ET would be great." },
        ]);

        await seedSmsThread("+15555550123", [
          { dir: "IN", atMinAgo: 95, body: "Hey! Are you still able to come by today?" },
          { dir: "OUT", atMinAgo: 92, body: "Yep, on the way now. ETA ~20 min." },
          { dir: "IN", atMinAgo: 70, body: "Perfect. Gate code is 1942." },
          { dir: "OUT", atMinAgo: 68, body: "Got it, thanks!" },
        ]);

        await seedSmsThread("+15555550987", [
          { dir: "IN", atMinAgo: 1440, body: "Can I reschedule tomorrow’s appointment?" },
          { dir: "OUT", atMinAgo: 1435, body: "Absolutely. What time works better?" },
          { dir: "IN", atMinAgo: 1420, body: "Anytime after 3pm." },
          { dir: "OUT", atMinAgo: 1418, body: "We can do 3:30pm. Want me to confirm it?" },
          { dir: "IN", atMinAgo: 1415, body: "Yes please." },
        ]);
      }

      inboxSeed = {
        ok: true,
        forced: forceInboxSeed,
        existingCountBefore,
        deletedThreads,
        deletedAttachments,
        insertedMessages,
        seededThreads: seededThreadKeys.size,
        skipped: existingCountAfter > 0,
      };
    } catch (e) {
      inboxSeed = { ok: false, forced: forceInboxSeed, error: toErrorMessage(e) };
    }

    // Seed sample AI Receptionist calls for the full demo user.
    // Idempotent by default: only seeds if no demo calls are present.
    // Use forceAiReceptionistSeed to replace demo calls.
    let aiReceptionistSeed:
      | { ok: true; forced: boolean; inserted: number; skipped: boolean }
      | { ok: false; forced: boolean; error: string } = {
      ok: true,
      forced: forceAiReceptionistSeed,
      inserted: 0,
      skipped: true,
    };

    try {
      const serviceSlug = "ai-receptionist";
      const existing = await prisma.portalServiceSetup.findUnique({
        where: { ownerId_serviceSlug: { ownerId: fullUser.id, serviceSlug } },
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
            "Sarah: Hi, I’m calling to ask about pricing and whether you guys do same-day installs.\n\nAI Receptionist: Absolutely. What city are you in and what kind of system are you looking for?\n\nSarah: Tampa. It’s a replacement. My AC is struggling.\n\nAI Receptionist: Got it. What’s the best email to send options and next steps?\n\nSarah: sarah@example.com",
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
            "Mike: Hey, do you have anything open this Thursday afternoon?\n\nAI Receptionist: Yes. Can I grab your name and a good callback number?\n\nMike: Mike. This number is fine.\n\nAI Receptionist: Perfect. I’ll send available times via text shortly.",
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
            "Caller: Hi, I’m returning a missed call.\n\nAI Receptionist: Sorry about that. What’s the best way to reach you and what are you calling about?\n\nCaller: Just wanted to check on my appointment.",
          notes: "General inquiry.",
        },
      ];

      if (!hasDemo || forceAiReceptionistSeed) {
        const preserved = forceAiReceptionistSeed ? currentEvents.filter((e: any) => !isDemoEvent(e)) : currentEvents;
        const nextEvents = [...demoEvents, ...preserved.filter((e: any) => !isDemoEvent(e))].slice(0, 200);

        const nextSettings = rec.settings && typeof rec.settings === "object" && !Array.isArray(rec.settings)
          ? rec.settings
          : {
              version: 1,
              enabled: true,
              mode: "AI",
              webhookToken: "demo_ai_receptionist_token_123456",
              businessName: "Purely Automation",
              greeting: "Thanks for calling. How can I help?",
              systemPrompt: "You are a helpful AI receptionist.",
              forwardToPhoneE164: null,
              voiceAgentId: "",
              voiceAgentApiKey: null,
            };

        await prisma.portalServiceSetup.upsert({
          where: { ownerId_serviceSlug: { ownerId: fullUser.id, serviceSlug } },
          create: {
            ownerId: fullUser.id,
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

        aiReceptionistSeed = { ok: true, forced: forceAiReceptionistSeed, inserted: demoEvents.length, skipped: false };
      } else {
        aiReceptionistSeed = { ok: true, forced: forceAiReceptionistSeed, inserted: 0, skipped: true };
      }
    } catch (e) {
      aiReceptionistSeed = { ok: false, forced: forceAiReceptionistSeed, error: toErrorMessage(e) };
    }

    return NextResponse.json(
      {
        full: { ...fullUser, password: fullPassword },
        limited: { ...limitedUser, password: limitedPassword },
        inboxSeed,
        aiReceptionistSeed,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (err) {
    const message = toErrorMessage(err);
    const hint = hintForError(message);
    return NextResponse.json(
      {
        error: "Seed failed",
        details: message,
        hint,
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
