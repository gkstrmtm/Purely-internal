import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { parseCsv } from "@/lib/csv";
import { findOrCreatePortalContact, normalizePhoneKey } from "@/lib/portalContacts";
import { addContactTagAssignment, createOwnerContactTag, ensurePortalContactTagsReady } from "@/lib/portalContactTags";

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

  const dataRows = parsed.rows.slice(0, 5000);

  const hasTags = tagHeaders.length > 0;
  if (hasTags) {
    await ensurePortalContactTagsReady();
  }

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; error: string }> = [];

  let cursor = 0;
  const concurrency = 10;

  async function worker() {
    // eslint-disable-next-line no-constant-condition
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

        let phone: string | null = phoneRaw || null;
        if (phone) {
          const norm = normalizePhoneKey(phone);
          phone = norm.error ? null : norm.phone;
        }

        const contactId = await findOrCreatePortalContact({
          ownerId,
          name,
          email: emailRaw ? emailRaw : null,
          phone,
        });

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

        imported += 1;
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
    errors: errors.slice(0, 50),
  });
}
