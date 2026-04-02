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
  return readContactCustomValue(customVariables, "signature");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeDisputeLetterText(
  value: string,
  options?: { contactName?: string | null; signature?: string | null; email?: string | null; phone?: string | null },
) {
  const contactName = String(options?.contactName || "").trim();
  const signature = String(options?.signature || "").trim();
  const email = String(options?.email || "").trim();
  const phone = String(options?.phone || "").trim();

  let text = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/^recipient\s*:\s*not provided\s*$/gim, "")
    .replace(/^recipient address\s*:\s*not provided\s*$/gim, "")
    .replace(/^consumer email\s*:\s*not provided\s*$/gim, "")
    .replace(/^consumer phone\s*:\s*not provided\s*$/gim, "")
    .replace(/\{\{\s*email\s*\}\}/gi, email)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone)
    .replace(/\{\{\s*(signature|consumer signature|your signature if sending a hard copy)[^}]*\}\}/gi, signature || "________________")
    .replace(/your signature if sending a hard copy/gi, signature || "________________")
    .replace(/\b(i hope this letter finds you well)\b[:,]?/gi, "")
    .replace(/\bthis letter serves as formal notice that\b/gi, "I am writing to dispute")
    .replace(/placeholder/gi, "________________")
    .replace(/\{\{[^}]+\}\}/g, "________________")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (email) {
    text = text
      .replace(/\byour email address\b/gi, email)
      .replace(/\byour email\b/gi, email);
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
