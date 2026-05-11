import { prisma } from "@/lib/db";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { extractCreditReportSnapshot } from "@/lib/creditReports";

type CreditReportItemRecord = {
  id: string;
  bureau: string | null;
  kind: string | null;
  label: string;
  auditTag: "PENDING" | "NEGATIVE" | "POSITIVE";
  disputeStatus: string | null;
  detailsJson?: unknown;
};

export type CreditDisputeLetterLifecycleMeta = {
  version: 1;
  sourceReportId?: string | null;
  sourceReportItemId?: string | null;
  sourceItemLabel?: string | null;
  recipientName?: string | null;
  recipientAddress?: string | null;
  createdAt?: string | null;
  mailedAt?: string | null;
  expectedDeliveryDate?: string | null;
  latestOutcome?: string | null;
  latestOutcomeAt?: string | null;
};

export type CreditReportLifecycleEvent = {
  kind: "item_removed" | "item_resolved" | "score_improved" | "negative_items_reduced";
  title: string;
  description: string;
  createdAt: string;
  itemLabel?: string | null;
  bureau?: string | null;
};

export type CreditReportLifecycleSummary = {
  previousReportId: string | null;
  carriedForwardCount: number;
  removedCount: number;
  resolvedCount: number;
  notificationSummary: {
    account: "sent" | "skipped" | "failed";
    client: "sent" | "skipped" | "failed";
    accountReason?: string | null;
    clientReason?: string | null;
  };
  lastReconciledAt: string;
  events: CreditReportLifecycleEvent[];
};

const DISPUTE_META_MARKER = "__PA_CREDIT_META__:";

function safeOneLine(value: string | null | undefined) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeToken(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readObjectValue(source: Record<string, unknown> | null, keys: string[]) {
  if (!source) return "";
  for (const key of keys) {
    const value = source[key];
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function itemFingerprint(item: CreditReportItemRecord) {
  const details = readObject(item.detailsJson);
  const accountBits = [
    readObjectValue(details, ["AccountNumber", "accountNumber", "account_number", "maskedAccountNumber", "account", "number"]),
    readObjectValue(details, ["SubscriberCode", "subscriberCode", "subscriber_code"]),
    readObjectValue(details, ["InquiryDate", "inquiryDate", "dateOfInquiry", "date"]),
    readObjectValue(details, ["StreetName", "streetName", "address1"]),
  ]
    .map((value) => normalizeToken(value))
    .filter(Boolean)
    .join("|");

  return [normalizeToken(item.bureau), normalizeToken(item.kind), normalizeToken(item.label), accountBits]
    .filter(Boolean)
    .join("|");
}

function lifecycleStatusDateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isTrackedDisputeStatus(value: string | null | undefined) {
  const normalized = normalizeToken(value);
  return Boolean(normalized) && !/(resolved|removed|deleted|completed)/.test(normalized);
}

function uniqueEvents(events: CreditReportLifecycleEvent[]) {
  const seen = new Set<string>();
  const output: CreditReportLifecycleEvent[] = [];
  for (const event of events) {
    const key = `${event.kind}|${normalizeToken(event.itemLabel)}|${normalizeToken(event.title)}|${normalizeToken(event.description)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(event);
  }
  return output;
}

function eventSummaryText(events: CreditReportLifecycleEvent[]) {
  if (!events.length) return "No major report changes were detected.";
  return events
    .slice(0, 6)
    .map((event) => `- ${event.title}: ${event.description}`)
    .join("\n");
}

export function readCreditDisputeLetterLifecycleMeta(promptText: string | null | undefined): CreditDisputeLetterLifecycleMeta | null {
  const source = String(promptText || "");
  const markerIndex = source.lastIndexOf(DISPUTE_META_MARKER);
  if (markerIndex < 0) return null;
  const encoded = source.slice(markerIndex + DISPUTE_META_MARKER.length).trim();
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as CreditDisputeLetterLifecycleMeta;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCreditDisputeLetterLifecycleMeta(promptText: string | null | undefined, metadata: CreditDisputeLetterLifecycleMeta | null) {
  const source = String(promptText || "");
  const markerIndex = source.lastIndexOf(DISPUTE_META_MARKER);
  const cleaned = (markerIndex >= 0 ? source.slice(0, markerIndex) : source).trimEnd();
  if (!metadata) return cleaned;
  const encoded = Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url");
  return `${cleaned}\n\n${DISPUTE_META_MARKER}${encoded}`;
}

export function readCreditReportLifecycle(rawJson: unknown): CreditReportLifecycleSummary | null {
  const raw = readObject(rawJson);
  const lifecycle = readObject(raw?.lifecycle);
  if (!lifecycle) return null;

  const eventsRaw = Array.isArray(lifecycle.events) ? lifecycle.events : [];
  return {
    previousReportId: normalizeText(lifecycle.previousReportId) || null,
    carriedForwardCount: Number(lifecycle.carriedForwardCount || 0) || 0,
    removedCount: Number(lifecycle.removedCount || 0) || 0,
    resolvedCount: Number(lifecycle.resolvedCount || 0) || 0,
    notificationSummary: {
      account: lifecycle.notificationSummary && typeof lifecycle.notificationSummary === "object" && !Array.isArray(lifecycle.notificationSummary)
        ? ((readObject(lifecycle.notificationSummary)?.account as "sent" | "skipped" | "failed") || "skipped")
        : "skipped",
      client: lifecycle.notificationSummary && typeof lifecycle.notificationSummary === "object" && !Array.isArray(lifecycle.notificationSummary)
        ? ((readObject(lifecycle.notificationSummary)?.client as "sent" | "skipped" | "failed") || "skipped")
        : "skipped",
      accountReason: readObject(lifecycle.notificationSummary)?.accountReason ? String(readObject(lifecycle.notificationSummary)?.accountReason) : null,
      clientReason: readObject(lifecycle.notificationSummary)?.clientReason ? String(readObject(lifecycle.notificationSummary)?.clientReason) : null,
    },
    lastReconciledAt: normalizeText(lifecycle.lastReconciledAt) || "",
    events: eventsRaw
      .map((event) => readObject(event))
      .filter((event): event is Record<string, unknown> => Boolean(event))
      .map((event) => ({
        kind: (normalizeText(event.kind) as CreditReportLifecycleEvent["kind"]) || "item_removed",
        title: normalizeText(event.title) || "Credit update",
        description: normalizeText(event.description) || "",
        createdAt: normalizeText(event.createdAt) || "",
        itemLabel: normalizeText(event.itemLabel) || null,
        bureau: normalizeText(event.bureau) || null,
      })),
  };
}

export async function reconcileCreditReportLifecycle(opts: { ownerId: string; contactId: string; reportId: string }) {
  const now = new Date();
  const nowIso = now.toISOString();
  const statusDate = lifecycleStatusDateLabel(now);

  const currentReport = await prisma.creditReport.findFirst({
    where: { id: opts.reportId, ownerId: opts.ownerId, contactId: opts.contactId },
    select: {
      id: true,
      ownerId: true,
      contactId: true,
      importedAt: true,
      rawJson: true,
      contact: { select: { id: true, name: true, email: true } },
      items: {
        select: { id: true, bureau: true, kind: true, label: true, auditTag: true, disputeStatus: true, detailsJson: true },
      },
    },
  });

  if (!currentReport) return null;

  const previousReport = await prisma.creditReport.findFirst({
    where: {
      ownerId: opts.ownerId,
      contactId: opts.contactId,
      id: { not: currentReport.id },
      importedAt: { lt: currentReport.importedAt },
    },
    orderBy: [{ importedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      rawJson: true,
      items: {
        select: { id: true, bureau: true, kind: true, label: true, auditTag: true, disputeStatus: true, detailsJson: true },
      },
    },
  });

  const events: CreditReportLifecycleEvent[] = [];
  let carriedForwardCount = 0;
  let removedCount = 0;
  let resolvedCount = 0;

  if (previousReport) {
    const previousMap = new Map<string, CreditReportItemRecord>();
    for (const item of previousReport.items) previousMap.set(itemFingerprint(item), item);

    for (const item of currentReport.items) {
      const previousItem = previousMap.get(itemFingerprint(item));
      if (!previousItem) continue;

      const nextStatusUpdates: { disputeStatus?: string | null } = {};

      if (!item.disputeStatus && isTrackedDisputeStatus(previousItem.disputeStatus)) {
        nextStatusUpdates.disputeStatus = previousItem.disputeStatus;
        carriedForwardCount += 1;
      }

      if (previousItem.auditTag !== "POSITIVE" && item.auditTag === "POSITIVE") {
        const resolvedStatus = `Resolved on latest report ${statusDate}`;
        nextStatusUpdates.disputeStatus = resolvedStatus;
        resolvedCount += 1;
        events.push({
          kind: "item_resolved",
          title: previousItem.label || "Tracked item resolved",
          description: `The item now reads clean or resolved on the newest report.${previousItem.disputeStatus ? ` Previous status: ${previousItem.disputeStatus}.` : ""}`,
          createdAt: nowIso,
          itemLabel: previousItem.label,
          bureau: previousItem.bureau,
        });
      }

      if (nextStatusUpdates.disputeStatus !== undefined && nextStatusUpdates.disputeStatus !== item.disputeStatus) {
        await prisma.creditReportItem.updateMany({
          where: { id: item.id, reportId: currentReport.id },
          data: { disputeStatus: nextStatusUpdates.disputeStatus || null, updatedAt: now },
        });
      }
    }

    const currentFingerprints = new Set(currentReport.items.map((item) => itemFingerprint(item)));
    for (const item of previousReport.items) {
      const tracked = item.auditTag === "NEGATIVE" || isTrackedDisputeStatus(item.disputeStatus);
      if (!tracked) continue;
      if (currentFingerprints.has(itemFingerprint(item))) continue;

      const removedStatus = `Removed from latest report ${statusDate}`;
      await prisma.creditReportItem.updateMany({
        where: { id: item.id, reportId: previousReport.id },
        data: { disputeStatus: removedStatus, updatedAt: now },
      });
      removedCount += 1;
      events.push({
        kind: "item_removed",
        title: item.label || "Tracked item removed",
        description: `The item no longer appears on the latest imported report.${item.disputeStatus ? ` Previous status: ${item.disputeStatus}.` : ""}`,
        createdAt: nowIso,
        itemLabel: item.label,
        bureau: item.bureau,
      });
    }

    const previousSnapshot = extractCreditReportSnapshot(previousReport.rawJson, previousReport.items);
    const currentSnapshot = extractCreditReportSnapshot(currentReport.rawJson, currentReport.items);
    const previousNegative = previousReport.items.filter((item) => item.auditTag === "NEGATIVE").length;
    const currentNegative = currentReport.items.filter((item) => item.auditTag === "NEGATIVE").length;

    if (
      previousSnapshot.currentScore !== null &&
      currentSnapshot.currentScore !== null &&
      currentSnapshot.currentScore - previousSnapshot.currentScore >= 20
    ) {
      events.push({
        kind: "score_improved",
        title: `Score improved to ${currentSnapshot.currentScore}`,
        description: `The score improved by ${currentSnapshot.currentScore - previousSnapshot.currentScore} points since the prior report.`,
        createdAt: nowIso,
      });
    }

    if (previousNegative > currentNegative) {
      events.push({
        kind: "negative_items_reduced",
        title: "Negative item count dropped",
        description: `Negative items dropped from ${previousNegative} to ${currentNegative} on the latest report.`,
        createdAt: nowIso,
      });
    }
  }

  const dedupedEvents = uniqueEvents(events).slice(0, 12);

  let accountNotification: CreditReportLifecycleSummary["notificationSummary"]["account"] = "skipped";
  let clientNotification: CreditReportLifecycleSummary["notificationSummary"]["client"] = "skipped";
  let accountReason: string | null = null;
  let clientReason: string | null = null;

  if (dedupedEvents.length) {
    const subject = `Credit report update for ${currentReport.contact?.name || "client"}`;
    const text = [
      `${currentReport.contact?.name || "A client"} has a credit report update.`,
      "",
      eventSummaryText(dedupedEvents),
      "",
      "Open Credit Reports to review the latest file and follow-up items.",
    ].join("\n");

    const ownerResult = await tryNotifyPortalAccountUsers({
      ownerId: opts.ownerId,
      kind: "credit_report_update",
      subject,
      text,
      smsMirror: false,
    });
    if (ownerResult.ok) {
      accountNotification = "sent";
    } else {
      accountNotification = ownerResult.reason === "No recipients" ? "skipped" : "failed";
      accountReason = ownerResult.reason;
    }

    const clientEmail = safeOneLine(currentReport.contact?.email);
    if (clientEmail && clientEmail.includes("@")) {
      const clientResult = await trySendTransactionalEmail({
        to: clientEmail,
        subject: `Your credit report changed`,
        text: [
          `Hi ${currentReport.contact?.name || "there"},`,
          "",
          "We reviewed your newest credit report and found an update:",
          "",
          eventSummaryText(dedupedEvents),
          "",
          "We will keep tracking the file and follow up on the remaining items.",
        ].join("\n"),
        fromName: "Purely Automation Credit",
      });
      if (clientResult.ok) {
        clientNotification = "sent";
      } else {
        clientNotification = clientResult.skipped ? "skipped" : "failed";
        clientReason = clientResult.reason;
      }
    } else {
      clientReason = "Client email missing";
    }
  }

  const summary: CreditReportLifecycleSummary = {
    previousReportId: previousReport?.id || null,
    carriedForwardCount,
    removedCount,
    resolvedCount,
    notificationSummary: {
      account: accountNotification,
      client: clientNotification,
      accountReason,
      clientReason,
    },
    lastReconciledAt: nowIso,
    events: dedupedEvents,
  };

  const raw = readObject(currentReport.rawJson) || {};
  await prisma.creditReport.update({
    where: { id: currentReport.id },
    data: {
      rawJson: {
        ...raw,
        lifecycle: summary,
      } as any,
    },
  });

  return summary;
}