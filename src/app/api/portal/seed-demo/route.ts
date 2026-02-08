import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ensureClientRoleAllowed, isClientRoleMissingError } from "@/lib/ensureClientRoleAllowed";
import { makeEmailThreadKey, makeSmsThreadKey, upsertPortalInboxMessage } from "@/lib/portalInbox";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";

function boolEnv(v?: string) {
  return v === "1" || v === "true" || v === "yes";
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env var ${name}`);
  return v.trim();
}

export async function POST(req: Request) {
  if (!boolEnv(process.env.DEMO_PORTAL_SEED_ENABLED)) {
    return NextResponse.json(
      { error: "Demo seeding is disabled" },
      { status: 403 },
    );
  }

  const expected = process.env.DEMO_PORTAL_SEED_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Missing DEMO_PORTAL_SEED_SECRET" },
      { status: 500 },
    );
  }

  const provided = req.headers.get("x-demo-seed-secret") ?? "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let fullEmail: string;
  let fullPassword: string;
  let limitedEmail: string;
  let limitedPassword: string;

  try {
    fullEmail = requireEnv("DEMO_PORTAL_FULL_EMAIL").toLowerCase();
    fullPassword = requireEnv("DEMO_PORTAL_FULL_PASSWORD");
    limitedEmail = requireEnv("DEMO_PORTAL_LIMITED_EMAIL").toLowerCase();
    limitedPassword = requireEnv("DEMO_PORTAL_LIMITED_PASSWORD");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Missing env vars";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const runUpserts = async () => {
    const [fullUser, limitedUser] = await prisma.$transaction([
      prisma.user.upsert({
      where: { email: fullEmail },
      update: { role: "CLIENT", active: true, name: "Demo Client (Full)" },
      create: {
        email: fullEmail,
        name: "Demo Client (Full)",
        role: "CLIENT",
        active: true,
        passwordHash: await hashPassword(fullPassword),
      },
      select: { id: true, email: true, name: true, role: true },
      }),
      prisma.user.upsert({
      where: { email: limitedEmail },
      update: { role: "CLIENT", active: true, name: "Demo Client (Limited)" },
      create: {
        email: limitedEmail,
        name: "Demo Client (Limited)",
        role: "CLIENT",
        active: true,
        passwordHash: await hashPassword(limitedPassword),
      },
      select: { id: true, email: true, name: true, role: true },
      }),
    ]);

    // Ensure the full demo account has a healthy credit balance for demos.
    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId: fullUser.id, serviceSlug: "credits" } },
      create: {
        ownerId: fullUser.id,
        serviceSlug: "credits",
        status: "COMPLETE",
        dataJson: { balance: 500, autoTopUp: false },
      },
      update: {
        dataJson: { balance: 500, autoTopUp: false },
        status: "COMPLETE",
      },
      select: { id: true },
    });

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
    await ensurePortalInboxSchema();
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

  return NextResponse.json({ fullUser, limitedUser });
}
