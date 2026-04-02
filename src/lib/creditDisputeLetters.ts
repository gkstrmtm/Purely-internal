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
  options?: { contactName?: string | null; signature?: string | null },
) {
  const contactName = String(options?.contactName || "").trim();
  const signature = String(options?.signature || "").trim();

  let text = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\{\{\s*(signature|consumer signature|your signature if sending a hard copy)[^}]*\}\}/gi, signature || "________________")
    .replace(/your signature if sending a hard copy/gi, signature || "________________")
    .replace(/placeholder/gi, "________________")
    .replace(/\{\{[^}]+\}\}/g, "________________")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

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
