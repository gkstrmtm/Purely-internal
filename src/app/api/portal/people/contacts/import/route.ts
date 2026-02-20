import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { parseCsv } from "@/lib/csv";
import {
  findOrCreatePortalContact,
  normalizeEmailKey,
  normalizeNameKey,
  normalizePhoneKey,
} from "@/lib/portalContacts";
import { addContactTagAssignment, createOwnerContactTag, ensurePortalContactTagsReady } from "@/lib/portalContactTags";
import { ensurePortalContactsSchema } from "@/lib/portalContactsSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Mapping = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string | null;
};

type ExistingContact = {
  id: string;
  name: string;
  nameKey: string;
  emailKey: string | null;
  phoneKey: string | null;
};

function normalizeNamePartKey(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 60);
}

function splitNameParts(nameRaw: string): { firstKey: string | null; lastKey: string | null } {
  const name = String(nameRaw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!name) return { firstKey: null, lastKey: null };

  const parts = name.split(" ").filter(Boolean);
  if (!parts.length) return { firstKey: null, lastKey: null };
  if (parts.length === 1) return { firstKey: normalizeNamePartKey(parts[0]!), lastKey: null };
  return {
    firstKey: normalizeNamePartKey(parts[0]!),
    lastKey: normalizeNamePartKey(parts[parts.length - 1]!),
  };
}

function matchCount3Plus(input: {
  existing: ExistingContact;
  row: {
    nameKey: string;
    firstKey: string | null;
    lastKey: string | null;
    emailKey: string | null;
    phoneKey: string | null;
  };
}): number {
  const { existing, row } = input;
  const existingParts = splitNameParts(existing.name);

  let matches = 0;

  if (row.emailKey && existing.emailKey && row.emailKey === existing.emailKey) matches += 1;
  if (row.phoneKey && existing.phoneKey && row.phoneKey === existing.phoneKey) matches += 1;

  // If CSV provides first/last explicitly, do not double-count full name.
  if (row.firstKey && existingParts.firstKey && row.firstKey === existingParts.firstKey) matches += 1;
  if (row.lastKey && existingParts.lastKey && row.lastKey === existingParts.lastKey) matches += 1;
  if (!row.firstKey && !row.lastKey && row.nameKey && existing.nameKey === row.nameKey) matches += 1;

  return matches;
}

function normalizeHeaderKey(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function guessHeader(headers: string[], patterns: string[]): string | null {
  const scored = headers
    .map((h) => {
      const key = normalizeHeaderKey(h);
      let score = 0;
      for (const p of patterns) {
        if (key === p) score = Math.max(score, 100);
        else if (key.includes(p)) score = Math.max(score, 50);
      }
      return { header: h, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score ? scored[0].header : null;
}

function normalizeMapping(input: unknown, headers: string[]): Mapping {
  const obj = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

  function pick(k: string): string | null {
    const v = typeof obj[k] === "string" ? (obj[k] as string).trim() : "";
    if (!v) return null;
    return headers.includes(v) ? v : null;
  }

  const name = pick("name") ?? guessHeader(headers, ["fullname", "name", "contactname", "leadname"]);
  const firstName = pick("firstName") ?? guessHeader(headers, ["firstname", "fname", "first"]);
  const lastName = pick("lastName") ?? guessHeader(headers, ["lastname", "lname", "last", "surname"]);
  const email = pick("email") ?? guessHeader(headers, ["email", "emailaddress"]);
  const phone = pick("phone") ?? guessHeader(headers, ["phone", "phonenumber", "mobile", "cell", "tel"]);
  const tags = pick("tags") ?? guessHeader(headers, ["tags", "tag", "labels", "label"]);

  return { name, firstName, lastName, email, phone, tags };
}

function splitTags(raw: string): string[] {
  const s = String(raw || "").trim();
  if (!s) return [];
  const parts = s
    .split(/[\n\r,;|]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const key = normalizeHeaderKey(p);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p.slice(0, 60));
    if (unique.length >= 10) break;
  }
  return unique;
}

function detectTagHeaders(headers: string[]): string[] {
  const out: string[] = [];
  for (const h of headers) {
    const key = normalizeHeaderKey(h);
    if (!key) continue;

    // Common CRM exports: Tags, Tag, Labels, Label, Tag 1, Tag 2, Label1...
    if (/^(tags?|labels?)(\d+)?$/.test(key)) {
      out.push(h);
      continue;
    }

    // Slightly looser (handles "contact_tags", "lead-labels"), but avoid very generic matches.
    if (key.includes("tags") || key.includes("labels")) {
      out.push(h);
      continue;
    }
  }

  // Dedupe preserving order.
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const h of out) {
    const k = normalizeHeaderKey(h);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(h);
  }
  return uniq.slice(0, 8);
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("people", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });

  const file = form.get("file");
  if (!file || typeof (file as any).text !== "function") {
    return NextResponse.json({ ok: false, error: "Missing CSV file" }, { status: 400 });
  }

  const mappingRaw = form.get("mapping");
  const mappingJson = typeof mappingRaw === "string" ? mappingRaw : "";

  const allowDuplicates = String(form.get("allowDuplicates") || "").trim() === "1";
  const onlyRowIndexesRaw = form.get("onlyRowIndexes");
  let onlyRowIndexes: number[] | null = null;
  if (typeof onlyRowIndexesRaw === "string" && onlyRowIndexesRaw.trim()) {
    try {
      const parsed = JSON.parse(onlyRowIndexesRaw);
      if (Array.isArray(parsed)) {
        onlyRowIndexes = parsed
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n >= 0)
          .map((n) => Math.floor(n));
      }
    } catch {
      onlyRowIndexes = null;
    }
  }

  const csvText = await (file as Blob).text().catch(() => "");
  if (!csvText.trim()) return NextResponse.json({ ok: false, error: "Empty CSV" }, { status: 400 });

  const parsed = parseCsv(csvText, { maxRows: 20000 });
  const headers = parsed.headers.filter((h) => Boolean(String(h || "").trim()));
  if (!headers.length) return NextResponse.json({ ok: false, error: "CSV must include a header row" }, { status: 400 });

  let mappingParsed: unknown = null;
  if (mappingJson.trim()) {
    try {
      mappingParsed = JSON.parse(mappingJson);
    } catch {
      mappingParsed = null;
    }
  }

  const mapping = normalizeMapping(mappingParsed, headers);

  const tagHeaders = mapping.tags ? [mapping.tags] : detectTagHeaders(headers);

  const headerIndex = new Map<string, number>();
  headers.forEach((h, idx) => headerIndex.set(h, idx));

  function getCell(row: string[], header: string | null | undefined): string {
    if (!header) return "";
    const idx = headerIndex.get(header);
    if (idx === undefined) return "";
    return String(row[idx] ?? "").trim();
  }

  const allDataRows = parsed.rows.slice(0, 5000);
  const selectedRowIndexes = onlyRowIndexes?.length
    ? Array.from(new Set(onlyRowIndexes)).filter((i) => i >= 0 && i < allDataRows.length)
    : null;
  const dataRows = selectedRowIndexes ? selectedRowIndexes.map((i) => allDataRows[i] || []) : allDataRows;

  const hasTags = tagHeaders.length > 0;
  if (hasTags) {
    await ensurePortalContactTagsReady();
  }

  let imported = 0;
  let skipped = 0;
  let skippedDuplicates = 0;
  const duplicateRowIndexes: number[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  // Preload existing contacts that might match (by email/phone) so we can detect 3+ field duplicates.
  let existingByEmail = new Map<string, ExistingContact[]>();
  let existingByPhone = new Map<string, ExistingContact[]>();
  try {
    await ensurePortalContactsSchema();

    const emailKeys: string[] = [];
    const phoneKeys: string[] = [];

    // Build keys from the full dataset, even if we are importing only a subset.
    for (const row of allDataRows) {
      const emailRaw = getCell(row, mapping.email);
      const phoneRaw = getCell(row, mapping.phone);
      const ek = normalizeEmailKey(emailRaw);
      const pk = normalizePhoneKey(phoneRaw).phoneKey;
      if (ek) emailKeys.push(ek);
      if (pk) phoneKeys.push(pk);
    }

    const uniqEmail = Array.from(new Set(emailKeys)).slice(0, 5000);
    const uniqPhone = Array.from(new Set(phoneKeys)).slice(0, 5000);

    if (uniqEmail.length || uniqPhone.length) {
      const existing = (await (prisma as any).portalContact.findMany({
        where: {
          ownerId,
          OR: [
            ...(uniqEmail.length ? [{ emailKey: { in: uniqEmail } }] : []),
            ...(uniqPhone.length ? [{ phoneKey: { in: uniqPhone } }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          nameKey: true,
          emailKey: true,
          phoneKey: true,
        },
        take: 5000,
      })) as ExistingContact[];

      for (const c of existing) {
        const ek = c.emailKey ? String(c.emailKey) : "";
        const pk = c.phoneKey ? String(c.phoneKey) : "";
        if (ek) {
          const arr = existingByEmail.get(ek) ?? [];
          arr.push(c);
          existingByEmail.set(ek, arr);
        }
        if (pk) {
          const arr = existingByPhone.get(pk) ?? [];
          arr.push(c);
          existingByPhone.set(pk, arr);
        }
      }
    }
  } catch {
    // If the PortalContact schema isn't ready, do not block imports.
    existingByEmail = new Map();
    existingByPhone = new Map();
  }

  let cursor = 0;
  const concurrency = 10;

  async function worker() {
    while (true) {
      const rowIndex = cursor++;
      if (rowIndex >= dataRows.length) return;
      const row = dataRows[rowIndex] || [];

      try {
        const emailRaw = getCell(row, mapping.email);
        const phoneRaw = getCell(row, mapping.phone);

        let name = getCell(row, mapping.name);
        if (!name) {
          const first = getCell(row, mapping.firstName);
          const last = getCell(row, mapping.lastName);
          name = `${first} ${last}`.trim();
        }

        if (!name) {
          if (emailRaw) name = emailRaw;
          else if (phoneRaw) name = phoneRaw;
        }

        if (!name) {
          skipped += 1;
          return;
        }

        const emailKey = normalizeEmailKey(emailRaw);
        const phoneNorm = normalizePhoneKey(phoneRaw);

        const nameKey = normalizeNameKey(name);
        const rowFirstRaw = getCell(row, mapping.firstName);
        const rowLastRaw = getCell(row, mapping.lastName);
        const firstKey = rowFirstRaw ? normalizeNamePartKey(rowFirstRaw) : null;
        const lastKey = rowLastRaw ? normalizeNamePartKey(rowLastRaw) : null;

        let isDuplicate = false;

        if (!allowDuplicates && (emailKey || phoneNorm.phoneKey)) {
          const candidates: ExistingContact[] = [];
          if (emailKey) candidates.push(...(existingByEmail.get(emailKey) ?? []));
          if (phoneNorm.phoneKey) candidates.push(...(existingByPhone.get(phoneNorm.phoneKey) ?? []));
          if (candidates.length) {
            let best = 0;
            for (const c of candidates) {
              const score = matchCount3Plus({
                existing: c,
                row: {
                  nameKey,
                  firstKey,
                  lastKey,
                  emailKey,
                  phoneKey: phoneNorm.phoneKey,
                },
              });
              if (score > best) best = score;
              if (best >= 3) break;
            }

            if (best >= 3) {
              isDuplicate = true;
              skippedDuplicates += 1;

              // Always report indexes relative to the original CSV data rows.
              duplicateRowIndexes.push(selectedRowIndexes ? (selectedRowIndexes[rowIndex] ?? rowIndex) : rowIndex);
            }
          }
        }

        let phone: string | null = phoneRaw || null;
        if (phone) {
          phone = phoneNorm.error ? null : phoneNorm.phone;
        }

        const contactId = await (async () => {
          if (!allowDuplicates) {
            return findOrCreatePortalContact({
              ownerId,
              name,
              email: emailRaw ? emailRaw : null,
              phone,
            });
          }

          // Force-create a new contact even if it matches existing ones.
          try {
            await ensurePortalContactsSchema();
            const created = await (prisma as any).portalContact.create({
              data: {
                ownerId,
                name: String(name).trim().slice(0, 80),
                nameKey,
                email: emailKey ? String(emailRaw || "").trim().slice(0, 120) : null,
                emailKey: emailKey ? emailKey : null,
                phone: phoneNorm.phoneKey && phone ? phone : null,
                phoneKey: phoneNorm.phoneKey ? phoneNorm.phoneKey : null,
              },
              select: { id: true },
            });
            return String(created.id);
          } catch {
            return null;
          }
        })();

        if (!contactId) {
          skipped += 1;
          return;
        }

        if (hasTags) {
          const combined: string[] = [];
          for (const h of tagHeaders) {
            combined.push(...splitTags(getCell(row, h)));
            if (combined.length >= 10) break;
          }

          const uniq: string[] = [];
          const seen = new Set<string>();
          for (const t of combined) {
            const k = normalizeHeaderKey(t);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            uniq.push(t);
            if (uniq.length >= 10) break;
          }

          for (const tagName of uniq) {
            const tag = await createOwnerContactTag({ ownerId, name: tagName }).catch(() => null);
            if (tag?.id) await addContactTagAssignment({ ownerId, contactId, tagId: tag.id }).catch(() => null);
          }
        }

        if (!isDuplicate || allowDuplicates) imported += 1;
      } catch (e: any) {
        errors.push({ row: rowIndex + 2, error: String(e?.message || "Failed") });
        skipped += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return NextResponse.json({
    ok: true,
    headers,
    processedRows: dataRows.length,
    imported,
    skipped,
    skippedDuplicates,
    duplicateRowIndexes,
    errors: errors.slice(0, 50),
  });
}
