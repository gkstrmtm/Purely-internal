import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ensureClientRoleAllowed, isClientRoleMissingError } from "@/lib/ensureClientRoleAllowed";
import { normalizeEmailKey, normalizeNameKey, normalizePhoneKey } from "@/lib/portalContacts";
import { ensurePortalContactsSchema } from "@/lib/portalContactsSchema";
import { makeEmailThreadKey, makeSmsThreadKey, upsertPortalInboxMessage } from "@/lib/portalInbox";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";
import type { ReviewRequestsSettings } from "@/lib/reviewRequests";

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
    skipPasswordReset: z.boolean().optional(),
    forceInboxSeed: z.boolean().optional(),
    forceAiReceptionistSeed: z.boolean().optional(),
    forcePuraSeed: z.boolean().optional(),
  })
  .optional();

const demoContacts = [
  {
    name: "Sarah Miller",
    email: "sarah@acmehomes.com",
    phone: "+15555550111",
    customVariables: {
      company: "Acme Homes",
      city: "Tampa",
      stage: "Quoted",
      interest: "Same-day install",
    },
  },
  {
    name: "Mike Rivera",
    email: null,
    phone: "+15555550222",
    customVariables: {
      source: "AI receptionist",
      stage: "Scheduling",
      preferredWindow: "Thursday afternoon",
    },
  },
  {
    name: "Jordan Lee",
    email: null,
    phone: "+15555550123",
    customVariables: {
      source: "SMS",
      note: "Gate code 1942",
      stage: "Visit in progress",
    },
  },
  {
    name: "Jamie Carter",
    email: null,
    phone: "+15555550987",
    customVariables: {
      source: "SMS",
      stage: "Rescheduled",
      preferredTime: "After 3pm",
    },
  },
  {
    name: "Alex Parker",
    email: "alex@partnerships.example",
    phone: null,
    customVariables: {
      source: "Email",
      stage: "Partnership follow-up",
      meetingPreference: "Tuesday 11am ET",
    },
  },
] as const;

const demoTasks = [
  {
    title: "Call back Mike Rivera about Thursday availability",
    description: "Confirm which Thursday afternoon slot works best and offer to lock it in.",
    status: "OPEN" as const,
    dueDaysFromNow: 1,
  },
  {
    title: "Reply to Alex Parker partnership email",
    description: "Send a quick response with meeting confirmation and next steps.",
    status: "OPEN" as const,
    dueDaysFromNow: 2,
  },
  {
    title: "Process Invoice #10492",
    description: "Mark the vendor invoice as handled and confirm payment was processed.",
    status: "DONE" as const,
    dueDaysFromNow: -1,
  },
  {
    title: "Confirm Jamie Carter reschedule",
    description: "Send the 3:30pm confirmation and keep the text thread updated.",
    status: "DONE" as const,
    dueDaysFromNow: 0,
  },
] as const;

const demoReviews = [
  {
    name: "Sarah Miller",
    email: "sarah@acmehomes.com",
    phone: "+15555550111",
    rating: 5,
    body: "Quick response, clear quote, and the team made scheduling easy.",
    businessReply: "Thanks Sarah. Glad we could make the quote and scheduling simple.",
  },
  {
    name: "Jamie Carter",
    email: "jamie.demo@purelyautomation.dev",
    phone: "+15555550987",
    rating: 4,
    body: "The reschedule was easy and the text updates were helpful.",
    businessReply: "Thanks Jamie. We appreciate the feedback and are glad the updates helped.",
  },
  {
    name: "Mike Rivera",
    email: "mike.demo@purelyautomation.dev",
    phone: "+15555550222",
    rating: 5,
    body: "The receptionist answered quickly and got me the info I needed.",
    businessReply: null,
  },
] as const;

const demoReviewSettings: ReviewRequestsSettings = {
  version: 1,
  enabled: true,
  automation: { autoSend: false, manualSend: true, calendarIds: [] },
  tagAfterSend: { enabled: false, tagId: null },
  sendAfter: { value: 60, unit: "minutes" },
  destinations: [
    {
      id: "demo-google",
      label: "Google",
      url: "https://g.page/r/purelyautomation-demo/review",
    },
  ],
  defaultDestinationId: "demo-google",
  messageTemplate:
    "Hi {name}, thanks again for choosing Purely Automation. If you have 30 seconds, would you leave us a quick review? {link}",
  calendarMessageTemplates: {},
  publicPage: {
    enabled: true,
    galleryEnabled: true,
    fontKey: "brand",
    title: "Client reviews",
    description: "A small demo page for collecting and showcasing feedback.",
    thankYouMessage: "Thanks. Your review was submitted.",
    form: {
      version: 1,
      email: { enabled: true, required: false },
      phone: { enabled: true, required: false },
      questions: [],
    },
    photoUrls: [],
  },
};

type PuraDemoSeedSuccess = {
  ok: true;
  forced: boolean;
  contactsCreated: number;
  contactsUpdated: number;
  tasksCreated: number;
  tasksUpdated: number;
  reviewsCreated: number;
  reviewsUpdated: number;
  linkedInboxThreads: number;
  serviceSetupsUpdated: number;
};

async function ensureDemoReviewSettings(ownerId: string) {
  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "reviews" } },
    select: { id: true },
  });

  if (existing?.id) return false;

  await prisma.portalServiceSetup.create({
    data: {
      ownerId,
      serviceSlug: "reviews",
      status: "COMPLETE",
      dataJson: {
        version: 1,
        settings: demoReviewSettings,
        sentKeys: [],
        events: [],
      } as any,
    },
    select: { id: true },
  });

  return true;
}

async function seedPuraDemoData(input: {
  ownerId: string;
  force: boolean;
}): Promise<PuraDemoSeedSuccess> {
  const ownerId = String(input.ownerId || "").trim();
  if (!ownerId) {
    return {
      ok: true,
      forced: input.force,
      contactsCreated: 0,
      contactsUpdated: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      reviewsCreated: 0,
      reviewsUpdated: 0,
      linkedInboxThreads: 0,
      serviceSetupsUpdated: 0,
    };
  }

  await ensurePortalContactsSchema().catch(() => null);
  await ensurePortalTasksSchema().catch(() => null);

  const demoNameKeys = demoContacts.map((contact) => normalizeNameKey(contact.name));
  const demoEmailKeys = demoContacts
    .map((contact) => (contact.email ? normalizeEmailKey(contact.email) : null))
    .filter(Boolean) as string[];
  const demoPhoneKeys = demoContacts
    .map((contact) => (contact.phone ? normalizePhoneKey(contact.phone).phoneKey : null))
    .filter(Boolean) as string[];

  if (input.force) {
    await prisma.portalReview.deleteMany({
      where: {
        ownerId,
        OR: demoReviews.map((review) => ({ email: review.email })),
      },
    });

    await prisma.portalTask.deleteMany({
      where: {
        ownerId,
        title: { in: demoTasks.map((task) => task.title) },
      },
    });

    await prisma.portalContact.deleteMany({
      where: {
        ownerId,
        OR: [
          ...(demoEmailKeys.length ? [{ emailKey: { in: demoEmailKeys } }] : []),
          ...(demoPhoneKeys.length ? [{ phoneKey: { in: demoPhoneKeys } }] : []),
          { nameKey: { in: demoNameKeys } },
        ],
      },
    });
  }

  let serviceSetupsUpdated = 0;
  const existingBusinessProfile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { id: true } });
  if (!existingBusinessProfile?.id) {
    await prisma.businessProfile.create({
      data: {
        ownerId,
        businessName: "Purely Automation Demo",
        websiteUrl: "https://purelyautomation.com",
        industry: "Home services",
        businessModel: "B2C",
        primaryGoals: ["book more installs", "respond faster", "collect more reviews"] as any,
        targetCustomer: "Homeowners who need fast scheduling and clear follow-up.",
        brandVoice: "Helpful, clear, trustworthy",
        brandPrimaryHex: "#2563eb",
        brandSecondaryHex: "#0f172a",
        brandAccentHex: "#f97316",
        brandTextHex: "#0f172a",
      },
      select: { id: true },
    });
    serviceSetupsUpdated += 1;
  }

  const existingProfileSetup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "profile" } },
    select: { id: true },
  });
  if (!existingProfileSetup?.id) {
    await prisma.portalServiceSetup.create({
      data: {
        ownerId,
        serviceSlug: "profile",
        status: "COMPLETE",
        dataJson: {
          version: 1,
          businessName: "Purely Automation Demo",
          city: "Tampa",
          state: "FL",
          websiteUrl: "https://purelyautomation.com",
          primaryOffer: "HVAC installs and automation support",
        } as any,
      },
      select: { id: true },
    });
    serviceSetupsUpdated += 1;
  }

  const existingInboxSetup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "inbox" } },
    select: { id: true },
  });
  if (!existingInboxSetup?.id) {
    await prisma.portalServiceSetup.create({
      data: {
        ownerId,
        serviceSlug: "inbox",
        status: "COMPLETE",
        dataJson: {
          version: 1,
          settings: {
            webhookToken: "demo_inbox_webhook_token_123456",
            emailEnabled: true,
            smsEnabled: true,
          },
        } as any,
      },
      select: { id: true },
    });
    serviceSetupsUpdated += 1;
  }

  if (await ensureDemoReviewSettings(ownerId)) {
    serviceSetupsUpdated += 1;
  }

  let contactsCreated = 0;
  let contactsUpdated = 0;
  const contactIdByLookup = new Map<string, string>();

  for (const contact of demoContacts) {
    const emailKey = contact.email ? normalizeEmailKey(contact.email) : null;
    const phoneNorm = contact.phone ? normalizePhoneKey(contact.phone) : { phone: null, phoneKey: null };
    const nameKey = normalizeNameKey(contact.name);

    const existing = await prisma.portalContact.findFirst({
      where: {
        ownerId,
        OR: [
          ...(emailKey ? [{ emailKey }] : []),
          ...(phoneNorm.phoneKey ? [{ phoneKey: phoneNorm.phoneKey }] : []),
          { nameKey },
        ],
      },
      select: { id: true },
    });

    const saved = existing
      ? { id: existing.id }
      : await prisma.portalContact.create({
          data: {
            ownerId,
            name: contact.name,
            nameKey,
            email: contact.email,
            emailKey,
            phone: phoneNorm.phone,
            phoneKey: phoneNorm.phoneKey,
            customVariables: contact.customVariables as any,
          },
          select: { id: true },
        });

    if (existing) contactsUpdated += 1;
    else contactsCreated += 1;

    if (emailKey) contactIdByLookup.set(`email:${emailKey}`, saved.id);
    if (phoneNorm.phoneKey) contactIdByLookup.set(`phone:${phoneNorm.phoneKey}`, saved.id);
    contactIdByLookup.set(`name:${nameKey}`, saved.id);
  }

  let tasksCreated = 0;
  let tasksUpdated = 0;
  for (const task of demoTasks) {
    const dueAt = new Date(Date.now() + task.dueDaysFromNow * 24 * 60 * 60 * 1000);
    const existing = await prisma.portalTask.findFirst({
      where: { ownerId, title: task.title },
      select: { id: true },
    });

    if (existing) {
      tasksUpdated += 1;
    } else {
      await prisma.portalTask.create({
        data: {
          ownerId,
          title: task.title,
          description: task.description,
          status: task.status,
          dueAt,
        },
        select: { id: true },
      });
      tasksCreated += 1;
    }
  }

  let reviewsCreated = 0;
  let reviewsUpdated = 0;
  for (const review of demoReviews) {
    const emailKey = normalizeEmailKey(review.email);
    const phoneKey = normalizePhoneKey(review.phone).phoneKey;
    const contactId = (emailKey ? contactIdByLookup.get(`email:${emailKey}`) : null)
      ?? (phoneKey ? contactIdByLookup.get(`phone:${phoneKey}`) : null)
      ?? contactIdByLookup.get(`name:${normalizeNameKey(review.name)}`)
      ?? null;

    const existing = await prisma.portalReview.findFirst({
      where: { ownerId, email: review.email },
      select: { id: true },
    });

    if (existing) {
      reviewsUpdated += 1;
    } else {
      await prisma.portalReview.create({
        data: {
          ownerId,
          rating: review.rating,
          name: review.name,
          body: review.body,
          email: review.email,
          phone: review.phone,
          contactId,
          businessReply: review.businessReply,
          businessReplyAt: review.businessReply ? new Date() : null,
          archivedAt: null,
        },
        select: { id: true },
      });
      reviewsCreated += 1;
    }
  }

  let linkedInboxThreads = 0;
  for (const contact of demoContacts) {
    const emailKey = contact.email ? normalizeEmailKey(contact.email) : null;
    const phoneKey = contact.phone ? normalizePhoneKey(contact.phone).phoneKey : null;
    const contactId = (emailKey ? contactIdByLookup.get(`email:${emailKey}`) : null)
      ?? (phoneKey ? contactIdByLookup.get(`phone:${phoneKey}`) : null)
      ?? null;

    if (!contactId) continue;
    if (emailKey) {
      const res = await prisma.portalInboxThread.updateMany({
        where: { ownerId, peerKey: emailKey, contactId: null },
        data: { contactId },
      });
      linkedInboxThreads += res.count;
    }
    if (phoneKey) {
      const res = await prisma.portalInboxThread.updateMany({
        where: { ownerId, peerKey: phoneKey, contactId: null },
        data: { contactId },
      });
      linkedInboxThreads += res.count;
    }
  }

  return {
    ok: true,
    forced: input.force,
    contactsCreated,
    contactsUpdated,
    tasksCreated,
    tasksUpdated,
    reviewsCreated,
    reviewsUpdated,
    linkedInboxThreads,
    serviceSetupsUpdated,
  };
}

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
    const skipPasswordReset = parsed.data?.skipPasswordReset === true;
    const forceInboxSeed = parsed.data?.forceInboxSeed === true;
    const forceAiReceptionistSeed = parsed.data?.forceAiReceptionistSeed === true;
    const forcePuraSeed = parsed.data?.forcePuraSeed === true;

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

    if (forcePuraSeed && !allowForceInbox) {
      return NextResponse.json(
        {
          error: "Forbidden",
          details: "forcePuraSeed is only allowed for the demo-full account.",
        },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }

    const fullPasswordHash = await hashPassword(fullPassword);
    const limitedPasswordHash = await hashPassword(limitedPassword);

    const [existingFullUser, existingLimitedUser] = await prisma.$transaction([
      prisma.user.findUnique({ where: { email: fullEmail }, select: { id: true } }),
      prisma.user.findUnique({ where: { email: limitedEmail }, select: { id: true } }),
    ]);

    const runUpserts = async () => {
      const [fullUser, limitedUser] = await prisma.$transaction([
        prisma.user.upsert({
          where: { email: fullEmail },
          update: {
            role: "CLIENT",
            active: true,
            name: "Demo Client (Full)",
            ...(skipPasswordReset ? {} : { passwordHash: fullPasswordHash }),
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
            ...(skipPasswordReset ? {} : { passwordHash: limitedPasswordHash }),
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
    // Idempotent by default: adds any missing demo messages without touching existing data.
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

      let insertedMessages = 0;
      const seededThreadKeys = new Set<string>();

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
          const providerMessageId = `demo-email-${key.peerKey}-${Math.abs(msg.atMinAgo)}`;
          const existing = await (prisma as any).portalInboxMessage.findFirst({
            where: { ownerId: fullUser.id, provider: "demo", providerMessageId },
            select: { id: true },
          });
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
            providerMessageId,
            createdAt: minutesAgo(msg.atMinAgo),
          });
          if (!existing?.id) insertedMessages += 1;
          seededThreadKeys.add(`EMAIL:${key.threadKey}`);
        }
      };

      const seedSmsThread = async (
        peerE164: string,
        msgs: Array<{ dir: "IN" | "OUT"; body: string; atMinAgo: number }>,
      ) => {
        const key = makeSmsThreadKey(peerE164);
        for (const msg of msgs) {
          const providerMessageId = `demo-sms-${peerE164}-${Math.abs(msg.atMinAgo)}`;
          const existing = await (prisma as any).portalInboxMessage.findFirst({
            where: { ownerId: fullUser.id, provider: "demo", providerMessageId },
            select: { id: true },
          });
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
            providerMessageId,
            createdAt: minutesAgo(msg.atMinAgo),
          });
          if (!existing?.id) insertedMessages += 1;
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

      inboxSeed = {
        ok: true,
        forced: forceInboxSeed,
        existingCountBefore,
        deletedThreads,
        deletedAttachments,
        insertedMessages,
        seededThreads: seededThreadKeys.size,
        skipped: insertedMessages === 0,
      };
    } catch (e) {
      inboxSeed = { ok: false, forced: forceInboxSeed, error: toErrorMessage(e) };
    }

    // Seed sample AI Receptionist calls for the full demo user.
    // Idempotent by default: adds any missing demo calls without touching existing non-demo calls.
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
      const currentDemoIds = new Set(
        currentEvents
          .filter(isDemoEvent)
          .map((event: any) => (typeof event?.id === "string" ? event.id : ""))
          .filter(Boolean),
      );

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

      const missingDemoEvents = demoEvents.filter((event) => forceAiReceptionistSeed || !currentDemoIds.has(event.id));

      if (missingDemoEvents.length > 0 || forceAiReceptionistSeed) {
        const preserved = forceAiReceptionistSeed ? currentEvents.filter((e: any) => !isDemoEvent(e)) : currentEvents;
        const nextEvents = [...missingDemoEvents, ...preserved].slice(0, 200);

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

        aiReceptionistSeed = { ok: true, forced: forceAiReceptionistSeed, inserted: missingDemoEvents.length, skipped: false };
      } else {
        aiReceptionistSeed = { ok: true, forced: forceAiReceptionistSeed, inserted: 0, skipped: true };
      }
    } catch (e) {
      aiReceptionistSeed = { ok: false, forced: forceAiReceptionistSeed, error: toErrorMessage(e) };
    }

    let puraDemoSeed:
      | PuraDemoSeedSuccess
      | { ok: false; forced: boolean; error: string } = {
      ok: true,
      forced: forcePuraSeed,
      contactsCreated: 0,
      contactsUpdated: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      reviewsCreated: 0,
      reviewsUpdated: 0,
      linkedInboxThreads: 0,
      serviceSetupsUpdated: 0,
    };

    try {
      puraDemoSeed = await seedPuraDemoData({ ownerId: fullUser.id, force: forcePuraSeed });
    } catch (e) {
      puraDemoSeed = { ok: false, forced: forcePuraSeed, error: toErrorMessage(e) };
    }

    return NextResponse.json(
      {
        full: { ...fullUser, password: skipPasswordReset && existingFullUser ? "(unchanged)" : fullPassword },
        limited: { ...limitedUser, password: skipPasswordReset && existingLimitedUser ? "(unchanged)" : limitedPassword },
        inboxSeed,
        aiReceptionistSeed,
        puraDemoSeed,
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
