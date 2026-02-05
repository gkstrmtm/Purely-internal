export function normalizePhoneForStorage(inputRaw: string) {
  const input = inputRaw.trim();
  if (!input) return null;

  const hasPlus = input.startsWith("+");
  const digits = input.replace(/\D/g, "");

  // Basic sanity: most valid numbers are 10-15 digits.
  if (digits.length < 10 || digits.length > 15) return null;

  if (!hasPlus) {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }

  return `+${digits}`;
}

export type StrictPhoneNormalizeResult =
  | { ok: true; e164: string | null; display: string }
  | { ok: false; error: string };

function formatUsE164(e164: string): string {
  // Expected: +1XXXXXXXXXX
  const digits = e164.startsWith("+") ? e164.slice(1) : e164;
  if (digits.length !== 11 || !digits.startsWith("1")) return e164;
  const area = digits.slice(1, 4);
  const central = digits.slice(4, 7);
  const line = digits.slice(7, 11);
  return `+1 (${area}) ${central}-${line}`;
}

export function formatPhoneForDisplay(inputRaw: string): string {
  const raw = String(inputRaw ?? "").trim();
  if (!raw) return "";

  const normalized = normalizePhoneForStorage(raw);
  if (!normalized) return raw;

  if (normalized.startsWith("+1") && normalized.length === 12) {
    return formatUsE164(normalized);
  }

  return normalized;
}

export function normalizePhoneStrict(inputRaw: string): StrictPhoneNormalizeResult {
  const input = String(inputRaw ?? "").trim();
  if (!input) return { ok: true, e164: null, display: "" };

  // Only allow common phone characters.
  if (!/^[0-9+()\- .]*$/.test(input)) {
    return { ok: false, error: "Phone number contains invalid characters" };
  }

  const plusCount = (input.match(/\+/g) ?? []).length;
  if (plusCount > 1 || (plusCount === 1 && !input.startsWith("+"))) {
    return { ok: false, error: "Phone number format is invalid" };
  }

  const normalized = normalizePhoneForStorage(input);
  if (!normalized) {
    return { ok: false, error: "Phone number must be 10–15 digits" };
  }

  const display = normalized.startsWith("+1") && normalized.length === 12 ? formatUsE164(normalized) : normalized;
  return { ok: true, e164: normalized, display };
}
