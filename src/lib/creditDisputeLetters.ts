import { readSignatureImageDataUrl, readSignatureText } from "@/lib/signature";

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
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\*\s+/gm, "- ")
    // Remove any prompt metadata leakage.
    .replace(/^recipient\s*:\s*not provided\s*$/gim, "")
    .replace(/^recipient address\s*:\s*not provided\s*$/gim, "")
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
    // Common bracket placeholders.
    .replace(/\[\s*date\s*\]/gi, date)
    .replace(/\(\s*date\s*\)/gi, date)
    // Avoid showing "signature on file" in generated letters.
    .replace(/\bsignature on file\b/gi, "")
    .replace(/\bdrawn signature on file\b/gi, "")
    .replace(/\b(i hope this letter finds you well)\b[:,]?/gi, "")
    .replace(/\bthis letter serves as formal notice that\b/gi, "I am writing to dispute")
    .replace(/placeholder/gi, "________________")
    .replace(/\{\{[^}]+\}\}/g, "________________")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // If the letter includes a Date line with a placeholder, force it.
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
  if (signature && !hasSignature) {
    text = `${text}\n\n${signature}`;
  }
  if (contactName && !hasContactName) {
    text = `${text}\n${contactName}`;
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}
