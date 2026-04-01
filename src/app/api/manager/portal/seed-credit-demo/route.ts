import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeEmailKey, normalizeNameKey, normalizePhoneKey } from "@/lib/portalContacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_TARGET_EMAIL = "shotbygkstr@gmail.com";
const SEED_SETUP_SLUG = "__credit_demo_seed";

const bodySchema = z
  .object({
    email: z.string().trim().min(3).optional(),
    force: z.boolean().optional(),
  })
  .optional();

type DemoContactSeed = {
  name: string;
  email: string;
  phone: string;
};

type DemoReportItemSeed = {
  bureau: string;
  kind: string;
  label: string;
  auditTag: "PENDING" | "NEGATIVE" | "POSITIVE";
  disputeStatus: string | null;
  detailsJson: Record<string, unknown>;
};

function toErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function requireManager(session: any) {
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return { ok: false as const, status: 401 as const, userId: null as any };
  if (role !== "MANAGER" && role !== "ADMIN") return { ok: false as const, status: 403 as const, userId };
  return { ok: true as const, status: 200 as const, userId };
}

async function upsertDemoContact(ownerId: string, seed: DemoContactSeed) {
  const nameKey = normalizeNameKey(seed.name);
  const emailKey = normalizeEmailKey(seed.email);
  const phoneNorm = normalizePhoneKey(seed.phone);
  const phoneKey = phoneNorm.phoneKey;
  const phone = phoneNorm.phone;

  const existing = await prisma.portalContact.findFirst({
    where: {
      ownerId,
      OR: [
        { nameKey },
        ...(emailKey ? [{ emailKey }] : []),
        ...(phoneKey ? [{ phoneKey }] : []),
      ],
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.portalContact.update({
      where: { id: existing.id },
      data: {
        name: seed.name,
        nameKey,
        email: seed.email,
        emailKey,
        phone,
        phoneKey,
      },
      select: { id: true, name: true, email: true, phone: true },
    });
  }

  return prisma.portalContact.create({
    data: {
      ownerId,
      name: seed.name,
      nameKey,
      email: seed.email,
      emailKey,
      phone,
      phoneKey,
    },
    select: { id: true, name: true, email: true, phone: true },
  });
}

async function createReport(ownerId: string, contactId: string, importedAt: Date, provider: string, items: DemoReportItemSeed[]) {
  const report = await prisma.creditReport.create({
    data: {
      ownerId,
      contactId,
      provider,
      rawJson: {
        items: items.map((item) => ({
          bureau: item.bureau,
          kind: item.kind,
          label: item.label,
          ...item.detailsJson,
        })),
      } as any,
      importedAt,
      createdAt: importedAt,
    },
    select: { id: true },
  });

  await prisma.creditReportItem.createMany({
    data: items.map((item, index) => ({
      reportId: report.id,
      bureau: item.bureau,
      kind: item.kind,
      label: item.label,
      detailsJson: item.detailsJson as any,
      auditTag: item.auditTag,
      disputeStatus: item.disputeStatus,
      createdAt: new Date(importedAt.getTime() + index * 60 * 1000),
      updatedAt: new Date(importedAt.getTime() + index * 60 * 1000),
    })),
  });

  return report.id;
}

async function createPull(ownerId: string, contactId: string, requestedAt: Date, rawJson: Record<string, unknown>) {
  const pull = await prisma.creditPull.create({
    data: {
      ownerId,
      contactId,
      provider: "DEMO",
      status: "SUCCESS",
      requestedAt,
      completedAt: new Date(requestedAt.getTime() + 5 * 60 * 1000),
      rawJson: rawJson as any,
      createdAt: requestedAt,
      updatedAt: new Date(requestedAt.getTime() + 5 * 60 * 1000),
    },
    select: { id: true },
  });
  return pull.id;
}

async function createLetter(input: {
  ownerId: string;
  contactId: string;
  creditPullId?: string | null;
  subject: string;
  bodyText: string;
  status: "DRAFT" | "GENERATED" | "SENT";
  createdAt: Date;
  generatedAt?: Date | null;
  sentAt?: Date | null;
  lastSentTo?: string | null;
}) {
  const letter = await prisma.creditDisputeLetter.create({
    data: {
      ownerId: input.ownerId,
      contactId: input.contactId,
      creditPullId: input.creditPullId || null,
      subject: input.subject,
      bodyText: input.bodyText,
      promptText: "Demo seeded record",
      model: "demo",
      status: input.status,
      createdAt: input.createdAt,
      updatedAt: input.sentAt || input.generatedAt || input.createdAt,
      generatedAt: input.generatedAt || null,
      sentAt: input.sentAt || null,
      lastSentTo: input.lastSentTo || null,
    },
    select: { id: true },
  });
  return letter.id;
}

function reportItemsForAlicia(): DemoReportItemSeed[] {
  return [
    {
      bureau: "Experian",
      kind: "Collection",
      label: "Northstar Recovery - $842",
      auditTag: "NEGATIVE",
      disputeStatus: "OPEN",
      detailsJson: { accountName: "Northstar Recovery", balance: "$842", status: "Collection", note: "Consumer says balance is not theirs" },
    },
    {
      bureau: "Equifax",
      kind: "Late Payment",
      label: "Capital First Card - 60 days late",
      auditTag: "NEGATIVE",
      disputeStatus: null,
      detailsJson: { accountName: "Capital First Card", lateMonth: "January 2025", note: "Client has bank proof of on-time payment" },
    },
    {
      bureau: "TransUnion",
      kind: "Inquiry",
      label: "Beacon Auto inquiry",
      auditTag: "PENDING",
      disputeStatus: null,
      detailsJson: { accountName: "Beacon Auto", inquiryDate: "2025-02-10", note: "Client does not recognize lender" },
    },
    {
      bureau: "Experian",
      kind: "Personal Info",
      label: "Old Jacksonville address",
      auditTag: "POSITIVE",
      disputeStatus: "REMOVED",
      detailsJson: { note: "Previously disputed and removed" },
    },
  ];
}

function reportItemsForBrandon(): DemoReportItemSeed[] {
  return [
    {
      bureau: "Experian",
      kind: "Charge-off",
      label: "Summit Retail Card - charge-off",
      auditTag: "NEGATIVE",
      disputeStatus: "FOLLOW_UP",
      detailsJson: { accountName: "Summit Retail Card", balance: "$1,240", note: "Balance and date opened do not match client records" },
    },
    {
      bureau: "Equifax",
      kind: "Collection",
      label: "Rapid Med Collections",
      auditTag: "PENDING",
      disputeStatus: null,
      detailsJson: { accountName: "Rapid Med Collections", note: "Medical collection needs verification" },
    },
    {
      bureau: "TransUnion",
      kind: "Inquiry",
      label: "Blue Ridge Lending inquiry",
      auditTag: "PENDING",
      disputeStatus: null,
      detailsJson: { inquiryDate: "2025-01-04", note: "Possible unauthorized hard pull" },
    },
    {
      bureau: "Experian",
      kind: "Account",
      label: "Auto loan paid as agreed",
      auditTag: "POSITIVE",
      disputeStatus: null,
      detailsJson: { accountName: "Metro Auto Finance", note: "Positive history" },
    },
  ];
}

function seededLetterBody(contactName: string, recipientName: string, disputeLines: string[]) {
  return [
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    "",
    recipientName,
    "P.O. Box 4500",
    "Allen, TX 75013",
    "",
    `Re: Credit reporting dispute for ${contactName}`,
    "",
    "To whom it may concern,",
    "",
    "I am requesting an investigation into the following items appearing on my credit report:",
    ...disputeLines.map((line) => `${line}`),
    "",
    "Please review each item carefully and delete or correct any information that cannot be fully verified.",
    "",
    "Sincerely,",
    contactName,
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const auth = requireManager(session);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: auth.status, headers: { "cache-control": "no-store" } },
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers: { "cache-control": "no-store" } });
    }

    const targetEmail = String(parsed.data?.email || DEFAULT_TARGET_EMAIL).trim().toLowerCase();
    const force = parsed.data?.force === true;

    const owner = await prisma.user.findFirst({
      where: { email: targetEmail },
      select: { id: true, email: true, role: true },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Target account not found", details: `No user found for ${targetEmail}.` },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    if (owner.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Target must be a client account" },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    const existingSetup = await prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId: owner.id, serviceSlug: SEED_SETUP_SLUG } },
      select: { dataJson: true },
    });

    const existingData =
      existingSetup?.dataJson && typeof existingSetup.dataJson === "object" && !Array.isArray(existingSetup.dataJson)
        ? (existingSetup.dataJson as Record<string, any>)
        : null;

    if (existingData && !force) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          forced: false,
          email: owner.email,
          contactIds: Array.isArray(existingData.contactIds) ? existingData.contactIds : [],
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (force && existingData) {
      const letterIds = Array.isArray(existingData.letterIds) ? (existingData.letterIds as string[]) : [];
      const reportIds = Array.isArray(existingData.reportIds) ? (existingData.reportIds as string[]) : [];
      const pullIds = Array.isArray(existingData.pullIds) ? (existingData.pullIds as string[]) : [];
      const contactIds = Array.isArray(existingData.contactIds) ? (existingData.contactIds as string[]) : [];

      if (letterIds.length) {
        await prisma.creditDisputeLetter.deleteMany({ where: { ownerId: owner.id, id: { in: letterIds } } });
      }
      if (reportIds.length) {
        await prisma.creditReportItem.deleteMany({ where: { reportId: { in: reportIds } } });
        await prisma.creditReport.deleteMany({ where: { ownerId: owner.id, id: { in: reportIds } } });
      }
      if (pullIds.length) {
        await prisma.creditPull.deleteMany({ where: { ownerId: owner.id, id: { in: pullIds } } });
      }
      if (contactIds.length) {
        await prisma.portalContact.deleteMany({ where: { ownerId: owner.id, id: { in: contactIds } } });
      }
    }

    const contacts = await Promise.all([
      upsertDemoContact(owner.id, {
        name: "Alicia Carter",
        email: "alicia.carter@example.com",
        phone: "+1 (813) 555-0181",
      }),
      upsertDemoContact(owner.id, {
        name: "Brandon Miles",
        email: "brandon.miles@example.com",
        phone: "+1 (813) 555-0182",
      }),
      upsertDemoContact(owner.id, {
        name: "Chelsea Monroe",
        email: "chelsea.monroe@example.com",
        phone: "+1 (813) 555-0183",
      }),
    ]);

    const aliciaImportedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const brandonImportedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const chelseaCreatedAt = new Date(Date.now() - 26 * 60 * 60 * 1000);

    const aliciaPullId = await createPull(owner.id, contacts[0].id, new Date(aliciaImportedAt.getTime() - 30 * 60 * 1000), {
      items: reportItemsForAlicia().map((item) => ({ label: item.label, bureau: item.bureau, kind: item.kind, ...item.detailsJson })),
    });
    const brandonPullId = await createPull(owner.id, contacts[1].id, new Date(brandonImportedAt.getTime() - 25 * 60 * 1000), {
      items: reportItemsForBrandon().map((item) => ({ label: item.label, bureau: item.bureau, kind: item.kind, ...item.detailsJson })),
    });

    const reportIds = await Promise.all([
      createReport(owner.id, contacts[0].id, aliciaImportedAt, "IdentityIQ", reportItemsForAlicia()),
      createReport(owner.id, contacts[1].id, brandonImportedAt, "SmartCredit", reportItemsForBrandon()),
    ]);

    const letterIds = await Promise.all([
      createLetter({
        ownerId: owner.id,
        contactId: contacts[0].id,
        creditPullId: aliciaPullId,
        subject: "Alicia Carter - Experian dispute",
        bodyText: seededLetterBody("Alicia Carter", "Experian", [
          "- Northstar Recovery collection is not mine.",
          "- Capital First Card late mark for January 2025 is inaccurate.",
          "- Beacon Auto inquiry is unauthorized.",
        ]),
        status: "GENERATED",
        createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
        generatedAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
      }),
      createLetter({
        ownerId: owner.id,
        contactId: contacts[1].id,
        creditPullId: brandonPullId,
        subject: "Brandon Miles - follow-up bureau letter",
        bodyText: seededLetterBody("Brandon Miles", "Equifax", [
          "- Summit Retail Card charge-off details do not match my records.",
          "- Rapid Med Collections needs full verification.",
        ]),
        status: "SENT",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        generatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        sentAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        lastSentTo: contacts[1].email,
      }),
      createLetter({
        ownerId: owner.id,
        contactId: contacts[2].id,
        subject: "Chelsea Monroe - draft dispute",
        bodyText: seededLetterBody("Chelsea Monroe", "TransUnion", [
          "- I need an investigation into mixed personal information on my report.",
          "- Two addresses shown do not belong to me.",
        ]),
        status: "DRAFT",
        createdAt: chelseaCreatedAt,
      }),
    ]);

    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId: owner.id, serviceSlug: SEED_SETUP_SLUG } },
      create: {
        ownerId: owner.id,
        serviceSlug: SEED_SETUP_SLUG,
        status: "COMPLETE",
        dataJson: {
          version: 1,
          seededAtIso: new Date().toISOString(),
          seededByUserId: auth.userId,
          email: owner.email,
          contactIds: contacts.map((contact) => contact.id),
          reportIds,
          pullIds: [aliciaPullId, brandonPullId],
          letterIds,
        } as any,
      },
      update: {
        status: "COMPLETE",
        dataJson: {
          version: 1,
          seededAtIso: new Date().toISOString(),
          seededByUserId: auth.userId,
          email: owner.email,
          contactIds: contacts.map((contact) => contact.id),
          reportIds,
          pullIds: [aliciaPullId, brandonPullId],
          letterIds,
        } as any,
      },
      select: { id: true },
    });

    return NextResponse.json(
      {
        ok: true,
        skipped: false,
        forced: force,
        email: owner.email,
        contactIds: contacts.map((contact) => contact.id),
        reportIds,
        letterIds,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Seed failed", details: toErrorMessage(err) },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
