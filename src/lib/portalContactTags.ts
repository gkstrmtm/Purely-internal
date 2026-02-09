import crypto from "crypto";

import { prisma } from "@/lib/db";
import { normalizeNameKey } from "@/lib/portalContacts";
import { ensurePortalContactsSchema } from "@/lib/portalContactsSchema";
import { ensurePortalContactTagsSchema } from "@/lib/portalContactTagsSchema";

export type ContactTag = {
  id: string;
  name: string;
  color: string | null;
};

function cuidish(prefix: string) {
  // Good enough for ids in runtime schema installers.
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function normalizeHexColorOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : null;
}

function normalizeTagPresetList(value: unknown): Array<{ label: string; color: string | null }> {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
    .map((p) => {
      const label = (typeof p.label === "string" ? p.label.trim() : "").slice(0, 40);
      const color = normalizeHexColorOrNull(p.color);
      return { label, color };
    })
    .filter((p) => Boolean(p.label))
    .slice(0, 10);
}

async function loadLeadScrapingTagPresets(ownerId: string): Promise<Array<{ label: string; color: string | null }>> {
  const row = await prisma.portalServiceSetup
    .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: "lead-scraping" } }, select: { dataJson: true } })
    .catch(() => null);

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : {};

  const presets = [
    ...normalizeTagPresetList(rec.tagPresets),
    ...normalizeTagPresetList((rec.b2b as any)?.tagPresets),
    ...normalizeTagPresetList((rec.b2c as any)?.tagPresets),
  ];

  const unique: Array<{ label: string; color: string | null }> = [];
  const seen = new Set<string>();
  for (const p of presets) {
    const key = normalizeNameKey(p.label);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
    if (unique.length >= 20) break;
  }

  if (unique.length) return unique;

  return [
    { label: "New", color: "#2563EB" },
    { label: "Follow-up", color: "#F59E0B" },
    { label: "Outbound sent", color: "#10B981" },
    { label: "Interested", color: "#7C3AED" },
    { label: "Not interested", color: "#64748B" },
  ];
}

export async function ensurePortalContactTagsReady(): Promise<void> {
  await ensurePortalContactsSchema();
  await ensurePortalContactTagsSchema();
}

export async function listOwnerContactTags(ownerId: string): Promise<ContactTag[]> {
  await ensurePortalContactTagsReady();

  try {
    const rows = await (prisma as any).portalContactTag.findMany({
      where: { ownerId },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, color: true },
    });

    return (rows || []).map((r: any) => ({
      id: String(r.id),
      name: String(r.name ?? "").slice(0, 60),
      color: typeof r.color === "string" ? String(r.color) : null,
    }));
  } catch {
    return [];
  }
}

/**
 * Best-effort seeding of global contact tags using Lead Scraping tag presets.
 * Idempotent: only creates missing tags by nameKey.
 */
export async function ensureOwnerContactTagsSeededFromLeadScrapingPresets(ownerIdRaw: string): Promise<void> {
  const ownerId = String(ownerIdRaw);
  if (!ownerId) return;

  const presets = await loadLeadScrapingTagPresets(ownerId).catch(() => []);
  if (!presets.length) return;

  const existing = await listOwnerContactTags(ownerId).catch(() => []);
  const existingKeys = new Set(existing.map((t) => normalizeNameKey(t.name)));

  for (const p of presets) {
    const key = normalizeNameKey(p.label);
    if (existingKeys.has(key)) continue;
    const created = await createOwnerContactTag({ ownerId, name: p.label, color: p.color }).catch(() => null);
    if (created) existingKeys.add(key);
  }
}

export async function createOwnerContactTag(opts: {
  ownerId: string;
  name: string;
  color?: string | null;
}): Promise<ContactTag | null> {
  await ensurePortalContactTagsReady();

  const ownerId = String(opts.ownerId);
  const name = String(opts.name ?? "").trim().slice(0, 60);
  if (!name) return null;

  const nameKey = normalizeNameKey(name);
  const color = normalizeHexColorOrNull(opts.color);

  try {
    const created = await (prisma as any).portalContactTag.create({
      data: {
        id: cuidish("pct"),
        ownerId,
        name,
        nameKey,
        color,
      },
      select: { id: true, name: true, color: true },
    });

    return { id: String(created.id), name: String(created.name), color: created.color ? String(created.color) : null };
  } catch {
    // If it already exists (unique ownerId+nameKey), fetch it.
    try {
      const existing = await (prisma as any).portalContactTag.findFirst({
        where: { ownerId, nameKey },
        select: { id: true, name: true, color: true },
      });
      if (!existing) return null;
      return {
        id: String(existing.id),
        name: String(existing.name),
        color: existing.color ? String(existing.color) : null,
      };
    } catch {
      return null;
    }
  }
}

export async function updateOwnerContactTag(opts: {
  ownerId: string;
  tagId: string;
  name?: string;
  color?: string | null;
}): Promise<ContactTag | null> {
  await ensurePortalContactTagsReady();

  const ownerId = String(opts.ownerId);
  const tagId = String(opts.tagId);
  const data: any = {};

  if (typeof opts.name === "string") {
    const name = opts.name.trim().slice(0, 60);
    data.name = name || "";
    data.nameKey = normalizeNameKey(name || "");
  }

  if (opts.color !== undefined) {
    data.color = normalizeHexColorOrNull(opts.color);
  }

  try {
    const updated = await (prisma as any).portalContactTag.updateMany({
      where: { id: tagId, ownerId },
      data,
    });
    if (!updated?.count) return null;

    const row = await (prisma as any).portalContactTag.findFirst({
      where: { id: tagId, ownerId },
      select: { id: true, name: true, color: true },
    });
    if (!row) return null;
    return { id: String(row.id), name: String(row.name), color: row.color ? String(row.color) : null };
  } catch {
    return null;
  }
}

export async function deleteOwnerContactTag(ownerIdRaw: string, tagIdRaw: string): Promise<boolean> {
  await ensurePortalContactTagsReady();

  const ownerId = String(ownerIdRaw);
  const tagId = String(tagIdRaw);

  try {
    await (prisma as any).portalContactTagAssignment.deleteMany({ where: { ownerId, tagId } });
  } catch {
    // ignore
  }

  try {
    const deleted = await (prisma as any).portalContactTag.deleteMany({ where: { ownerId, id: tagId } });
    return Boolean(deleted?.count);
  } catch {
    return false;
  }
}

export async function listContactTagsForContact(ownerIdRaw: string, contactIdRaw: string): Promise<ContactTag[]> {
  await ensurePortalContactTagsReady();

  const ownerId = String(ownerIdRaw);
  const contactId = String(contactIdRaw);

  try {
    const rows = await (prisma as any).portalContactTagAssignment.findMany({
      where: { ownerId, contactId },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: {
        tag: { select: { id: true, name: true, color: true } },
      },
    });

    return (rows || [])
      .map((r: any) => r?.tag)
      .filter(Boolean)
      .map((t: any) => ({ id: String(t.id), name: String(t.name), color: t.color ? String(t.color) : null }));
  } catch {
    return [];
  }
}

export async function addContactTagAssignment(opts: {
  ownerId: string;
  contactId: string;
  tagId: string;
}): Promise<boolean> {
  await ensurePortalContactTagsReady();

  const ownerId = String(opts.ownerId);
  const contactId = String(opts.contactId);
  const tagId = String(opts.tagId);

  try {
    // Upsert is idempotent (prevents double-tagging).
    await (prisma as any).portalContactTagAssignment.upsert({
      where: { contactId_tagId: { contactId, tagId } },
      create: { id: cuidish("pcta"), ownerId, contactId, tagId },
      update: {},
      select: { id: true },
    });
    return true;
  } catch {
    return false;
  }
}

export async function removeContactTagAssignment(opts: {
  ownerId: string;
  contactId: string;
  tagId: string;
}): Promise<boolean> {
  await ensurePortalContactTagsReady();

  const ownerId = String(opts.ownerId);
  const contactId = String(opts.contactId);
  const tagId = String(opts.tagId);

  try {
    await (prisma as any).portalContactTagAssignment.deleteMany({
      where: { ownerId, contactId, tagId },
    });
    return true;
  } catch {
    return false;
  }
}
