import { prisma } from "@/lib/db";

export type BookingFormQuestionKind = "short" | "long";

export type BookingFormQuestion = {
  id: string;
  label: string;
  required: boolean;
  kind: BookingFormQuestionKind;
};

export type BookingFormConfig = {
  version: 1;
  phone: { enabled: boolean; required: boolean };
  notes: { enabled: boolean; required: boolean };
  questions: BookingFormQuestion[];
};

const SERVICE_SLUG = "booking_form";

function normalizeBool(v: unknown, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

function normalizeString(v: unknown, fallback: string) {
  return typeof v === "string" ? v : fallback;
}

function normalizeId(raw: unknown, fallback: string) {
  const v = typeof raw === "string" ? raw.trim() : "";
  // Keep it URL-safe-ish.
  const cleaned = v.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function normalizeQuestionKind(v: unknown): BookingFormQuestionKind {
  return v === "long" ? "long" : "short";
}

export function defaultBookingFormConfig(): BookingFormConfig {
  return {
    version: 1,
    phone: { enabled: true, required: false },
    notes: { enabled: true, required: false },
    questions: [],
  };
}

export function parseBookingFormConfig(value: unknown): BookingFormConfig {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const def = defaultBookingFormConfig();

  const phone = rec && typeof rec.phone === "object" && rec.phone ? (rec.phone as Record<string, unknown>) : null;
  const notes = rec && typeof rec.notes === "object" && rec.notes ? (rec.notes as Record<string, unknown>) : null;

  const rawQuestions = rec?.questions;
  const list = Array.isArray(rawQuestions) ? rawQuestions : [];

  const questions: BookingFormQuestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < list.length; i += 1) {
    const q = list[i] && typeof list[i] === "object" ? (list[i] as Record<string, unknown>) : null;
    if (!q) continue;

    const id = normalizeId(q.id, `q${i + 1}`);
    if (seen.has(id)) continue;
    seen.add(id);

    const label = normalizeString(q.label, "Question").trim().slice(0, 120);
    if (!label) continue;

    questions.push({
      id,
      label,
      required: normalizeBool(q.required, false),
      kind: normalizeQuestionKind(q.kind),
    });

    if (questions.length >= 20) break;
  }

  return {
    version: 1,
    phone: {
      enabled: normalizeBool(phone?.enabled, def.phone.enabled),
      required: normalizeBool(phone?.required, def.phone.required),
    },
    notes: {
      enabled: normalizeBool(notes?.enabled, def.notes.enabled),
      required: normalizeBool(notes?.required, def.notes.required),
    },
    questions,
  };
}

export async function getBookingFormConfig(ownerId: string): Promise<BookingFormConfig> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return parseBookingFormConfig(row?.dataJson);
}

export async function setBookingFormConfig(ownerId: string, config: BookingFormConfig): Promise<BookingFormConfig> {
  const normalized = parseBookingFormConfig(config);

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: normalized },
    update: { dataJson: normalized, status: "COMPLETE" },
    select: { dataJson: true },
  });

  return parseBookingFormConfig(row.dataJson);
}
