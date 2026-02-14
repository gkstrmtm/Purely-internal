import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { normalizePhoneForStorage } from "@/lib/phone";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { sendMarketingEmail, sendMarketingSms } from "@/lib/marketingMessaging";

async function sendInternalEmail(subject: string, body: string) {
  await trySendTransactionalEmail({
    to: "purestayservice@gmail.com",
    subject,
    text: body,
    fromName: "Purely Automation",
  }).catch(() => null);
}

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(1).max(40),
  goals: z.string().trim().max(400).optional(),
  optedIn: z.boolean().optional().default(false),
});

async function pickDialerIdRoundRobin() {
  const dialers = await prisma.user.findMany({
    where: { role: "DIALER", active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (dialers.length === 0) return null;

  const counts = await prisma.leadAssignment.groupBy({
    by: ["userId"],
    where: { releasedAt: null, userId: { in: dialers.map((d) => d.id) } },
    _count: { _all: true },
  });

  const countMap = new Map(counts.map((c) => [c.userId, c._count._all] as const));

  let chosen = dialers[0];
  for (const d of dialers) {
    const curr = countMap.get(d.id) ?? 0;
    const best = countMap.get(chosen.id) ?? 0;
    if (curr < best) chosen = d;
  }

  return chosen.id;
}

async function assignLeadToDialer(leadId: string) {
  const dialerId = await pickDialerIdRoundRobin();
  if (!dialerId) return;

  await prisma.leadAssignment.createMany({
    data: [{ leadId, userId: dialerId }],
    skipDuplicates: true,
  });

  await prisma.lead.updateMany({
    where: { id: leadId },
    data: { status: "ASSIGNED" },
  });
}

function buildEmailBody(name: string) {
  return [
    `Hi ${name},`,
    "",
    "Thanks for reaching out and requesting a demo on our site.",
    "",
    "Here is how it works:",
    "1) Book a quick call so we can learn your workflow.",
    "2) We will map the best automation opportunities for your business.",
    "3) If it is a fit, we will help you get set up and launched.",
    "",
    "Book a time here:",
    "{{BOOK_URL}}",
  ].join("\n");
}

function buildEmailBodyForStep(opts: { name: string; bookUrl: string; stepIndex: number }) {
  const base = buildEmailBody(opts.name).replace("{{BOOK_URL}}", opts.bookUrl);

  const extra = (() => {
    switch (opts.stepIndex) {
      case 0:
        return "\n\nPick a time that works for you and we will tailor the call to your workflow.";
      case 1:
        return "\n\nQuick question: what is the number one thing you want automated right now?";
      case 2:
        return "\n\nIf you share your current process, we can usually spot a few high impact automations right away.";
      case 3:
        return "\n\nIf you still want to see it in action, book a time and we will map out next steps.";
      case 4:
        return "\n\nIf the timing was not right last week, no worries. Here is the booking link again.";
      case 5:
        return "\n\nLast check in. If you would like help automating this, grab a time here.";
      default:
        return "";
    }
  })();

  return base + extra;
}

function buildSmsBodyForStep(opts: { bookUrl: string; stepIndex: number }) {
  const prefix =
    opts.stepIndex === 0
      ? "Purely Automation: thanks for requesting a demo."
      : opts.stepIndex === 1
        ? "Purely Automation: quick follow up on your demo request."
        : opts.stepIndex === 2
          ? "Purely Automation: want help automating your workflow?"
          : opts.stepIndex === 3
            ? "Purely Automation: still want to see it in action?"
            : opts.stepIndex === 4
              ? "Purely Automation: checking back in."
              : "Purely Automation: last check in.";

  const suffix = "Reply STOP to opt out.";
  return `${prefix} Book a call here: ${opts.bookUrl} ${suffix}`;
}

function getMissingColumnFromP2022(err: unknown) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (err.code !== "P2022") return null;

  const meta = err.meta as unknown as { column?: string } | undefined;
  const raw = meta?.column;
  if (raw) return raw.includes(".") ? raw.split(".").pop() ?? raw : raw;

  const match = /The column `([^`]+)` does not exist/i.exec(err.message);
  const fromMessage = match?.[1] ?? null;
  if (!fromMessage) return null;
  return fromMessage.includes(".") ? fromMessage.split(".").pop() ?? fromMessage : fromMessage;
}

async function createLeadResilient(data: Record<string, unknown>) {
  const working: Record<string, unknown> = { ...data };

  for (let i = 0; i < 10; i++) {
    try {
      return await prisma.lead.create({
        data: working as never,
        // IMPORTANT: older databases may be missing optional columns that exist in Prisma schema.
        // Selecting only id prevents Prisma from trying to RETURN missing columns.
        select: { id: true },
      });
    } catch (err) {
      const missing = getMissingColumnFromP2022(err);
      if (!missing) throw err;

      if (missing in working) {
        delete working[missing];
        continue;
      }

      throw err;
    }
  }

  // Last-ditch fallback: try the bare minimum.
  return await prisma.lead.create({ data: working as never, select: { id: true } });
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      const field = first?.path?.[0];

      let message = "Please check your details and try again.";
      if (field === "name") message = "Please enter your name.";
      if (field === "company") message = "Please enter your company name.";
      if (field === "email") message = "Please enter a valid email address.";
      if (field === "phone") message = "Please enter a valid phone number.";

      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { name, company, email, phone, goals, optedIn } = parsed.data;
    const normalizedPhone = normalizePhoneForStorage(phone);
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400 });
    }

    const interestedService = goals?.trim() ? goals.trim() : null;

    // Always create a new lead for marketing requests.
    // (Lead fields are not unique; avoiding upsert prevents runtime errors.)
    const lead = await createLeadResilient({
      businessName: company,
      phone: normalizedPhone,
      contactName: name,
      contactEmail: email,
      interestedService: interestedService,
      source: "MARKETING",
      notes: goals?.trim() ? `Marketing demo request\nGoals: ${goals.trim()}` : "Marketing demo request",
    });

    const request = await prisma.marketingDemoRequest.upsert({
      where: { leadId: lead.id },
      update: { name, company, email, phone: normalizedPhone, optedIn },
      create: { leadId: lead.id, name, company, email, phone: normalizedPhone, optedIn },
    });

    // Route: demo-form-only leads should go to a dialer unless they book a call.
    // Booking flow releases dialer assignments when an appointment is created.
    try {
      await assignLeadToDialer(lead.id);
    } catch {
      // Best-effort; do not fail the marketing form if assignment fails.
    }

    const now = new Date();
    const origin = new URL(req.url).origin;

    // Nurture schedule: send step 0 immediately (inline), then queue follow-ups.
    // Follow-ups: +5m, +1h, +1d, +1w, +2w
    const offsetsMinutes = [0, 5, 60, 60 * 24, 60 * 24 * 7, 60 * 24 * 14];

    const immediateResults: Array<{ channel: "EMAIL" | "SMS"; ok: boolean; status: string; reason?: string }> = [];

    // Step 0: send immediately (best-effort), and persist a MarketingMessage row with final status.
    // This avoids needing the cron job to prove the SMS/email path works.
    try {
      const bookUrlEmail = new URL("/book-a-call", origin);
      bookUrlEmail.searchParams.set("r", request.id);
      bookUrlEmail.searchParams.set("utm_source", "demo_request");
      bookUrlEmail.searchParams.set("utm_medium", "email");
      bookUrlEmail.searchParams.set("utm_campaign", "nurture");

      const emailBody0 = buildEmailBodyForStep({ name, bookUrl: bookUrlEmail.toString(), stepIndex: 0 });
      const emailMsg = await prisma.marketingMessage.create({
        data: { requestId: request.id, channel: "EMAIL", to: email, body: emailBody0, sendAt: now },
      });

      const claimed = await prisma.marketingMessage.updateMany({
        where: { id: emailMsg.id, status: "PENDING" },
        data: { status: "PROCESSING" },
      });

      if (claimed.count > 0) {
        const r = await sendMarketingEmail({
          to: email,
          subject: "Your Purely Automation demo request",
          body: emailBody0,
        });

        if (r.ok) {
          await prisma.marketingMessage.update({
            where: { id: emailMsg.id },
            data: { status: "SENT", sentAt: new Date(), error: null },
          });
          immediateResults.push({ channel: "EMAIL", ok: true, status: "SENT" });
        } else if (r.skipped) {
          await prisma.marketingMessage.update({
            where: { id: emailMsg.id },
            data: { status: "SKIPPED", sentAt: new Date(), error: r.reason },
          });
          immediateResults.push({ channel: "EMAIL", ok: false, status: "SKIPPED", reason: r.reason });
        } else {
          await prisma.marketingMessage.update({
            where: { id: emailMsg.id },
            data: { status: "FAILED", error: r.reason },
          });
          immediateResults.push({ channel: "EMAIL", ok: false, status: "FAILED", reason: r.reason });
        }
      }
    } catch (e) {
      immediateResults.push({
        channel: "EMAIL",
        ok: false,
        status: "FAILED",
        reason: e instanceof Error ? e.message : "Unknown error",
      });
    }

    if (optedIn) {
      try {
        const bookUrlSms = new URL("/book-a-call", origin);
        bookUrlSms.searchParams.set("r", request.id);
        bookUrlSms.searchParams.set("utm_source", "demo_request");
        bookUrlSms.searchParams.set("utm_medium", "sms");
        bookUrlSms.searchParams.set("utm_campaign", "nurture");

        const smsBody0 = buildSmsBodyForStep({ bookUrl: bookUrlSms.toString(), stepIndex: 0 });
        const smsMsg = await prisma.marketingMessage.create({
          data: { requestId: request.id, channel: "SMS", to: normalizedPhone, body: smsBody0, sendAt: now },
        });

        const claimed = await prisma.marketingMessage.updateMany({
          where: { id: smsMsg.id, status: "PENDING" },
          data: { status: "PROCESSING" },
        });

        if (claimed.count > 0) {
          const r = await sendMarketingSms({ to: normalizedPhone, body: smsBody0 });

          if (r.ok) {
            await prisma.marketingMessage.update({
              where: { id: smsMsg.id },
              data: { status: "SENT", sentAt: new Date(), error: null },
            });
            immediateResults.push({ channel: "SMS", ok: true, status: "SENT" });
          } else if (r.skipped) {
            await prisma.marketingMessage.update({
              where: { id: smsMsg.id },
              data: { status: "SKIPPED", sentAt: new Date(), error: r.reason },
            });
            immediateResults.push({ channel: "SMS", ok: false, status: "SKIPPED", reason: r.reason });
          } else {
            await prisma.marketingMessage.update({
              where: { id: smsMsg.id },
              data: { status: "FAILED", error: r.reason },
            });
            immediateResults.push({ channel: "SMS", ok: false, status: "FAILED", reason: r.reason });
          }
        }
      } catch (e) {
        immediateResults.push({
          channel: "SMS",
          ok: false,
          status: "FAILED",
          reason: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    const messages: Array<{
      requestId: string;
      channel: "EMAIL" | "SMS";
      to: string;
      body: string;
      sendAt: Date;
    }> = [];

    // Queue steps 1..N for the cron processor.
    for (let i = 1; i < offsetsMinutes.length; i++) {
      const sendAt = new Date(now.getTime() + offsetsMinutes[i] * 60_000);

      const bookUrlEmail = new URL("/book-a-call", origin);
      bookUrlEmail.searchParams.set("r", request.id);
      bookUrlEmail.searchParams.set("utm_source", "demo_request");
      bookUrlEmail.searchParams.set("utm_medium", "email");
      bookUrlEmail.searchParams.set("utm_campaign", "nurture");

      const emailBody = buildEmailBodyForStep({ name, bookUrl: bookUrlEmail.toString(), stepIndex: i });
      messages.push({ requestId: request.id, channel: "EMAIL", to: email, body: emailBody, sendAt });

      if (optedIn) {
        const bookUrlSms = new URL("/book-a-call", origin);
        bookUrlSms.searchParams.set("r", request.id);
        bookUrlSms.searchParams.set("utm_source", "demo_request");
        bookUrlSms.searchParams.set("utm_medium", "sms");
        bookUrlSms.searchParams.set("utm_campaign", "nurture");

        const smsBody = buildSmsBodyForStep({ bookUrl: bookUrlSms.toString(), stepIndex: i });
        messages.push({ requestId: request.id, channel: "SMS", to: normalizedPhone, body: smsBody, sendAt });
      }
    }

    // Best-effort: the form submission should succeed even if follow-up scheduling breaks.
    try {
      await prisma.marketingMessage.createMany({ data: messages });
    } catch {
      // Swallow message-scheduling failures.
    }

    // Best-effort internal notification.
    try {
      const subject = "New demo request";
      const body = [
        "A new demo request was submitted.",
        "",
        `Name: ${name}`,
        `Company: ${company}`,
        `Email: ${email}`,
        `Phone: ${normalizedPhone}`,
        goals?.trim() ? `Goals: ${goals.trim()}` : null,
        `Opted in: ${optedIn ? "yes" : "no"}`,
        immediateResults.length
          ? [
              "",
              "Immediate nurture sends:",
              ...immediateResults.map((r) => `- ${r.channel}: ${r.status}${r.reason ? ` (${r.reason})` : ""}`),
            ].join("\n")
          : null,
        "",
        `LeadId: ${lead.id}`,
        `RequestId: ${request.id}`,
      ]
        .filter(Boolean)
        .join("\n");

      await sendInternalEmail(subject, body);
    } catch {
      // Swallow internal-email failures.
    }

    return NextResponse.json({ requestId: request.id, leadId: lead.id });
  } catch (err) {
    console.error("/api/marketing/demo-request failed", err);
    // Ensure the client always receives JSON (not a generic HTML 500).
    return NextResponse.json(
      { error: "Submit failed. Please try again." },
      { status: 500 },
    );
  }
}
