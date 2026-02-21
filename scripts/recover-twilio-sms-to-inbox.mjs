import { PrismaClient } from "@prisma/client";

function env(name, fallback = "") {
  const v = process.env[name];
  return typeof v === "string" ? v : fallback;
}

function requireEnv(name) {
  const v = env(name).trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function basicAuthHeader(accountSid, authToken) {
  const b64 = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return `Basic ${b64}`;
}

function asE164(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // Twilio typically returns E.164 already. Keep it simple.
  if (s.startsWith("+")) return s;
  if (/^\d+$/.test(s)) return `+${s}`;
  return s;
}

function previewFromBody(body) {
  return String(body || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

function parseTwilioDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

async function twilioFetchJson(url, { accountSid, authToken }) {
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: basicAuthHeader(accountSid, authToken) },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Twilio request failed (${res.status}): ${text.slice(0, 400)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Twilio returned non-JSON: ${text.slice(0, 400)}`);
  }
}

async function main() {
  const ownerId = requireEnv("RECOVER_OWNER_ID");
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  const fromNumber = asE164(requireEnv("TWILIO_FROM_NUMBER_E164"));

  const sinceIso = env("RECOVER_SINCE_ISO").trim();
  const untilIso = env("RECOVER_UNTIL_ISO").trim();
  const pageSize = Math.max(20, Math.min(1000, Number(env("RECOVER_PAGE_SIZE", "500")) || 500));
  const maxMessages = Math.max(1, Math.floor(Number(env("RECOVER_MAX_MESSAGES", "20000")) || 20000));
  const dryRun = env("RECOVER_DRY_RUN").trim() === "1";

  const sinceDate = sinceIso ? new Date(sinceIso) : null;
  const untilDate = untilIso ? new Date(untilIso) : null;
  if (sinceDate && Number.isNaN(sinceDate.getTime())) throw new Error("RECOVER_SINCE_ISO is not a valid date");
  if (untilDate && Number.isNaN(untilDate.getTime())) throw new Error("RECOVER_UNTIL_ISO is not a valid date");

  const prisma = new PrismaClient();

  let seen = 0;
  let inserted = 0;
  let skipped = 0;
  let filteredOut = 0;

  try {
    // Twilio uses a YYYY-MM-DD format for DateSent filters.
    const q = new URLSearchParams();
    q.set("PageSize", String(pageSize));
    if (sinceDate) q.set("DateSent>=", sinceDate.toISOString().slice(0, 10));
    if (untilDate) q.set("DateSent<=", untilDate.toISOString().slice(0, 10));

    let nextUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json?${q.toString()}`;

    while (nextUrl && seen < maxMessages) {
      const json = await twilioFetchJson(nextUrl, { accountSid, authToken });
      const msgs = Array.isArray(json?.messages) ? json.messages : [];

      for (const m of msgs) {
        if (seen >= maxMessages) break;
        seen += 1;

        const sid = String(m?.sid || "").trim();
        const from = asE164(m?.from);
        const to = asE164(m?.to);

        // Only import messages that involve the Twilio number.
        const involves = from === fromNumber || to === fromNumber;
        if (!involves) {
          filteredOut += 1;
          continue;
        }

        const direction = from === fromNumber ? "OUT" : "IN";
        const peer = direction === "OUT" ? to : from;
        if (!peer) {
          filteredOut += 1;
          continue;
        }

        const createdAt =
          parseTwilioDate(m?.date_sent) ||
          parseTwilioDate(m?.dateSent) ||
          parseTwilioDate(m?.date_created) ||
          parseTwilioDate(m?.dateCreated) ||
          new Date();

        if (sinceDate && createdAt < sinceDate) {
          filteredOut += 1;
          continue;
        }
        if (untilDate && createdAt > untilDate) {
          filteredOut += 1;
          continue;
        }

        const bodyText = String(m?.body || "").slice(0, 20000) || " ";

        if (sid) {
          const existing = await prisma.portalInboxMessage.findFirst({
            where: { ownerId, provider: "TWILIO", providerMessageId: sid },
            select: { id: true },
          });
          if (existing?.id) {
            skipped += 1;
            continue;
          }
        }

        if (dryRun) {
          inserted += 1;
          continue;
        }

        const thread = await prisma.portalInboxThread.upsert({
          where: { ownerId_channel_threadKey: { ownerId, channel: "SMS", threadKey: peer } },
          create: {
            ownerId,
            channel: "SMS",
            threadKey: peer,
            peerAddress: peer,
            peerKey: peer,
          },
          update: {
            // Keep peer fields up to date.
            peerAddress: peer,
            peerKey: peer,
          },
          select: { id: true },
        });

        await prisma.portalInboxMessage.create({
          data: {
            ownerId,
            threadId: thread.id,
            channel: "SMS",
            direction,
            fromAddress: from.slice(0, 240),
            toAddress: to.slice(0, 240),
            subject: null,
            bodyText,
            provider: "TWILIO",
            providerMessageId: sid || null,
            createdAt,
          },
          select: { id: true },
        });

        // Only update thread “last message” fields if this message is newer.
        const preview = previewFromBody(bodyText);
        await prisma.$executeRaw`
          UPDATE "PortalInboxThread"
          SET
            "peerAddress" = ${peer},
            "peerKey" = ${peer},
            "lastMessageAt" = ${createdAt},
            "lastMessagePreview" = ${preview},
            "lastMessageDirection" = ${direction},
            "lastMessageFrom" = ${from.slice(0, 240)},
            "lastMessageTo" = ${to.slice(0, 240)},
            "lastMessageSubject" = ${null},
            "updatedAt" = NOW()
          WHERE "id" = ${thread.id}
            AND "lastMessageAt" <= ${createdAt};
        `;

        inserted += 1;
      }

      const nextPageUri = typeof json?.next_page_uri === "string" ? json.next_page_uri : "";
      nextUrl = nextPageUri ? `https://api.twilio.com${nextPageUri}` : "";

      if (!msgs.length) break;
    }
  } finally {
    await prisma.$disconnect().catch(() => null);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        ownerId,
        fromNumber,
        dryRun,
        scanned: seen,
        inserted,
        skipped,
        filteredOut,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
