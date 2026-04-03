import { coerceFontFamily, coerceGoogleFamily } from "@/lib/fontPresets";
import { describeSignatureValue, normalizeStoredSignature, readSignatureImageDataUrl, readSignatureText } from "@/lib/signature";

export type CreditFormFieldType =
  | "short_answer"
  | "long_answer"
  | "paragraph"
  | "email"
  | "phone"
  | "name"
  | "signature"
  | "checklist"
  | "radio"
  | "text"
  | "tel"
  | "textarea";

export type CreditFormField = {
  name: string;
  label: string;
  type: CreditFormFieldType;
  required?: boolean;
  options?: string[];
};

export type CreditFormStyle = {
  pageBg?: string;
  cardBg?: string;
  textColor?: string;
  inputBg?: string;
  inputBorder?: string;
  buttonBg?: string;
  buttonText?: string;
  radiusPx?: number;
  submitRadiusPx?: number;
  submitLabel?: string;
  fontFamily?: string;
  fontGoogleFamily?: string;
};

export type CreditFormSuccessContent = {
  title?: string;
  message?: string;
  buttonLabel?: string;
  buttonAction?: "reset" | "redirect";
  buttonUrl?: string;
  accentColor?: string;
  surfaceColor?: string;
  borderColor?: string;
  textColor?: string;
};

export type CreditFormSubmissionRow = {
  key: string;
  label: string;
  fieldType: CreditFormFieldType | null;
  rawValue: unknown;
  displayValue: string;
  hasResponse: boolean;
};

const ALLOWED_FIELD_TYPES = new Set<CreditFormFieldType>([
  "short_answer",
  "long_answer",
  "paragraph",
  "email",
  "phone",
  "name",
  "signature",
  "checklist",
  "radio",
  "text",
  "tel",
  "textarea",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function unwrapSubmissionEnvelope(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;
  if (Object.prototype.hasOwnProperty.call(record, "value")) return unwrapSubmissionEnvelope(record.value);
  if (Object.prototype.hasOwnProperty.call(record, "answer")) return unwrapSubmissionEnvelope(record.answer);
  if (Object.prototype.hasOwnProperty.call(record, "response")) return unwrapSubmissionEnvelope(record.response);
  if (Object.prototype.hasOwnProperty.call(record, "values") && Array.isArray(record.values)) return record.values;
  return value;
}

function parseHexColor(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s === "transparent") return "transparent";
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return null;
  return s;
}

export function getDefaultCreditFormFields(): CreditFormField[] {
  return [
    { name: "fullName", label: "Full name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "message", label: "Message", type: "textarea" },
  ];
}

export function parseCreditFormFields(
  schemaJson: unknown,
  opts?: { defaultIfEmpty?: boolean; maxFields?: number },
): CreditFormField[] {
  const defaultIfEmpty = opts?.defaultIfEmpty !== false;
  const maxFields = Math.max(1, Math.min(200, Math.floor(opts?.maxFields ?? 25)));
  const schema = asRecord(schemaJson);
  const fields = Array.isArray(schema?.fields) ? schema.fields : null;
  if (!fields) return defaultIfEmpty ? getDefaultCreditFormFields() : [];

  const out: CreditFormField[] = [];
  for (const field of fields) {
    const rec = asRecord(field);
    if (!rec) continue;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const label = typeof rec.label === "string" ? rec.label.trim() : "";
    const type = rec.type;
    if (!name || !label || typeof type !== "string" || !ALLOWED_FIELD_TYPES.has(type as CreditFormFieldType)) continue;
    const options = Array.isArray(rec.options)
      ? rec.options
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .slice(0, 50)
      : undefined;
    out.push({
      name: name.slice(0, 64),
      label: label.slice(0, 160),
      type: type as CreditFormFieldType,
      required: rec.required === true,
      ...(options ? { options } : {}),
    });
  }

  if (!out.length && defaultIfEmpty) return getDefaultCreditFormFields();
  return out.slice(0, maxFields);
}

export function parseCreditFormStyle(schemaJson: unknown): CreditFormStyle {
  const schema = asRecord(schemaJson);
  const raw = asRecord(schema?.style);
  if (!raw) return {};

  const out: CreditFormStyle = {};
  const pageBg = parseHexColor(raw.pageBg);
  const cardBg = parseHexColor(raw.cardBg);
  const buttonBg = parseHexColor(raw.buttonBg);
  const buttonText = parseHexColor(raw.buttonText);
  const inputBg = parseHexColor(raw.inputBg);
  const inputBorder = parseHexColor(raw.inputBorder);
  const textColor = parseHexColor(raw.textColor);
  const fontFamily = coerceFontFamily(raw.fontFamily);
  const fontGoogleFamily = coerceGoogleFamily(raw.fontGoogleFamily);
  const submitLabel = typeof raw.submitLabel === "string" ? raw.submitLabel.trim().slice(0, 80) : "";

  if (pageBg) out.pageBg = pageBg;
  if (cardBg) out.cardBg = cardBg;
  if (buttonBg) out.buttonBg = buttonBg;
  if (buttonText) out.buttonText = buttonText;
  if (inputBg) out.inputBg = inputBg;
  if (inputBorder) out.inputBorder = inputBorder;
  if (textColor) out.textColor = textColor;
  if (fontFamily) out.fontFamily = fontFamily;
  if (fontGoogleFamily) out.fontGoogleFamily = fontGoogleFamily;
  if (submitLabel) out.submitLabel = submitLabel;

  if (typeof raw.radiusPx === "number" && Number.isFinite(raw.radiusPx)) {
    out.radiusPx = Math.max(0, Math.min(40, Math.round(raw.radiusPx)));
  }

  if (typeof raw.submitRadiusPx === "number" && Number.isFinite(raw.submitRadiusPx)) {
    out.submitRadiusPx = Math.max(0, Math.min(40, Math.round(raw.submitRadiusPx)));
  }

  return out;
}

export function normalizeCreditFormSuccessContent(raw: unknown): CreditFormSuccessContent {
  const rec = asRecord(raw);
  if (!rec) return {};
  const title = typeof rec.title === "string" ? rec.title.trim().slice(0, 160) : "";
  const message = typeof rec.message === "string" ? rec.message.trim().slice(0, 5000) : "";
  const buttonLabel = typeof rec.buttonLabel === "string" ? rec.buttonLabel.trim().slice(0, 80) : "";
  const buttonAction = rec.buttonAction === "redirect" ? "redirect" : rec.buttonAction === "reset" ? "reset" : "";
  const buttonUrl = typeof rec.buttonUrl === "string" ? rec.buttonUrl.trim().slice(0, 2000) : "";
  const accentColor = parseHexColor(rec.accentColor);
  const surfaceColor = parseHexColor(rec.surfaceColor);
  const borderColor = parseHexColor(rec.borderColor);
  const textColor = parseHexColor(rec.textColor);
  const out: CreditFormSuccessContent = {};
  if (title) out.title = title;
  if (message) out.message = message;
  if (buttonLabel) out.buttonLabel = buttonLabel;
  if (buttonAction) out.buttonAction = buttonAction;
  if (buttonUrl) out.buttonUrl = buttonUrl;
  if (accentColor) out.accentColor = accentColor;
  if (surfaceColor) out.surfaceColor = surfaceColor;
  if (borderColor) out.borderColor = borderColor;
  if (textColor) out.textColor = textColor;
  return out;
}

export function parseCreditFormSuccessContent(schemaJson: unknown): CreditFormSuccessContent {
  const schema = asRecord(schemaJson);
  return normalizeCreditFormSuccessContent(schema?.success);
}

export function normalizeCreditFormSchema(schemaJson: unknown): Record<string, unknown> {
  const fields = parseCreditFormFields(schemaJson, { defaultIfEmpty: false, maxFields: 50 });
  const style = parseCreditFormStyle(schemaJson);
  const success = parseCreditFormSuccessContent(schemaJson);
  const out: Record<string, unknown> = { fields };
  if (Object.keys(style).length) out.style = style;
  if (Object.keys(success).length) out.success = success;
  return out;
}

function normalizeSubmissionEntryValue(value: unknown, fieldType: CreditFormFieldType | null): unknown {
  const unwrappedValue = unwrapSubmissionEnvelope(value);

  if (fieldType === "signature") {
    if (Array.isArray(unwrappedValue)) {
      for (const entry of unwrappedValue) {
        const normalized = normalizeStoredSignature(entry);
        if (normalized) return normalized;
      }
      return "";
    }
    return normalizeStoredSignature(unwrappedValue);
  }

  if (Array.isArray(unwrappedValue)) return unwrappedValue.map((entry) => normalizeSubmissionEntryValue(entry, null));
  return unwrappedValue;
}

export function normalizeCreditFormSubmissionPayload(dataJson: unknown, schemaJson: unknown): Record<string, unknown> {
  const record = asRecord(dataJson);
  if (!record) return {};
  const fields = parseCreditFormFields(schemaJson, { defaultIfEmpty: false, maxFields: 200 });
  const fieldTypeByName = new Map(fields.map((field) => [field.name, field.type] as const));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = normalizeSubmissionEntryValue(value, fieldTypeByName.get(key) ?? null);
  }
  return out;
}

export function describeCreditFormSubmissionValue(value: unknown, fieldType?: CreditFormFieldType | null): string {
  if (fieldType === "signature" || readSignatureImageDataUrl(value) || readSignatureText(value)) {
    return describeSignatureValue(value);
  }
  const unwrappedValue = unwrapSubmissionEnvelope(value);
  if (typeof unwrappedValue === "string") return unwrappedValue.trim();
  if (typeof unwrappedValue === "number" || typeof unwrappedValue === "boolean") return String(unwrappedValue);
  if (Array.isArray(unwrappedValue)) {
    return unwrappedValue
      .map((entry) => describeCreditFormSubmissionValue(entry, null))
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(", ");
  }
  if (unwrappedValue && typeof unwrappedValue === "object") {
    try {
      return JSON.stringify(unwrappedValue, null, 2).trim();
    } catch {
      return "";
    }
  }
  return "";
}

export function buildCreditFormSubmissionRows(schemaJson: unknown, dataJson: unknown): CreditFormSubmissionRow[] {
  const fields = parseCreditFormFields(schemaJson, { defaultIfEmpty: false, maxFields: 200 });
  const data = asRecord(dataJson) ?? {};
  const rows: CreditFormSubmissionRow[] = [];
  const seen = new Set<string>();

  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(data, field.name)) continue;
    const rawValue = data[field.name];
    const normalizedSignatureValue = field.type === "signature" ? normalizeStoredSignature(rawValue) : "";
    const displayValue = describeCreditFormSubmissionValue(rawValue, field.type) || (normalizedSignatureValue ? "Signature on file" : "");
    rows.push({
      key: field.name,
      label: field.label,
      fieldType: field.type,
      rawValue,
      displayValue,
      hasResponse: field.type === "signature" ? Boolean(normalizedSignatureValue) : Boolean(displayValue.trim() || readSignatureImageDataUrl(rawValue)),
    });
    seen.add(field.name);
  }

  for (const [key, rawValue] of Object.entries(data)) {
    if (seen.has(key)) continue;
    const displayValue = describeCreditFormSubmissionValue(rawValue, null);
    rows.push({
      key,
      label: key,
      fieldType: null,
      rawValue,
      displayValue,
      hasResponse: Boolean(displayValue.trim() || readSignatureImageDataUrl(rawValue)),
    });
  }

  return rows;
}

function indentMultiline(value: string): string {
  return value
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

export function buildCreditFormSubmissionNotificationText(opts: {
  formName: string;
  submissionId: string;
  createdAtIso: string;
  schemaJson: unknown;
  dataJson: unknown;
  userAgent?: string | null;
}): string {
  const rows = buildCreditFormSubmissionRows(opts.schemaJson, opts.dataJson);
  const responseLines = rows.length
    ? rows
        .map((row) => {
          const answer = row.hasResponse ? row.displayValue || "Response on file" : "No response";
          return answer.includes("\n") ? `${row.label}:\n${indentMultiline(answer)}` : `${row.label}: ${answer}`;
        })
        .join("\n\n")
    : "(none)";

  return [
    `Form: ${opts.formName}`,
    `Submission ID: ${opts.submissionId}`,
    `Created: ${opts.createdAtIso}`,
    opts.userAgent ? `User agent: ${opts.userAgent}` : "",
    "",
    "Responses:",
    responseLines,
  ]
    .filter(Boolean)
    .join("\n");
}