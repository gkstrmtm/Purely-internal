import { extractCreditInquiryDate } from "@/lib/creditReports";
import { readSignatureImageDataUrl, readSignatureText } from "@/lib/signature";

export const CONTACT_SIGNATURE_MARKDOWN = "![Contact signature](pa-signature://contact)";
export const DISPUTE_LETTER_PLACEHOLDER_DEFS = [
  { key: "client_name", token: "{{client_name}}", label: "Client name", description: "The contact name on the linked credit client record." },
  { key: "client_address", token: "{{client_address}}", label: "Client address", description: "The mailing address stored on the linked contact." },
  { key: "bureau_name", token: "{{bureau_name}}", label: "Bureau or recipient", description: "The bureau, furnisher, collector, or recipient tied to this draft." },
  { key: "report_date", token: "{{report_date}}", label: "Report date", description: "The imported report date when available, otherwise the draft date." },
  { key: "account_name", token: "{{account_name}}", label: "Account name", description: "The disputed account or item name from the linked report context." },
  { key: "account_number_masked", token: "{{account_number_masked}}", label: "Masked account number", description: "The masked account number when the source data includes one." },
  { key: "dispute_reason", token: "{{dispute_reason}}", label: "Dispute reason", description: "The saved dispute reason or item note for this draft." },
  { key: "item_status", token: "{{item_status}}", label: "Item status", description: "The current reported status for the linked item." },
  { key: "business_name", token: "{{business_name}}", label: "Business name", description: "The workspace business name used in the credit workflow." },
] as const;

export type DisputeLetterPlaceholderKey = (typeof DISPUTE_LETTER_PLACEHOLDER_DEFS)[number]["key"];
export type DisputeLetterPlaceholderUsage = (typeof DISPUTE_LETTER_PLACEHOLDER_DEFS)[number] & {
  value: string | null;
  unresolved: boolean;
};

type PlaceholderValueMap = Record<DisputeLetterPlaceholderKey, string | null>;

type DisputeLetterPlaceholderInput = {
  contactName?: string | null;
  contactAddress?: string | null;
  promptText?: string | null;
  createdAt?: string | Date | null;
  creditPullRawJson?: unknown;
  businessName?: string | null;
};

type DisputeLetterSourceSnapshot = {
  bureauName: string | null;
  reportDate: string | null;
  accountName: string | null;
  accountNumberMasked: string | null;
  itemStatus: string | null;
  disputeReason: string | null;
};

const DISPUTE_LETTER_PLACEHOLDER_MAP = new Map(
  DISPUTE_LETTER_PLACEHOLDER_DEFS.map((entry) => [entry.key, entry]),
);

export function hasInlineContactSignature(value: string) {
  return /!\[[^\]]*signature[^\]]*\]\(pa-signature:\/\/contact\)/i.test(String(value || ""));
}

export function readContactCustomValue(customVariables: unknown, key: string) {
  if (!customVariables || typeof customVariables !== "object" || Array.isArray(customVariables)) return "";
  const target = String(key || "").trim().toLowerCase();
  if (!target) return "";
  for (const [entryKey, entryValue] of Object.entries(customVariables as Record<string, unknown>)) {
    if (String(entryKey || "").trim().toLowerCase() !== target) continue;
    return typeof entryValue === "string" ? entryValue.trim() : String(entryValue ?? "").trim();
  }
  return "";
}

export function readContactSignature(customVariables: unknown) {
  return readSignatureText(readContactCustomValue(customVariables, "signature"));
}

export function readContactAddress(customVariables: unknown) {
  const raw =
    readContactCustomValue(customVariables, "address") ||
    readContactCustomValue(customVariables, "mailing_address") ||
    readContactCustomValue(customVariables, "mailing address") ||
    readContactCustomValue(customVariables, "addressLine1") ||
    readContactCustomValue(customVariables, "address_line1");
  return String(raw || "").trim();
}

export function readContactSignatureImage(customVariables: unknown) {
  return readSignatureImageDataUrl(readContactCustomValue(customVariables, "signature"));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePlaceholderKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanSnapshotValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateValue(value: string | Date | null | undefined) {
  if (!value) return "";
  const direct = typeof value === "string" ? value.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const date = value instanceof Date ? value : new Date(direct || value);
  if (Number.isNaN(date.getTime())) return direct;
  return date.toISOString().slice(0, 10);
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function findFirstNestedString(value: unknown, keys: string[], maxDepth = 4): string {
  const targetKeys = new Set(keys.map((entry) => entry.toLowerCase()));
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth > maxDepth) continue;

    const object = readObject(current.value);
    if (!object) {
      if (Array.isArray(current.value) && current.depth < maxDepth) {
        for (const child of current.value) queue.push({ value: child, depth: current.depth + 1 });
      }
      continue;
    }

    for (const [key, entryValue] of Object.entries(object)) {
      if (typeof entryValue === "string" && targetKeys.has(key.toLowerCase())) {
        const trimmed = entryValue.trim();
        if (trimmed) return trimmed;
      }
    }

    if (current.depth < maxDepth) {
      for (const entryValue of Object.values(object)) {
        if (entryValue && typeof entryValue === "object") queue.push({ value: entryValue, depth: current.depth + 1 });
      }
    }
  }
  return "";
}

function maskAccountNumber(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/[*xX•]/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  const tail = digits.slice(-4);
  return tail ? `****${tail}` : trimmed;
}

function readDisputeLines(raw: string | undefined) {
  return String(raw || "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

function readSourceSnapshot(input: {
  bureau?: string | null;
  kind?: string | null;
  label?: string | null;
  disputeStatus?: string | null;
  detailsJson?: unknown;
  reportDate?: string | null;
}): DisputeLetterSourceSnapshot {
  const details = input.detailsJson;
  const accountName = firstNonEmpty(
    findFirstNestedString(details, ["accountName", "account_name", "creditorName", "creditor_name", "furnisherName", "furnisher_name", "lenderName", "lender_name", "businessName", "business_name"]),
    cleanSnapshotValue(input.label),
  );
  const accountNumberMasked = maskAccountNumber(
    firstNonEmpty(
      findFirstNestedString(details, ["accountNumberMasked", "account_number_masked", "maskedAccountNumber", "masked_account_number", "accountNumber", "account_number", "accountLast4", "account_last4", "last4", "lastFour"]),
    ),
  );
  const itemStatus = firstNonEmpty(
    cleanSnapshotValue(input.disputeStatus),
    findFirstNestedString(details, ["status", "itemStatus", "item_status", "accountStatus", "account_status", "paymentStatus", "payment_status"]),
    cleanSnapshotValue(input.kind),
  );
  const disputeReason = firstNonEmpty(
    findFirstNestedString(details, ["disputeReason", "dispute_reason", "reason", "note", "explanation", "comment"]),
  );
  const reportDate = firstNonEmpty(
    cleanSnapshotValue(input.reportDate),
    extractCreditInquiryDate(details),
    findFirstNestedString(details, ["reportDate", "report_date", "dateReported", "date_reported", "reportedOn", "reported_on", "inquiryDate", "inquiry_date"]),
  );

  return {
    bureauName: cleanSnapshotValue(input.bureau) || null,
    reportDate: reportDate || null,
    accountName: accountName || null,
    accountNumberMasked: accountNumberMasked || null,
    itemStatus: itemStatus || null,
    disputeReason: disputeReason || null,
  };
}

function readFirstCreditPullItem(rawJson: unknown) {
  const root = readObject(rawJson);
  if (!root) return null;
  const directItems = Array.isArray(root.items) ? root.items : null;
  if (directItems?.length) return readObject(directItems[0]);
  const profile = readObject(root.profile);
  const nestedItems = profile && Array.isArray(profile.items) ? profile.items : null;
  if (nestedItems?.length) return readObject(nestedItems[0]);
  return null;
}

function buildDisputeLetterPlaceholderValues(input: DisputeLetterPlaceholderInput): PlaceholderValueMap {
  const promptMeta = parseDisputeLetterPromptMeta(input.promptText || "");
  const creditPullItem = readFirstCreditPullItem(input.creditPullRawJson);
  const creditPullSnapshot = creditPullItem
    ? readSourceSnapshot({
        bureau: cleanSnapshotValue(creditPullItem.bureau),
        kind: cleanSnapshotValue(creditPullItem.kind),
        label: cleanSnapshotValue(creditPullItem.label),
        disputeStatus: cleanSnapshotValue(creditPullItem.disputeStatus),
        detailsJson: creditPullItem,
      })
    : null;

  const promptDisputeLines = readDisputeLines(promptMeta.disputeContext);
  const promptSnapshot: DisputeLetterSourceSnapshot = {
    bureauName: firstNonEmpty(promptMeta.itemBureau, promptMeta.recipientName) || null,
    reportDate: firstNonEmpty(promptMeta.reportDate, promptMeta.dateIso, formatDateValue(input.createdAt)) || null,
    accountName: firstNonEmpty(promptMeta.itemAccountName) || null,
    accountNumberMasked: maskAccountNumber(firstNonEmpty(promptMeta.itemAccountNumberMasked)) || null,
    itemStatus: firstNonEmpty(promptMeta.itemStatus) || null,
    disputeReason: firstNonEmpty(promptMeta.disputeReason, promptDisputeLines[0]) || null,
  };

  return {
    client_name: firstNonEmpty(input.contactName, promptMeta.consumerName) || null,
    client_address: firstNonEmpty(input.contactAddress, promptMeta.consumerAddress) || null,
    bureau_name: firstNonEmpty(promptSnapshot.bureauName, creditPullSnapshot?.bureauName) || null,
    report_date: firstNonEmpty(promptSnapshot.reportDate, creditPullSnapshot?.reportDate, formatDateValue(input.createdAt)) || null,
    account_name: firstNonEmpty(promptSnapshot.accountName, creditPullSnapshot?.accountName) || null,
    account_number_masked: firstNonEmpty(promptSnapshot.accountNumberMasked, creditPullSnapshot?.accountNumberMasked) || null,
    dispute_reason: firstNonEmpty(promptSnapshot.disputeReason, creditPullSnapshot?.disputeReason) || null,
    item_status: firstNonEmpty(promptSnapshot.itemStatus, creditPullSnapshot?.itemStatus) || null,
    business_name: firstNonEmpty(input.businessName, promptMeta.businessName) || null,
  };
}

export function listDisputeLetterPlaceholderKeys(value: string) {
  const keys: string[] = [];
  const seen = new Set<string>();
  const regex = /\{\{\s*([^}]+?)\s*\}\}/g;
  for (const match of String(value || "").matchAll(regex)) {
    const normalized = normalizePlaceholderKey(match[1] || "");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    keys.push(normalized);
  }
  return keys;
}

export function inspectDisputeLetterPlaceholders(value: string, input: DisputeLetterPlaceholderInput) {
  const placeholderValues = buildDisputeLetterPlaceholderValues(input);
  const unresolvedTokens: string[] = [];
  const unsupportedTokens: string[] = [];
  const usedKeys: DisputeLetterPlaceholderKey[] = [];

  const text = String(value || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey: string) => {
    const normalizedKey = normalizePlaceholderKey(rawKey);
    const def = DISPUTE_LETTER_PLACEHOLDER_MAP.get(normalizedKey as DisputeLetterPlaceholderKey);
    if (!def) {
      if (!unsupportedTokens.includes(match)) unsupportedTokens.push(match);
      return match;
    }
    const key = def.key as DisputeLetterPlaceholderKey;
    if (!usedKeys.includes(key)) usedKeys.push(key);
    const replacement = placeholderValues[key];
    if (!replacement) {
      if (!unresolvedTokens.includes(def.token)) unresolvedTokens.push(def.token);
      return def.token;
    }
    return replacement;
  });

  const usedPlaceholders = usedKeys
    .map((key) => {
      const def = DISPUTE_LETTER_PLACEHOLDER_MAP.get(key);
      if (!def) return null;
      return {
        ...def,
        value: placeholderValues[key],
        unresolved: !placeholderValues[key],
      };
    })
    .filter((entry): entry is DisputeLetterPlaceholderUsage => Boolean(entry));

  return {
    text,
    unresolvedTokens,
    unsupportedTokens,
    usedPlaceholders,
    values: placeholderValues,
  };
}

export function normalizeDisputeLetterText(
  value: string,
  options?: {
    contactName?: string | null;
    signature?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    date?: string | null;
  },
) {
  const contactName = String(options?.contactName || "").trim();
  const signature = String(options?.signature || "").trim();
  const email = String(options?.email || "").trim();
  const phone = String(options?.phone || "").trim();
  const address = String(options?.address || "").trim();
  const date = String(options?.date || "").trim();

  let text = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/^recipient\s*:\s*not provided\s*$/gim, "")
    .replace(/^recipient address\s*:\s*not provided\s*$/gim, "")
    .replace(/^recipient\s*:\s*(.+)\s*$/gim, "$1")
    .replace(/^recipient address\s*:\s*(.+)\s*$/gim, "$1")
    .replace(/^consumer\/contact name\s*:\s*(.+)\s*$/gim, "$1")
    .replace(/^consumer address\s*:\s*(.+)\s*$/gim, "$1")
    .replace(/^consumer email\s*:\s*not provided\s*$/gim, "")
    .replace(/^consumer phone\s*:\s*not provided\s*$/gim, "")
    .replace(/^consumer signature on file\s*:\s*.*$/gim, "")
    .replace(/^signature on file\s*:?\s*.*$/gim, "")
    .replace(/\{\{\s*(name|contact name|consumer name|contactName)\s*\}\}/gi, contactName)
    .replace(/\{\{\s*date\s*\}\}/gi, date)
    .replace(/\{\{\s*email\s*\}\}/gi, email)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone)
    .replace(/\{\{\s*(address|mailing address|consumer address|addressline1|address_line1|address 1|address1)\s*\}\}/gi, address)
    .replace(/\{\{\s*(signature|consumer signature|your signature if sending a hard copy)[^}]*\}\}/gi, signature || "________________")
    .replace(/your signature if sending a hard copy/gi, signature || "________________")
    .replace(/\[\s*date\s*\]/gi, date)
    .replace(/\[\s*recipient address\s*\]/gi, "")
    .replace(/\[\s*address\s*\]/gi, "")
    .replace(/\[\s*city\s*,\s*state\s*,\s*zip(?:\s*code)?\s*\]/gi, "")
    .replace(/^\s*city\s*,\s*state\s*,\s*zip(?:\s*code)?\s*$/gim, "")
    .replace(/\[\s*signature\s*\]/gi, signature || "")
    .replace(/\(\s*date\s*\)/gi, date)
    .replace(/^\s*signature\s*:?\s*$/gim, "")
    .replace(/\bsignature on file\b/gi, "")
    .replace(/\bdrawn signature on file\b/gi, "")
    .replace(/\b(i hope this letter finds you well)\b[:,]?/gi, "")
    .replace(/\bthis letter serves as formal notice that\b/gi, "I am writing to dispute")
    .replace(/placeholder/gi, "________________")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const hasInlineSignature = hasInlineContactSignature(text);

  if (date) {
    text = text.replace(
      /^(\s*date\s*:\s*)(\[\s*date\s*\]|\{\{\s*date\s*\}\}|\(\s*date\s*\)|date)\s*$/gim,
      `$1${date}`,
    );

    const firstChunk = text.split("\n").slice(0, 12).join("\n");
    const hasDateLine = /^\s*date\s*:/gim.test(firstChunk);
    if (!hasDateLine) {
      text = `Date: ${date}\n\n${text}`.trim();
    }
  }

  if (email) {
    text = text
      .replace(/\byour email address\b/gi, email)
      .replace(/\byour email\b/gi, email);
  }

  if (address) {
    text = text
      .replace(/\byour mailing address\b/gi, address)
      .replace(/\byour address\b/gi, address);
  }

  if (phone) {
    text = text
      .replace(/\byour phone number\b/gi, phone)
      .replace(/\byour phone\b/gi, phone);
  }

  const tail = text.slice(-500);
  const hasClosing = /\b(sincerely|regards|respectfully|thank you)\b/i.test(tail);
  const hasContactName = contactName ? new RegExp(escapeRegExp(contactName), "i").test(tail) : false;
  const hasSignature = signature ? new RegExp(escapeRegExp(signature), "i").test(tail) : false;

  if (!hasClosing) {
    text = `${text}\n\nSincerely,`;
  }
  if (signature && !hasSignature && !hasInlineSignature) {
    text = `${text}\n\n${signature}`;
  }
  if (contactName && !hasContactName && !hasInlineSignature) {
    text = `${text}\n${contactName}`;
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export type DisputeLetterPromptMeta = {
  dateIso?: string;
  reportDate?: string;
  recipientName?: string;
  recipientAddress?: string;
  consumerName?: string;
  consumerAddress?: string;
  disputeContext?: string;
  itemBureau?: string;
  itemAccountName?: string;
  itemAccountNumberMasked?: string;
  itemStatus?: string;
  disputeReason?: string;
  businessName?: string;
};

function readPromptBlock(lines: string[], startIndex: number, firstLineRemainder: string) {
  const collected: string[] = [];
  if (firstLineRemainder.trim()) collected.push(firstLineRemainder.trim());

  const stopRegex =
    /^\s*(report date|consumer\/contact name|consumer address|consumer email|consumer phone|item bureau|item account name|item account number masked|item status|dispute reason|business name|template selected|draft direction|optional sample structure|dispute context|credit data|write the letter now)\s*:/i;

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = String(lines[i] || "");
    if (!line.trim()) break;
    if (stopRegex.test(line)) break;
    collected.push(line.trimEnd());
  }

  return collected.join("\n").trim();
}

export function parseDisputeLetterPromptMeta(promptText: string): DisputeLetterPromptMeta {
  const lines = String(promptText || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const meta: DisputeLetterPromptMeta = {};
  for (let i = 0; i < lines.length; i += 1) {
    const raw = String(lines[i] || "");
    const line = raw.trim();
    if (!line) continue;

    const dateMatch = line.match(/^date\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/i);
    if (dateMatch?.[1] && !meta.dateIso) {
      meta.dateIso = dateMatch[1];
      continue;
    }

    const recipientMatch = line.match(/^recipient\s*:\s*(.+)\s*$/i);
    if (recipientMatch?.[1] && !/not provided/i.test(recipientMatch[1]) && !meta.recipientName) {
      meta.recipientName = recipientMatch[1].trim();
      continue;
    }

    const recipientAddressMatch = raw.match(/^\s*recipient address\s*:\s*(.*)\s*$/i);
    if (recipientAddressMatch && !/not provided/i.test(recipientAddressMatch[1] || "") && !meta.recipientAddress) {
      meta.recipientAddress = readPromptBlock(lines, i, String(recipientAddressMatch[1] || ""));
      continue;
    }

    const reportDateMatch = raw.match(/^\s*report date\s*:\s*(.*)\s*$/i);
    if (reportDateMatch && !meta.reportDate) {
      meta.reportDate = String(reportDateMatch[1] || "").trim();
      continue;
    }

    const consumerNameMatch = raw.match(/^\s*consumer\/contact name\s*:\s*(.*)\s*$/i);
    if (consumerNameMatch && !/not provided/i.test(consumerNameMatch[1] || "") && !meta.consumerName) {
      meta.consumerName = String(consumerNameMatch[1] || "").trim();
      continue;
    }

    const consumerAddressMatch = raw.match(/^\s*consumer address\s*:\s*(.*)\s*$/i);
    if (consumerAddressMatch && !/not provided/i.test(consumerAddressMatch[1] || "") && !meta.consumerAddress) {
      meta.consumerAddress = readPromptBlock(lines, i, String(consumerAddressMatch[1] || ""));
      continue;
    }

    const disputeContextMatch = raw.match(/^\s*dispute context\s*:\s*(.*)\s*$/i);
    if (disputeContextMatch && !meta.disputeContext) {
      meta.disputeContext = readPromptBlock(lines, i, String(disputeContextMatch[1] || ""));
      continue;
    }

    const itemBureauMatch = raw.match(/^\s*item bureau\s*:\s*(.*)\s*$/i);
    if (itemBureauMatch && !meta.itemBureau) {
      meta.itemBureau = String(itemBureauMatch[1] || "").trim();
      continue;
    }

    const itemAccountNameMatch = raw.match(/^\s*item account name\s*:\s*(.*)\s*$/i);
    if (itemAccountNameMatch && !meta.itemAccountName) {
      meta.itemAccountName = String(itemAccountNameMatch[1] || "").trim();
      continue;
    }

    const itemAccountNumberMaskedMatch = raw.match(/^\s*item account number masked\s*:\s*(.*)\s*$/i);
    if (itemAccountNumberMaskedMatch && !meta.itemAccountNumberMasked) {
      meta.itemAccountNumberMasked = String(itemAccountNumberMaskedMatch[1] || "").trim();
      continue;
    }

    const itemStatusMatch = raw.match(/^\s*item status\s*:\s*(.*)\s*$/i);
    if (itemStatusMatch && !meta.itemStatus) {
      meta.itemStatus = String(itemStatusMatch[1] || "").trim();
      continue;
    }

    const disputeReasonMatch = raw.match(/^\s*dispute reason\s*:\s*(.*)\s*$/i);
    if (disputeReasonMatch && !meta.disputeReason) {
      meta.disputeReason = readPromptBlock(lines, i, String(disputeReasonMatch[1] || ""));
      continue;
    }

    const businessNameMatch = raw.match(/^\s*business name\s*:\s*(.*)\s*$/i);
    if (businessNameMatch && !meta.businessName) {
      meta.businessName = String(businessNameMatch[1] || "").trim();
    }
  }

  return meta;
}
