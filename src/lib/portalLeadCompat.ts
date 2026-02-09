import { Prisma } from "@prisma/client";
import crypto from "crypto";

import { prisma } from "@/lib/db";
import { findOrCreatePortalContact } from "@/lib/portalContacts";
import { ensurePortalContactTagsReady } from "@/lib/portalContactTags";

export type PortalLeadCreateCompatInput = {
  ownerId: string;
  kind: "B2B" | "B2C";
  source: string;
  businessName: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  niche: string | null;
  placeId: string | null;
  dataJson: unknown | null;
};

export type PortalLeadCreateCompatResult = {
  id: string;
  businessName: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  niche: string | null;
};

function isMissingColumnError(e: unknown) {
  const anyErr = e as any;
  if (anyErr && typeof anyErr === "object" && typeof anyErr.code === "string") {
    // Prisma: column does not exist
    if (anyErr.code === "P2022") return true;
  }
  const msg = e instanceof Error ? e.message : "";
  return msg.includes("does not exist") && msg.includes("column");
}

function isMissingContactIdColumnError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return msg.includes("contactId") && msg.includes("does not exist");
}

function isUniqueViolation(e: unknown) {
  const anyErr = e as any;
  const msg = typeof anyErr?.message === "string" ? anyErr.message : "";
  return msg.includes("Unique constraint") || msg.includes("unique constraint") || msg.includes("P2002");
}

async function insertLegacyPortalLead(data: PortalLeadCreateCompatInput): Promise<PortalLeadCreateCompatResult | null> {
  const id = crypto.randomUUID();
  const dataJsonString = data.dataJson ? JSON.stringify(data.dataJson) : null;

  const rows = await prisma.$queryRaw<PortalLeadCreateCompatResult[]>`
    INSERT INTO "PortalLead" (
      "id",
      "ownerId",
      "source",
      "kind",
      "businessName",
      "phone",
      "website",
      "address",
      "niche",
      "placeId",
      "dataJson",
      "createdAt"
    )
    VALUES (
      ${id},
      ${data.ownerId},
      ${data.source},
      ${data.kind},
      ${data.businessName},
      ${data.phone},
      ${data.website},
      ${data.address},
      ${data.niche},
      ${data.placeId},
      ${dataJsonString}::jsonb,
      NOW()
    )
    ON CONFLICT DO NOTHING
    RETURNING "id", "businessName", "phone", "website", "address", "niche";
  `;

  return rows[0] ?? null;
}

async function insertLegacyPortalLeadWithContactId(
  data: PortalLeadCreateCompatInput,
  contactId: string | null,
): Promise<PortalLeadCreateCompatResult | null> {
  if (!contactId) return await insertLegacyPortalLead(data);

  const id = crypto.randomUUID();
  const dataJsonString = data.dataJson ? JSON.stringify(data.dataJson) : null;

  try {
    const rows = await prisma.$queryRaw<PortalLeadCreateCompatResult[]>`
      INSERT INTO "PortalLead" (
        "id",
        "ownerId",
        "source",
        "kind",
        "businessName",
        "phone",
        "website",
        "address",
        "niche",
        "placeId",
        "dataJson",
        "contactId",
        "createdAt"
      )
      VALUES (
        ${id},
        ${data.ownerId},
        ${data.source},
        ${data.kind},
        ${data.businessName},
        ${data.phone},
        ${data.website},
        ${data.address},
        ${data.niche},
        ${data.placeId},
        ${dataJsonString}::jsonb,
        ${contactId},
        NOW()
      )
      ON CONFLICT DO NOTHING
      RETURNING "id", "businessName", "phone", "website", "address", "niche";
    `;
    return rows[0] ?? null;
  } catch (e) {
    if (isMissingContactIdColumnError(e)) {
      return await insertLegacyPortalLead(data);
    }
    throw e;
  }
}

export async function createPortalLeadCompat(
  data: PortalLeadCreateCompatInput,
): Promise<PortalLeadCreateCompatResult | null> {
  let contactId: string | null = null;
  try {
    await ensurePortalContactTagsReady();
    contactId = await findOrCreatePortalContact({
      ownerId: data.ownerId,
      name: data.businessName,
      email: null,
      phone: data.phone,
    });
  } catch {
    // ignore
  }

  try {
    return await prisma.portalLead.create({
      data: {
        ownerId: data.ownerId,
        kind: data.kind as any,
        source: data.source as any,
        businessName: data.businessName,
        phone: data.phone,
        website: data.website,
        address: data.address,
        niche: data.niche,
        placeId: data.placeId,
        dataJson: (data.dataJson ?? Prisma.DbNull) as any,
        ...(contactId ? { contactId } : {}),
      },
      select: {
        id: true,
        businessName: true,
        phone: true,
        website: true,
        address: true,
        niche: true,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return null;
    if (!isMissingColumnError(e)) throw e;

    // Backwards compatible insert (when DB migrations haven't been applied yet).
    return await insertLegacyPortalLeadWithContactId(data, contactId);
  }
}
