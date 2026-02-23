import { trySendTransactionalEmail } from "@/lib/emailSender";
import { prisma } from "@/lib/db";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";

function safeOneLine(s: string) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMissingHrFollowUpSchemaError(err: unknown) {
  const rec = (err && typeof err === "object" ? (err as Record<string, unknown>) : null) ?? null;
  const code = typeof rec?.code === "string" ? rec.code : undefined;
  const message = String(rec?.message || "").toLowerCase();

  if (code === "P2021") return true; // Prisma: table does not exist
  if (message.includes("hrcandidatefollowup")) return true;
  if (message.includes("hrfollowupstatus") || message.includes("hrfollowupchannel")) return true;
  return false;
}

function renderHrTemplate(
  raw: string,
  vars: {
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
    interviewLink: string;
  },
) {
  const map: Record<string, string> = {
    firstName: vars.firstName,
    lastName: vars.lastName,
    fullName: vars.fullName,
    email: vars.email,
    phone: vars.phone,
    interviewLink: vars.interviewLink,
  };

  return String(raw || "").replace(/\{(firstName|lastName|fullName|email|phone|interviewLink)\}/g, (_, k: string) => {
    return map[k] ?? "";
  });
}

export async function processDueHrCandidateFollowUps(opts: { limit?: number } = {}) {
  const limit = Math.max(1, Math.min(500, Number(opts.limit || 200)));
  const now = new Date();

  try {
    const due = await prisma.hrCandidateFollowUp.findMany({
      where: { status: "PENDING", sendAt: { lte: now } },
      include: { candidate: true },
      orderBy: { sendAt: "asc" },
      take: limit,
    });

    let claimed = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const job of due) {
      const claim = await prisma.hrCandidateFollowUp.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: { status: "SENDING" },
      });

      if (claim.count !== 1) {
        skipped++;
        continue;
      }

      claimed++;

      const candidate = job.candidate;
      const fullName = safeOneLine(candidate.fullName || "");
      const parts = fullName.split(" ").filter(Boolean);
      const firstName = safeOneLine(parts[0] || "");
      const lastName = safeOneLine(parts.slice(1).join(" "));
      const interviewLink = "";

      const renderedSubject = renderHrTemplate(job.subject || "Following up", {
        firstName,
        lastName,
        fullName,
        email: safeOneLine(candidate.email || ""),
        phone: safeOneLine(candidate.phone || ""),
        interviewLink,
      });

      const renderedBody = renderHrTemplate(job.bodyText, {
        firstName,
        lastName,
        fullName,
        email: safeOneLine(candidate.email || ""),
        phone: safeOneLine(candidate.phone || ""),
        interviewLink,
      });

      try {
        if (job.channel === "EMAIL") {
          const res = await trySendTransactionalEmail({
            to: job.toAddress,
            subject: safeOneLine(renderedSubject).slice(0, 200) || "Following up",
            text: renderedBody || " ",
          });

          if (!res.ok) {
            failed++;
            await prisma.hrCandidateFollowUp.update({
              where: { id: job.id },
              data: { status: "FAILED", lastError: res.reason.slice(0, 1500) },
            });
            continue;
          }

          sent++;
          await prisma.hrCandidateFollowUp.update({
            where: { id: job.id },
            data: { status: "SENT", sentAt: new Date(), lastError: null },
          });
          continue;
        }

        if (job.channel === "SMS") {
          const res = await sendTwilioEnvSms({
            to: job.toAddress,
            body: renderedBody,
            fromNumberEnvKeys: ["TWILIO_HR_FROM_NUMBER", "TWILIO_FROM_NUMBER"],
          });

          if (!res.ok) {
            failed++;
            await prisma.hrCandidateFollowUp.update({
              where: { id: job.id },
              data: { status: "FAILED", lastError: res.reason.slice(0, 1500) },
            });
            continue;
          }

          sent++;
          await prisma.hrCandidateFollowUp.update({
            where: { id: job.id },
            data: { status: "SENT", sentAt: new Date(), lastError: null },
          });
          continue;
        }

        failed++;
        await prisma.hrCandidateFollowUp.update({
          where: { id: job.id },
          data: { status: "FAILED", lastError: `Unknown channel: ${job.channel}` },
        });
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.hrCandidateFollowUp.update({
          where: { id: job.id },
          data: { status: "FAILED", lastError: msg.slice(0, 1500) },
        });
      }
    }

    return { ok: true as const, checked: due.length, claimed, sent, failed, skipped };
  } catch (err) {
    if (isMissingHrFollowUpSchemaError(err)) {
      return { ok: true as const, skipped: true as const, reason: "HR follow-up schema not installed" };
    }
    throw err;
  }
}
