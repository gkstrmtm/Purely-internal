import { prisma } from "@/lib/db";

export type BookingFormQuestionKind = "short" | "long";

export type BookingFormChoiceQuestionKind = "single_choice" | "multiple_choice";

export type BookingFormAnyQuestionKind = BookingFormQuestionKind | BookingFormChoiceQuestionKind;

export type BookingFormQuestion = {
  id: string;
  label: string;
  required: boolean;
  kind: BookingFormAnyQuestionKind;
  options?: string[];
};

export type BookingFormConfig = {
  version: 1;
  thankYouMessage?: string;
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

function normalizeStringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function normalizeId(raw: unknown, fallback: string) {
  const v = typeof raw === "string" ? raw.trim() : "";
  // Keep it URL-safe-ish.
  const cleaned = v.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function normalizeQuestionKind(v: unknown): BookingFormAnyQuestionKind {
  if (v === "long") return "long";
  if (v === "single_choice") return "single_choice";
  if (v === "multiple_choice") return "multiple_choice";
  return "short";
}

function normalizeOptions(v: unknown): string[] {
  const list = Array.isArray(v) ? v : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== "string") continue;
    const s = item.trim().slice(0, 60);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 12) break;
  }
  return out;
}

export function defaultBookingFormConfig(): BookingFormConfig {
  return {
    version: 1,
    thankYouMessage: "",
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

    const kind = normalizeQuestionKind(q.kind);
    const options = normalizeOptions(q.options);
    const shouldHaveOptions = kind === "single_choice" || kind === "multiple_choice";

    questions.push({
      id,
      label,
      required: normalizeBool(q.required, false),
      kind,
      ...(shouldHaveOptions ? { options: options.length ? options : ["Option 1", "Option 2"] } : {}),
    });

    if (questions.length >= 20) break;
  }

  return {
    version: 1,
    thankYouMessage: (normalizeStringOrUndefined(rec?.thankYouMessage) ?? def.thankYouMessage)
      ?.trim()
      .slice(0, 500),
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
