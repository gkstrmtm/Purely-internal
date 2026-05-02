import crypto from "crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BOOKING_CALENDAR_SERVICE_SLUG = "booking_calendars";
const DEFAULT_OWNER_TAKE = 1;

function hashId(prefix, ...parts) {
  const hash = crypto.createHash("sha1").update(parts.join("|"), "utf8").digest("hex").slice(0, 20);
  return `${prefix}_${hash}`;
}

function nameKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function emailKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function phoneKey(value) {
  return String(value || "").replace(/\D+/g, "");
}

function minutesFromNow(deltaMinutes) {
  return new Date(Date.now() + deltaMinutes * 60 * 1000);
}

function normalizeEmailKey(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email.slice(0, 120);
}

function normalizeSubjectKey(subjectRaw) {
  const subject = String(subjectRaw || "").trim();
  if (!subject) return "(no subject)";

  let current = subject;
  for (let index = 0; index < 8; index += 1) {
    const next = current.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "").trim();
    if (next === current) break;
    current = next;
  }

  return (current || "(no subject)").slice(0, 160);
}

function makeSmsThreadKey(peerE164) {
  const peer = String(peerE164 || "").trim();
  return { peerAddress: peer, peerKey: peer, threadKey: peer.slice(0, 260) };
}

function makeEmailThreadKey(peerEmail, subjectRaw) {
  const peerKey = normalizeEmailKey(peerEmail);
  if (!peerKey) return null;
  const subjectKey = normalizeSubjectKey(subjectRaw);
  return {
    peerAddress: String(peerEmail || "").trim().slice(0, 200),
    peerKey,
    subject: String(subjectRaw || "").trim().slice(0, 200) || "(no subject)",
    subjectKey,
    threadKey: `${peerKey}::${subjectKey.toLowerCase()}`.slice(0, 260),
  };
}

function previewFromBody(body) {
  return String(body || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

async function upsertDemoInboxThreadWithMessages(opts) {
  const thread = await prisma.portalInboxThread.upsert({
    where: {
      ownerId_channel_threadKey: {
        ownerId: opts.ownerId,
        channel: opts.channel,
        threadKey: opts.threadKey,
      },
    },
    create: {
      ownerId: opts.ownerId,
      contactId: opts.contactId,
      channel: opts.channel,
      threadKey: opts.threadKey,
      peerAddress: opts.peerAddress,
      peerKey: opts.peerKey,
      subject: opts.subject ?? null,
      subjectKey: opts.subjectKey ?? null,
      lastMessageAt: opts.messages[opts.messages.length - 1]?.createdAt ?? new Date(),
      lastMessagePreview: previewFromBody(opts.messages[opts.messages.length - 1]?.bodyText || ""),
      lastMessageDirection: opts.messages[opts.messages.length - 1]?.direction ?? "OUT",
      lastMessageFrom: String(opts.messages[opts.messages.length - 1]?.fromAddress || "").slice(0, 240),
      lastMessageTo: String(opts.messages[opts.messages.length - 1]?.toAddress || "").slice(0, 240),
      lastMessageSubject: opts.subject ?? null,
    },
    update: {
      contactId: opts.contactId,
      peerAddress: opts.peerAddress,
      peerKey: opts.peerKey,
      subject: opts.subject ?? null,
      subjectKey: opts.subjectKey ?? null,
      lastMessageAt: opts.messages[opts.messages.length - 1]?.createdAt ?? new Date(),
      lastMessagePreview: previewFromBody(opts.messages[opts.messages.length - 1]?.bodyText || ""),
      lastMessageDirection: opts.messages[opts.messages.length - 1]?.direction ?? "OUT",
      lastMessageFrom: String(opts.messages[opts.messages.length - 1]?.fromAddress || "").slice(0, 240),
      lastMessageTo: String(opts.messages[opts.messages.length - 1]?.toAddress || "").slice(0, 240),
      lastMessageSubject: opts.subject ?? null,
    },
    select: { id: true },
  });

  await prisma.portalInboxMessage.deleteMany({
    where: { ownerId: opts.ownerId, threadId: thread.id, provider: "demo-ai-outbound" },
  });

  for (const [index, message] of opts.messages.entries()) {
    await prisma.portalInboxMessage.create({
      data: {
        id: hashId("pim", opts.ownerId, opts.threadKey, String(index)),
        ownerId: opts.ownerId,
        threadId: thread.id,
        channel: opts.channel,
        direction: message.direction,
        fromAddress: String(message.fromAddress || "").slice(0, 240),
        toAddress: String(message.toAddress || "").slice(0, 240),
        subject: opts.subject ?? null,
        bodyText: String(message.bodyText || "").slice(0, 20000),
        provider: "demo-ai-outbound",
        providerMessageId: hashId("prov", opts.threadKey, String(index)),
        createdAt: message.createdAt,
      },
      select: { id: true },
    });
  }

  return thread.id;
}

function parseArgs(argv) {
  const args = { ownerId: "", ownerEmail: "", campaignId: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--ownerId") args.ownerId = String(argv[index + 1] || "").trim();
    if (token === "--ownerEmail") args.ownerEmail = String(argv[index + 1] || "").trim().toLowerCase();
    if (token === "--campaignId") args.campaignId = String(argv[index + 1] || "").trim();
  }
  return args;
}

async function resolveOwnerId(explicitOwnerId, explicitOwnerEmail) {
  if (explicitOwnerId) return explicitOwnerId;
  if (explicitOwnerEmail) {
    const user = await prisma.user.findUnique({ where: { email: explicitOwnerEmail }, select: { id: true } });
    if (user?.id) return String(user.id);
  }
  const recent = await prisma.portalAiOutboundCallCampaign.findMany({
    select: { ownerId: true, updatedAt: true },
    orderBy: [{ updatedAt: "desc" }],
    take: DEFAULT_OWNER_TAKE,
  });
  return recent[0]?.ownerId ? String(recent[0].ownerId) : "";
}

async function ensureContacts(ownerId) {
  const demos = [
    { name: "Ava Johnson", email: "demo.ava.outbound@purely.dev", phone: "+15552010001" },
    { name: "Mason Lee", email: "demo.mason.outbound@purely.dev", phone: "+15552010002" },
    { name: "Sophia Turner", email: "demo.sophia.outbound@purely.dev", phone: "+15552010003" },
    { name: "Noah Carter", email: "demo.noah.outbound@purely.dev", phone: "+15552010004" },
  ];

  const contacts = [];
  for (const demo of demos) {
    const existing = await prisma.portalContact.findFirst({
      where: { ownerId, OR: [{ emailKey: emailKey(demo.email) }, { phoneKey: phoneKey(demo.phone) }] },
      select: { id: true },
    });

    if (existing?.id) {
      const updated = await prisma.portalContact.update({
        where: { id: existing.id },
        data: {
          name: demo.name,
          nameKey: nameKey(demo.name),
          email: demo.email,
          emailKey: emailKey(demo.email),
          phone: demo.phone,
          phoneKey: phoneKey(demo.phone),
        },
        select: { id: true, name: true, email: true, phone: true },
      });
      contacts.push(updated);
      continue;
    }

    const created = await prisma.portalContact.create({
      data: {
        id: hashId("pct", ownerId, demo.email),
        ownerId,
        name: demo.name,
        nameKey: nameKey(demo.name),
        email: demo.email,
        emailKey: emailKey(demo.email),
        phone: demo.phone,
        phoneKey: phoneKey(demo.phone),
      },
      select: { id: true, name: true, email: true, phone: true },
    });
    contacts.push(created);
  }

  return contacts;
}

async function ensureBookingSiteAndCalendar(ownerId) {
  let site = await prisma.portalBookingSite.findUnique({
    where: { ownerId },
    select: { id: true, slug: true, title: true, enabled: true, timeZone: true },
  });

  if (!site) {
    site = await prisma.portalBookingSite.create({
      data: {
        id: hashId("pbs", ownerId),
        ownerId,
        slug: `demo-book-${ownerId.slice(0, 8)}`,
        enabled: true,
        title: "Demo booked calls",
        description: "Seeded booked calls for AI Outbound UI review.",
        durationMinutes: 30,
        timeZone: "America/New_York",
        meetingLocation: "Purely Connect Video",
        meetingDetails: "Seeded demo booking created for AI Outbound review.",
      },
      select: { id: true, slug: true, title: true, enabled: true, timeZone: true },
    });
  } else if (!site.enabled) {
    site = await prisma.portalBookingSite.update({
      where: { ownerId },
      data: { enabled: true },
      select: { id: true, slug: true, title: true, enabled: true, timeZone: true },
    });
  }

  const setup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: BOOKING_CALENDAR_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const raw = setup?.dataJson && typeof setup.dataJson === "object" ? setup.dataJson : {};
  const calendars = Array.isArray(raw?.calendars) ? raw.calendars.slice(0, 25) : [];
  let calendarId = "demo-outbound-calendar";
  let nextCalendars = calendars;

  if (calendars.length > 0) {
    const firstId = typeof calendars[0]?.id === "string" ? calendars[0].id.trim() : "";
    calendarId = firstId || calendarId;
  } else {
    nextCalendars = [
      {
        id: calendarId,
        enabled: true,
        title: "Outbound booked calls demo",
        durationMinutes: 30,
        meetingLocation: "Purely Connect Video",
        meetingDetails: "Seeded outbound booking demo calendar.",
        notificationEmails: [],
      },
    ];
  }

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: BOOKING_CALENDAR_SERVICE_SLUG } },
    create: {
      ownerId,
      serviceSlug: BOOKING_CALENDAR_SERVICE_SLUG,
      status: "COMPLETE",
      dataJson: { version: 1, calendars: nextCalendars },
    },
    update: {
      status: "COMPLETE",
      dataJson: { version: 1, calendars: nextCalendars },
    },
    select: { ownerId: true },
  });

  return { site, calendarId };
}

async function seedBookings(ownerId, siteId, calendarId, contacts) {
  const rows = [
    {
      id: hashId("pbook", ownerId, "booking-1"),
      startAt: minutesFromNow(60),
      endAt: minutesFromNow(90),
      contact: contacts[0],
      notes: "Interested in the AI outbound booking flow demo.",
    },
    {
      id: hashId("pbook", ownerId, "booking-2"),
      startAt: minutesFromNow(210),
      endAt: minutesFromNow(240),
      contact: contacts[1],
      notes: "Requested a follow-up call after outbound outreach.",
    },
    {
      id: hashId("pbook", ownerId, "booking-3"),
      startAt: minutesFromNow(-180),
      endAt: minutesFromNow(-150),
      contact: contacts[2],
      notes: "Completed seeded booked-call example.",
    },
    {
      id: hashId("pbook", ownerId, "booking-4"),
      startAt: minutesFromNow(24 * 60 + 120),
      endAt: minutesFromNow(24 * 60 + 150),
      contact: contacts[3] ?? contacts[0],
      notes: "Tomorrow follow-up used for appointments day editing review.",
    },
    {
      id: hashId("pbook", ownerId, "booking-5"),
      startAt: minutesFromNow(3 * 24 * 60 + 180),
      endAt: minutesFromNow(3 * 24 * 60 + 210),
      contact: contacts[1],
      notes: "Later-this-week booking used for calendar view verification.",
    },
  ];

  for (const row of rows) {
    await prisma.portalBooking.upsert({
      where: { id: row.id },
      update: {
        siteId,
        calendarId,
        startAt: row.startAt,
        endAt: row.endAt,
        status: "SCHEDULED",
        contactId: row.contact.id,
        contactName: row.contact.name,
        contactEmail: row.contact.email,
        contactPhone: row.contact.phone,
        notes: row.notes,
        canceledAt: null,
      },
      create: {
        id: row.id,
        siteId,
        calendarId,
        startAt: row.startAt,
        endAt: row.endAt,
        status: "SCHEDULED",
        contactId: row.contact.id,
        contactName: row.contact.name,
        contactEmail: row.contact.email,
        contactPhone: row.contact.phone,
        notes: row.notes,
      },
    });
  }

  return rows.length;
}

async function seedCampaignActivity(ownerId, campaigns, contacts) {
  let callEnrollmentCount = 0;
  let messageEnrollmentCount = 0;
  let manualCallCount = 0;

  for (const [index, campaign] of campaigns.entries()) {
    const callSeeds = [
      { contact: contacts[0], status: "QUEUED", nextCallAt: minutesFromNow(20), attemptCount: 0, lastError: null, completedAt: null },
      { contact: contacts[1], status: "CALLING", nextCallAt: minutesFromNow(-2), attemptCount: 1, lastError: null, completedAt: null },
      { contact: contacts[2], status: "COMPLETED", nextCallAt: null, attemptCount: 1, lastError: null, completedAt: minutesFromNow(-70) },
      { contact: contacts[3], status: "FAILED", nextCallAt: null, attemptCount: 2, lastError: "Demo carrier failure for seeded activity.", completedAt: null },
    ];

    for (const seed of callSeeds) {
      await prisma.portalAiOutboundCallEnrollment.upsert({
        where: { campaignId_contactId: { campaignId: campaign.id, contactId: seed.contact.id } },
        update: {
          ownerId,
          status: seed.status,
          nextCallAt: seed.nextCallAt,
          attemptCount: seed.attemptCount,
          lastError: seed.lastError,
          completedAt: seed.completedAt,
          updatedAt: new Date(),
        },
        create: {
          id: hashId("pace", ownerId, campaign.id, seed.contact.id),
          ownerId,
          campaignId: campaign.id,
          contactId: seed.contact.id,
          status: seed.status,
          nextCallAt: seed.nextCallAt,
          attemptCount: seed.attemptCount,
          lastError: seed.lastError,
          completedAt: seed.completedAt,
        },
      });
      callEnrollmentCount += 1;
    }

    const messageSeeds = [
      { contact: contacts[0], status: "ACTIVE", source: "MANUAL", nextSendAt: null, sentFirstMessageAt: minutesFromNow(-32), attemptCount: 1, lastError: null, nextReplyAt: minutesFromNow(18), replyAttemptCount: 1, replyLastError: null },
      { contact: contacts[1], status: "QUEUED", source: "TAG", nextSendAt: minutesFromNow(15), sentFirstMessageAt: null, attemptCount: 0, lastError: null, nextReplyAt: null, replyAttemptCount: 0, replyLastError: null },
      { contact: contacts[2], status: "FAILED", source: "TAG", nextSendAt: null, sentFirstMessageAt: null, attemptCount: 2, lastError: "Delivery failed because the destination could not be reached.", nextReplyAt: null, replyAttemptCount: 0, replyLastError: null },
      { contact: contacts[3], status: "ACTIVE", source: "INBOUND", nextSendAt: null, sentFirstMessageAt: minutesFromNow(-142), attemptCount: 1, lastError: null, nextReplyAt: null, replyAttemptCount: 1, replyLastError: null },
    ];

    const threadIdByContactId = new Map();

    {
      const smsKey = makeSmsThreadKey(contacts[0].phone || "+15552010001");
      const threadId = await upsertDemoInboxThreadWithMessages({
        ownerId,
        contactId: contacts[0].id,
        channel: "SMS",
        threadKey: `${campaign.id}:sms:${smsKey.threadKey}`.slice(0, 260),
        peerAddress: smsKey.peerAddress,
        peerKey: smsKey.peerKey,
        subject: null,
        subjectKey: null,
        messages: [
          {
            direction: "OUT",
            fromAddress: "+15551230000",
            toAddress: contacts[0].phone || "+15552010001",
            bodyText: "Agent: Hey there, this is Purely Automation. Do you want me to send pricing or lock in a quick walkthrough?",
            createdAt: minutesFromNow(-32),
          },
          {
            direction: "IN",
            fromAddress: contacts[0].phone || "+15552010001",
            toAddress: "+15551230000",
            bodyText: "Contact: Send pricing first. If it looks good, I can do tomorrow at 2 PM.",
            createdAt: minutesFromNow(-28),
          },
          {
            direction: "OUT",
            fromAddress: "+15551230000",
            toAddress: contacts[0].phone || "+15552010001",
            bodyText: "Agent: Perfect. I sent pricing and penciled in tomorrow at 2 PM. I also have your best email and phone confirmed.",
            createdAt: minutesFromNow(-24),
          },
        ],
      });
      threadIdByContactId.set(contacts[0].id, threadId);
    }

    {
      const emailKey = makeEmailThreadKey(contacts[3].email || "demo.noah.outbound@purely.dev", `AI Outbound follow-up ${campaign.name}`);
      if (emailKey) {
        const threadId = await upsertDemoInboxThreadWithMessages({
          ownerId,
          contactId: contacts[3].id,
          channel: "EMAIL",
          threadKey: `${campaign.id}:email:${emailKey.threadKey}`.slice(0, 260),
          peerAddress: emailKey.peerAddress,
          peerKey: emailKey.peerKey,
          subject: emailKey.subject,
          subjectKey: emailKey.subjectKey,
          messages: [
            {
              direction: "OUT",
              fromAddress: "demo-full@purelyautomation.dev",
              toAddress: contacts[3].email || "demo.noah.outbound@purely.dev",
              bodyText: "Agent: Hi, thanks for reaching back out. Are mornings or afternoons better for a quick demo call?",
              createdAt: minutesFromNow(-142),
            },
            {
              direction: "IN",
              fromAddress: contacts[3].email || "demo.noah.outbound@purely.dev",
              toAddress: "demo-full@purelyautomation.dev",
              bodyText: "Contact: Afternoons are better. Can you send pricing before we book?",
              createdAt: minutesFromNow(-124),
            },
            {
              direction: "OUT",
              fromAddress: "demo-full@purelyautomation.dev",
              toAddress: contacts[3].email || "demo.noah.outbound@purely.dev",
              bodyText: "Agent: Absolutely. I sent the pricing breakdown and can hold tomorrow at 2 PM if that works for you.",
              createdAt: minutesFromNow(-118),
            },
          ],
        });
        threadIdByContactId.set(contacts[3].id, threadId);
      }
    }

    for (const seed of messageSeeds) {
      const seededThreadId = threadIdByContactId.get(seed.contact.id) || null;
      await prisma.portalAiOutboundMessageEnrollment.upsert({
        where: { campaignId_contactId: { campaignId: campaign.id, contactId: seed.contact.id } },
        update: {
          ownerId,
          status: seed.status,
          source: seed.source,
          channelPolicy: "BOTH",
          nextSendAt: seed.nextSendAt,
          sentFirstMessageAt: seed.sentFirstMessageAt,
          threadId: seed.status === "ACTIVE" || seed.status === "COMPLETED" ? seededThreadId : null,
          attemptCount: seed.attemptCount,
          lastError: seed.lastError,
          nextReplyAt: seed.nextReplyAt,
          replyAttemptCount: seed.replyAttemptCount,
          replyLastError: seed.replyLastError,
          updatedAt: new Date(),
        },
        create: {
          id: hashId("pame", ownerId, campaign.id, seed.contact.id),
          ownerId,
          campaignId: campaign.id,
          contactId: seed.contact.id,
          status: seed.status,
          source: seed.source,
          channelPolicy: "BOTH",
          nextSendAt: seed.nextSendAt,
          sentFirstMessageAt: seed.sentFirstMessageAt,
          threadId: seed.status === "ACTIVE" || seed.status === "COMPLETED" ? seededThreadId : null,
          attemptCount: seed.attemptCount,
          lastError: seed.lastError,
          nextReplyAt: seed.nextReplyAt,
          replyAttemptCount: seed.replyAttemptCount,
          replyLastError: seed.replyLastError,
        },
      });
      messageEnrollmentCount += 1;
    }

    const manualSeeds = [
      {
        suffix: `manual-complete-${index}`,
        toNumberE164: contacts[0].phone || "+15552019991",
        status: "COMPLETED",
        transcriptText: "Agent: Hi, this is Purely Automation following up on your request.\nContact: Yeah, I can talk for a minute.\nAgent: Perfect. Do you want to see pricing first or should we book the demo?\nContact: Pricing looks fine. Let’s book the demo for tomorrow at 2 PM.\nAgent: Great, I have tomorrow at 2 PM. I also confirmed your best email and phone for the invite.\nContact: Perfect, thank you.",
        recordingDurationSec: 214,
        lastError: null,
      },
      {
        suffix: `manual-failed-${index}`,
        toNumberE164: contacts[3].phone || "+15552019992",
        status: "FAILED",
        transcriptText: null,
        recordingDurationSec: 58,
        lastError: "Seeded demo no-answer outcome.",
      },
    ];

    for (const seed of manualSeeds) {
      await prisma.portalAiOutboundCallManualCall.upsert({
        where: { id: hashId("pamc", ownerId, campaign.id, seed.suffix) },
        update: {
          ownerId,
          campaignId: campaign.id,
          webhookToken: hashId("wh", ownerId, campaign.id, seed.suffix),
          toNumberE164: seed.toNumberE164,
          status: seed.status,
          callSid: `CA${hashId("sid", campaign.id, seed.suffix).slice(-20)}`,
          conversationId: `conv_${hashId("conv", campaign.id, seed.suffix).slice(-12)}`,
          recordingSid: `RE${hashId("rec", campaign.id, seed.suffix).slice(-20)}`,
          recordingDurationSec: seed.recordingDurationSec,
          transcriptText: seed.transcriptText,
          lastError: seed.lastError,
          updatedAt: new Date(),
        },
        create: {
          id: hashId("pamc", ownerId, campaign.id, seed.suffix),
          ownerId,
          campaignId: campaign.id,
          webhookToken: hashId("wh", ownerId, campaign.id, seed.suffix),
          toNumberE164: seed.toNumberE164,
          status: seed.status,
          callSid: `CA${hashId("sid", campaign.id, seed.suffix).slice(-20)}`,
          conversationId: `conv_${hashId("conv", campaign.id, seed.suffix).slice(-12)}`,
          recordingSid: `RE${hashId("rec", campaign.id, seed.suffix).slice(-20)}`,
          recordingDurationSec: seed.recordingDurationSec,
          transcriptText: seed.transcriptText,
          lastError: seed.lastError,
        },
      });
      manualCallCount += 1;
    }
  }

  return { callEnrollmentCount, messageEnrollmentCount, manualCallCount };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ownerId = await resolveOwnerId(args.ownerId, args.ownerEmail);
  if (!ownerId) {
    throw new Error("No AI Outbound campaigns found to seed.");
  }

  const campaigns = await prisma.portalAiOutboundCallCampaign.findMany({
    where: {
      ownerId,
      ...(args.campaignId ? { id: args.campaignId } : {}),
    },
    select: { id: true, name: true, status: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 3,
  });

  if (!campaigns.length) {
    throw new Error(`No campaigns found for owner ${ownerId}.`);
  }

  const contacts = await ensureContacts(ownerId);
  const booking = await ensureBookingSiteAndCalendar(ownerId);
  const bookingCount = await seedBookings(ownerId, booking.site.id, booking.calendarId, contacts);
  const activity = await seedCampaignActivity(ownerId, campaigns, contacts);

  console.log(JSON.stringify({
    ok: true,
    ownerId,
    campaignIds: campaigns.map((campaign) => campaign.id),
    bookingSiteId: booking.site.id,
    bookingCalendarId: booking.calendarId,
    seededContacts: contacts.map((contact) => ({ id: contact.id, email: contact.email })),
    bookingCount,
    ...activity,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
