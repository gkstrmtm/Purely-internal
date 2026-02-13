const { PrismaClient } = require("@prisma/client");

function normalizeEmailKey(emailRaw) {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!email) return null;
  if (!email.includes("@")) return null;
  return email.slice(0, 120);
}

function normalizeSubjectKey(subjectRaw) {
  const subject = String(subjectRaw ?? "").trim();
  if (!subject) return "(no subject)";

  let s = subject;
  for (let i = 0; i < 8; i += 1) {
    const next = s.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "").trim();
    if (next === s) break;
    s = next;
  }

  return (s || "(no subject)").slice(0, 160);
}

function makeEmailThreadKey(peerEmail, subjectRaw) {
  const peerKey = normalizeEmailKey(peerEmail);
  if (!peerKey) return null;

  const subjectKey = normalizeSubjectKey(subjectRaw);
  const threadKey = `${peerKey}::${subjectKey.toLowerCase()}`;

  return {
    peerAddress: String(peerEmail ?? "").trim().slice(0, 200),
    peerKey,
    subject: String(subjectRaw ?? "").trim().slice(0, 200) || "(no subject)",
    subjectKey,
    threadKey: threadKey.slice(0, 260),
  };
}

function makeSmsThreadKey(peerE164) {
  const peer = String(peerE164 ?? "").trim();
  return { peerAddress: peer, peerKey: peer, threadKey: peer };
}

function previewFromBody(body) {
  const text = String(body ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, 240);
}

async function upsertMessage(prisma, opts) {
  const subject = typeof opts.subject === "string" ? opts.subject.trim().slice(0, 200) : null;
  const subjectKey = typeof opts.subjectKey === "string" ? opts.subjectKey.trim().slice(0, 160) : null;

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
      channel: opts.channel,
      threadKey: opts.threadKey,
      peerAddress: opts.peerAddress,
      peerKey: opts.peerKey,
      subject,
      subjectKey,
      lastMessageAt: opts.createdAt,
      lastMessagePreview: previewFromBody(opts.bodyText),
      lastMessageDirection: opts.direction,
      lastMessageFrom: String(opts.fromAddress ?? "").slice(0, 240),
      lastMessageTo: String(opts.toAddress ?? "").slice(0, 240),
      lastMessageSubject: subject,
    },
    update: {
      peerAddress: opts.peerAddress,
      peerKey: opts.peerKey,
      subject,
      subjectKey,
      lastMessageAt: opts.createdAt,
      lastMessagePreview: previewFromBody(opts.bodyText),
      lastMessageDirection: opts.direction,
      lastMessageFrom: String(opts.fromAddress ?? "").slice(0, 240),
      lastMessageTo: String(opts.toAddress ?? "").slice(0, 240),
      lastMessageSubject: subject,
    },
    select: { id: true },
  });

  const msg = await prisma.portalInboxMessage.create({
    data: {
      ownerId: opts.ownerId,
      threadId: thread.id,
      channel: opts.channel,
      direction: opts.direction,
      fromAddress: String(opts.fromAddress ?? "").slice(0, 240),
      toAddress: String(opts.toAddress ?? "").slice(0, 240),
      subject,
      bodyText: String(opts.bodyText ?? "").slice(0, 20000),
      provider: opts.provider ? String(opts.provider).slice(0, 40) : null,
      providerMessageId: opts.providerMessageId ? String(opts.providerMessageId).slice(0, 120) : null,
      createdAt: opts.createdAt,
    },
    select: { id: true },
  });

  return { threadId: thread.id, messageId: msg.id };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const fullEmail = "demo-full@purelyautomation.dev";

    const user = await prisma.user.findUnique({
      where: { email: fullEmail },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new Error(`User not found: ${fullEmail}`);
    }

    const existing = await prisma.portalInboxMessage.count({ where: { ownerId: user.id } });
    if (existing !== 0) {
      throw new Error(
        `Refusing to seed: demo user already has ${existing} portal inbox messages. ` +
          `Delete them first or use the force-reseed API.`,
      );
    }

    const now = Date.now();
    const minutesAgo = (m) => new Date(now - m * 60 * 1000);

    let inserted = 0;
    const distinctThreads = new Set();

    const seedEmailThread = async (peerEmail, subject, msgs) => {
      const key = makeEmailThreadKey(peerEmail, subject);
      if (!key) return;

      for (const msg of msgs) {
        const fromAddress = msg.dir === "IN" ? peerEmail : "no-reply@purelyautomation.com";
        const toAddress = msg.dir === "IN" ? fullEmail : peerEmail;
        await upsertMessage(prisma, {
          ownerId: user.id,
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
        inserted += 1;
        distinctThreads.add(`EMAIL:${key.threadKey}`);
      }
    };

    const seedSmsThread = async (peerE164, msgs) => {
      const key = makeSmsThreadKey(peerE164);
      for (const msg of msgs) {
        const fromAddress = msg.dir === "IN" ? peerE164 : "+15551230000";
        const toAddress = msg.dir === "IN" ? "+15551230000" : peerE164;
        await upsertMessage(prisma, {
          ownerId: user.id,
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
        inserted += 1;
        distinctThreads.add(`SMS:${key.threadKey}`);
      }
    };

    await seedEmailThread("sarah@acmehomes.com", "Follow up on your quote", [
      {
        dir: "IN",
        atMinAgo: 720,
        body: "Hi! Quick question — does your quote include installation and removal of the old unit?",
      },
      {
        dir: "OUT",
        atMinAgo: 700,
        body: "Yes — installation is included, and we can remove the old unit as well. Want me to send over a couple available time slots?",
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
        body: "Hello — attached is Invoice #10492. Let us know if you need anything.",
      },
      { dir: "OUT", atMinAgo: 2870, body: "Thanks! We received it and will process payment today." },
    ]);

    await seedEmailThread("alex@partnerships.example", "Partnership opportunity", [
      {
        dir: "IN",
        atMinAgo: 10080,
        body: "Hey there — I’d love to explore a partnership. Are you open to a quick call next week?",
      },
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

    const threadRows = await prisma.portalInboxThread.count({ where: { ownerId: user.id } });
    const messageRows = await prisma.portalInboxMessage.count({ where: { ownerId: user.id } });

    console.log(
      JSON.stringify(
        {
          ok: true,
          insertedMessages: inserted,
          seededThreads: distinctThreads.size,
          threadRows,
          messageRows,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
