import { prisma } from "@/lib/db";
import { reconcileCreditReportLifecycle, readCreditReportLifecycle } from "@/lib/creditLifecycle";
import {
  deriveCreditReportItemAudit,
  extractCreditReportItems,
  extractCreditReportOverview,
  extractCreditReportSnapshot,
  normalizeCreditScope,
  type CreditScope,
} from "@/lib/creditReports";

type IngestCreditReportArgs = {
  ownerId: string;
  contactId?: string | null;
  provider: string;
  creditScope?: CreditScope | null;
  rawJson: unknown;
};

function buildStoredRawJson(rawJson: unknown, provider: string, creditScope: CreditScope) {
  if (rawJson && typeof rawJson === "object" && !Array.isArray(rawJson)) {
    return {
      ...(rawJson as Record<string, unknown>),
      provider,
      creditScope,
    };
  }

  return {
    provider,
    creditScope,
    payload: rawJson,
  };
}

export async function ingestCreditReport({ ownerId, contactId, provider, creditScope, rawJson }: IngestCreditReportArgs) {
  const normalizedScope = normalizeCreditScope(creditScope);
  const storedRawJson = buildStoredRawJson(rawJson, provider, normalizedScope);
  const now = new Date();

  const created = await prisma.creditReport.create({
    data: {
      ownerId,
      contactId: contactId || null,
      provider,
      rawJson: storedRawJson as any,
      importedAt: now,
      createdAt: now,
    },
    select: { id: true },
  });

  const extractedItems = extractCreditReportItems(storedRawJson);
  if (extractedItems.length) {
    await prisma.creditReportItem.createMany({
      data: extractedItems.slice(0, 1500).map((item) => {
        const derived = deriveCreditReportItemAudit(item);
        return {
          reportId: created.id,
          bureau: item.bureau?.slice(0, 40) || null,
          kind: item.kind?.slice(0, 60) || null,
          label: (item.label || "Item").slice(0, 180),
          detailsJson: (item.detailsJson || null) as any,
          auditTag: derived.auditTag,
          disputeStatus: item.disputeStatus || null,
          createdAt: now,
          updatedAt: now,
        };
      }) as any,
    });
  }

  if (contactId) {
    await reconcileCreditReportLifecycle({ ownerId, contactId, reportId: created.id }).catch(() => null);
  }

  const report = await prisma.creditReport.findFirst({
    where: { id: created.id, ownerId },
    select: {
      id: true,
      provider: true,
      importedAt: true,
      createdAt: true,
      contactId: true,
      rawJson: true,
      contact: { select: { id: true, name: true, email: true } },
      _count: { select: { items: true } },
    },
  });

  if (!report) return null;

  return {
    ...report,
    creditScope: normalizedScope,
    creditSnapshot: extractCreditReportSnapshot(report.rawJson, extractedItems),
    creditOverview: extractCreditReportOverview(report.rawJson),
    creditLifecycle: readCreditReportLifecycle(report.rawJson),
  };
}