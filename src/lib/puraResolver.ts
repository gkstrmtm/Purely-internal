import { prisma } from "@/lib/db";
import { normalizeEmailKey, normalizeNameKey, normalizePhoneKey } from "@/lib/portalContacts";
import { createOwnerContactTag } from "@/lib/portalContactTags";
import { isPuraRef, type PuraRef } from "@/lib/puraPlanner";

function normalizePhoneLike(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const digits = s.replace(/[^0-9+]/g, "");
  if (!digits) return null;
  const cleaned = digits.startsWith("+") ? `+${digits.slice(1).replace(/\D+/g, "")}` : digits.replace(/\D+/g, "");
  if (cleaned.replace(/\D+/g, "").length < 8) return null;
  return cleaned.slice(0, 20);
}

function extractFirstEmailLike(textRaw: string): string | null {
  const t = String(textRaw || "");
  const m = /\b([A-Z0-9._%+-]{1,80}@[A-Z0-9.-]{1,120}\.[A-Z]{2,24})\b/i.exec(t);
  return m?.[1] ? String(m[1]).trim().slice(0, 140) : null;
}

async function resolveContactId(opts: {
  ownerId: string;
  hint: string;
}): Promise<
  | { kind: "ok"; contactId: string; contactName: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hint = String(opts.hint || "").trim();
  if (!hint) return { kind: "clarify", question: "Which contact should I use? Reply with a name, email, or phone." };

  const emailLike = extractFirstEmailLike(hint);
  const emailKey = emailLike ? normalizeEmailKey(emailLike) : null;
  const phoneLike = normalizePhoneLike(hint);
  const phoneKey = phoneLike ? normalizePhoneKey(phoneLike).phoneKey : null;
  const nameLike = hint.slice(0, 80);

  if (emailKey) {
    const rows = await (prisma as any).portalContact.findMany({
      where: { ownerId, emailKey },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, phone: true },
    });
    if (rows?.length === 1) {
      return { kind: "ok", contactId: String(rows[0].id), contactName: String(rows[0].name || "").trim() || emailLike || "Contact" };
    }
    if (rows?.length > 1) {
      const list = rows
        .slice(0, 5)
        .map((r: any) => {
          const bits = [r.email ? `email: ${r.email}` : null, r.phone ? `phone: ${r.phone}` : null].filter(Boolean).join(" · ");
          return `- ${String(r.name || "(No name)").trim()}${bits ? ` (${bits})` : ""}`;
        })
        .join("\n");
      return { kind: "clarify", question: `I found multiple matches for “${hint}”. Reply with the contact’s email or phone:\n\n${list}` };
    }
  }

  if (phoneKey) {
    const row = await (prisma as any).portalContact.findFirst({
      where: { ownerId, phoneKey },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    });
    if (row?.id) return { kind: "ok", contactId: String(row.id), contactName: String(row.name || "").trim() || phoneLike || "Contact" };
  }

  if (nameLike) {
    const rows = await (prisma as any).portalContact.findMany({
      where: { ownerId, nameKey: normalizeNameKey(nameLike) },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, phone: true },
    });
    if (rows?.length === 1) {
      return { kind: "ok", contactId: String(rows[0].id), contactName: String(rows[0].name || "").trim() || nameLike };
    }
    if (rows?.length > 1) {
      const list = rows
        .slice(0, 5)
        .map((r: any) => {
          const bits = [r.email ? `email: ${r.email}` : null, r.phone ? `phone: ${r.phone}` : null].filter(Boolean).join(" · ");
          return `- ${String(r.name || "(No name)").trim()}${bits ? ` (${bits})` : ""}`;
        })
        .join("\n");
      return { kind: "clarify", question: `I found multiple contacts named “${nameLike}”. Reply with the email or phone:\n\n${list}` };
    }
  }

  return { kind: "not_found", question: `I couldn’t find a contact for “${hint}”. Reply with their email or phone.` };
}

async function resolveContactTagId(opts: {
  ownerId: string;
  name: string;
  createIfMissing?: boolean;
}): Promise<{ kind: "ok"; tagId: string; tagName: string } | { kind: "missing"; message: string }> {
  const ownerId = String(opts.ownerId);
  const name = String(opts.name || "").trim().slice(0, 60);
  if (!name) return { kind: "missing", message: "Missing tag name." };

  const nameKey = normalizeNameKey(name);
  const row = await (prisma as any).portalContactTag
    .findFirst({ where: { ownerId, nameKey }, select: { id: true, name: true } })
    .catch(() => null);

  if (row?.id) return { kind: "ok", tagId: String(row.id), tagName: String(row.name) };

  if (opts.createIfMissing) {
    const created = await createOwnerContactTag({ ownerId, name }).catch(() => null);
    if (created?.id) return { kind: "ok", tagId: created.id, tagName: created.name };
  }

  return { kind: "missing", message: `No tag named “${name}” exists.` };
}

export type ResolveResult =
  | { ok: true; args: unknown; contextPatch?: Record<string, unknown> }
  | { ok: false; clarifyQuestion: string };

function deepMapRefs(v: unknown, f: (ref: PuraRef) => unknown): unknown {
  if (isPuraRef(v)) return f(v);
  if (Array.isArray(v)) return v.map((x) => deepMapRefs(x, f));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = deepMapRefs(val, f);
    }
    return out;
  }
  return v;
}

export async function resolvePlanArgs(opts: {
  ownerId: string;
  stepKey: string;
  args: Record<string, unknown>;
}): Promise<ResolveResult> {
  const ownerId = String(opts.ownerId);
  let resolvedContact: { id: string; name: string } | null = null;

  // First pass: resolve contact refs so tag refs can use contact context if needed later.
  const contactRefs: PuraRef[] = [];
  deepMapRefs(opts.args, (ref) => {
    if (ref.$ref === "contact") contactRefs.push(ref);
    return ref;
  });

  if (contactRefs.length) {
    const hint = String(contactRefs[0].hint || "").trim();
    const rc = await resolveContactId({ ownerId, hint });
    if (rc.kind === "ok") resolvedContact = { id: rc.contactId, name: rc.contactName };
    else return { ok: false, clarifyQuestion: rc.question };
  }

  const resolved = deepMapRefs(opts.args, (ref) => {
    if (ref.$ref === "contact") return resolvedContact?.id || null;
    if (ref.$ref === "contact_tag") {
      // Tag resolution depends on action intent.
      const createIfMissing = Boolean(ref.createIfMissing);
      return { __PURA_TAG_REF__: true, name: ref.name || ref.hint || "", createIfMissing };
    }
    return null;
  });

  // Second pass: replace tag placeholders.
  const withTags = await (async () => {
    const walk = async (v: unknown): Promise<unknown> => {
      if (Array.isArray(v)) return Promise.all(v.map(walk));
      if (v && typeof v === "object") {
        const o = v as any;
        if (o.__PURA_TAG_REF__ && typeof o.name === "string") {
          const createIfMissing = Boolean(o.createIfMissing);
          const rt = await resolveContactTagId({ ownerId, name: o.name, createIfMissing });
          if (rt.kind === "ok") return rt.tagId;
          // For remove operations, missing tag is not fatal; let executor handle via messaging.
          // But for add operations we usually set createIfMissing=true.
          return null;
        }
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(o)) out[k] = await walk(val);
        return out;
      }
      return v;
    };

    return walk(resolved);
  })();

  return {
    ok: true,
    args: withTags,
    contextPatch: resolvedContact ? { lastContact: resolvedContact } : undefined,
  };
}
