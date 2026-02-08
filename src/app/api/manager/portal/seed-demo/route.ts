import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ensureClientRoleAllowed, isClientRoleMissingError } from "@/lib/ensureClientRoleAllowed";
import { makeEmailThreadKey, makeSmsThreadKey, upsertPortalInboxMessage } from "@/lib/portalInbox";

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
    // Idempotent: only seeds when the user has no inbox messages.
    try {
      const existingCount = await (prisma as any).portalInboxMessage.count({
        where: { ownerId: fullUser.id },
      });

      if (!existingCount) {
        const now = Date.now();
        const minutesAgo = (m: number) => new Date(now - m * 60 * 1000);

        const seedEmailThread = async (peerEmail: string, subject: string, msgs: Array<{ dir: "IN" | "OUT"; body: string; atMinAgo: number }>) => {
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
          }
        };

        const seedSmsThread = async (peerE164: string, msgs: Array<{ dir: "IN" | "OUT"; body: string; atMinAgo: number }>) => {
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
          }
        };

        await seedEmailThread("sarah@acmehomes.com", "Follow up on your quote", [
          { dir: "IN", atMinAgo: 720, body: "Hi! Quick question — does your quote include installation and removal of the old unit?" },
          { dir: "OUT", atMinAgo: 700, body: "Yes — installation is included, and we can remove the old unit as well. Want me to send over a couple available time slots?" },
          { dir: "IN", atMinAgo: 680, body: "That works. Do you have anything Thursday afternoon?" },
          { dir: "OUT", atMinAgo: 670, body: "Thursday 2:30pm or 4:00pm are open. Reply with the best one and we’ll lock it in." },
        ]);

        await seedEmailThread("billing@vendor-example.com", "Invoice #10492", [
          { dir: "IN", atMinAgo: 2880, body: "Hello — attached is Invoice #10492. Let us know if you need anything." },
          { dir: "OUT", atMinAgo: 2870, body: "Thanks! We received it and will process payment today." },
        ]);

        await seedEmailThread("alex@partnerships.example", "Partnership opportunity", [
          { dir: "IN", atMinAgo: 10080, body: "Hey there — I’d love to explore a partnership. Are you open to a quick call next week?" },
          { dir: "OUT", atMinAgo: 10060, body: "Yes, open to it. What days/times work best for you?" },
          { dir: "IN", atMinAgo: 10020, body: "Tuesday at 11am ET would be great." },
        ]);

        await seedSmsThread("+15555550123", [
          { dir: "IN", atMinAgo: 95, body: "Hey! Are you still able to come by today?" },
          { dir: "OUT", atMinAgo: 92, body: "Yep — on the way now. ETA ~20 min." },
          { dir: "IN", atMinAgo: 70, body: "Perfect. Gate code is 1942." },
          { dir: "OUT", atMinAgo: 68, body: "Got it — thanks!" },
        ]);

        await seedSmsThread("+15555550987", [
          { dir: "IN", atMinAgo: 1440, body: "Can I reschedule tomorrow’s appointment?" },
          { dir: "OUT", atMinAgo: 1435, body: "Absolutely — what time works better?" },
          { dir: "IN", atMinAgo: 1420, body: "Anytime after 3pm." },
          { dir: "OUT", atMinAgo: 1418, body: "We can do 3:30pm. Want me to confirm it?" },
          { dir: "IN", atMinAgo: 1415, body: "Yes please." },
        ]);
      }
    } catch {
      // Never fail demo seeding due to sample inbox data.
    }

    return NextResponse.json(
      {
        full: { ...fullUser, password: fullPassword },
        limited: { ...limitedUser, password: limitedPassword },
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
