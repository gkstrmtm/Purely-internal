import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { consumeCredits } from "@/lib/credits";
import { generateText } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z
  .object({
    kind: z.enum(["SMS", "EMAIL"]),
    stepName: z.string().trim().max(80).optional(),
    prompt: z.string().trim().max(2000).optional(),
    existingSubject: z.string().trim().max(200).optional(),
    existingBody: z.string().trim().max(8000).optional(),
  })
  .strict();

function tryParseJsonDraft(s: string): null | { subject?: string; body?: string } {
  const t = s.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return null;
  try {
    const obj = JSON.parse(t);
    if (!obj || typeof obj !== "object") return null;
    const subject = typeof (obj as any).subject === "string" ? String((obj as any).subject) : undefined;
    const body = typeof (obj as any).body === "string" ? String((obj as any).body) : undefined;
    return { subject, body };
  } catch {
    return null;
  }
}

function parseSubjectBodyFallback(s: string): { subject?: string; body: string } {
  const raw = String(s || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return { body: "" };

  const lines = raw.split("\n");
  const first = (lines[0] || "").trim();
  if (/^subject\s*:/i.test(first)) {
    const subject = first.replace(/^subject\s*:/i, "").trim();
    const body = lines.slice(1).join("\n").trim();
    return { subject, body };
  }

  return { body: raw };
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("followUp");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }

  const { kind, stepName, prompt, existingSubject, existingBody } = parsed.data;

  const ownerId = auth.session.user.id;
  const needCredits = PORTAL_CREDIT_COSTS.aiDraftStep;
  const consumed = await consumeCredits(ownerId, needCredits);
  if (!consumed.ok) {
    return NextResponse.json(
      { ok: false, error: "INSUFFICIENT_CREDITS", code: "INSUFFICIENT_CREDITS", credits: consumed.state.balance },
      { status: 402 },
    );
  }

  const system =
    kind === "SMS"
      ? "You write short, practical follow-ups for a small business."
      : "You write friendly, concise follow-up emails for a small business.";

  const user = [
    "Draft the copy for a booking follow-up step.",
    stepName ? `Step: ${stepName}` : "",
    `Channel: ${kind}`,
    "",
    "Allowed variables (keep braces exactly):",
    "- {contact.firstName}, {contact.name}, {contact.email}, {contact.phone}, {contact.businessName}",
    "- {business.name}, {business.email}, {business.phone}",
    "- {owner.email}, {owner.phone}",
    "- {user.name}, {user.email}",
    "- {when}, {timeZone}, {location}, {meetingLink}",
    kind === "SMS" ? "Keep it under 320 characters if possible." : "",
    kind === "EMAIL" ? "Return a subject and body." : "",
    "",
    existingSubject ? `Existing subject: ${existingSubject}` : "",
    existingBody ? `Existing body: ${existingBody}` : "",
    prompt ? `Extra instruction: ${prompt}` : "",
    "",
    kind === "EMAIL"
      ? "Prefer returning JSON: {\"subject\": \"...\", \"body\": \"...\"}. If you don't return JSON, start with 'Subject: ...' on the first line."
      : "Return the SMS body only (no JSON needed).",
  ]
    .filter(Boolean)
    .join("\n");

  const content = await generateText({ system, user });

  if (kind === "EMAIL") {
    const fromJson = tryParseJsonDraft(content);
    if (fromJson?.body || fromJson?.subject) {
      return NextResponse.json({
        ok: true,
        subject: (fromJson.subject || "").slice(0, 200),
        body: (fromJson.body || "").slice(0, 8000),
      });
    }

    const parsedFallback = parseSubjectBodyFallback(content);
    return NextResponse.json({
      ok: true,
      subject: (parsedFallback.subject || "").slice(0, 200),
      body: (parsedFallback.body || "").slice(0, 8000),
    });
  }

  return NextResponse.json({ ok: true, body: String(content || "").trim().slice(0, 8000) });
}
