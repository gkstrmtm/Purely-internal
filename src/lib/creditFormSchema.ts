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
  | "file_upload"
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
  // file_upload only
  maxFiles?: number;
  maxSizeMb?: number;
  allowedContentTypes?: string[];
};

export type CreditFormUploadedFileRef = {
  url: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
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
export type CreditFormContent = {
  displayTitle?: string;
  description?: string;
};

export type CreditFormSubmissionRow = {
  key: string;
  label: string;
  fieldType: CreditFormFieldType | null;
  rawValue: unknown;
  displayValue: string;
  hasResponse: boolean;
};

function isAllowedMimeType(mimeType: string, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  const t = String(mimeType || "").trim();
  if (!t) return false;
  for (const entry of allowed) {
    const rule = String(entry || "").trim();
    if (!rule) continue;
    if (rule.endsWith("/*")) {
      const prefix = rule.slice(0, -1);
      if (t.startsWith(prefix)) return true;
      continue;
    }
    if (t === rule) return true;
  }
  return false;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function shortSubmissionId(id: string): string {
  const s = String(id || "").trim();
  if (!s) return "";
  if (s.length <= 10) return s;
  // cuid() is already pretty random; the tail is enough for humans.
  return s.slice(-8);
}

const ALLOWED_FIELD_TYPES = new Set<CreditFormFieldType>([
  "short_answer",
  "long_answer",
  "paragraph",
  "email",
  "phone",
  "name",
  "signature",
  "file_upload",
  "checklist",
  "radio",
  "text",
  "tel",
  "textarea",
]);

function normalizeAllowedContentTypes(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => v.slice(0, 120))
    .filter((v) => /^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(v) || v.endsWith("/*"))
    .slice(0, 60);
  return out.length ? out : undefined;
}

function normalizeMaxFiles(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

function normalizeMaxSizeMb(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(1, Math.min(500, Math.round(n * 10) / 10));
}

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

    const allowedContentTypes = type === "file_upload" ? normalizeAllowedContentTypes(rec.allowedContentTypes) : undefined;
    const maxFiles = type === "file_upload" ? normalizeMaxFiles(rec.maxFiles) : undefined;
    const maxSizeMb = type === "file_upload" ? normalizeMaxSizeMb(rec.maxSizeMb) : undefined;

    out.push({
      name: name.slice(0, 64),
      label: label.slice(0, 160),
      type: type as CreditFormFieldType,
      required: rec.required === true,
      ...(options ? { options } : {}),
      ...(allowedContentTypes ? { allowedContentTypes } : {}),
      ...(typeof maxFiles === "number" ? { maxFiles } : {}),
      ...(typeof maxSizeMb === "number" ? { maxSizeMb } : {}),
    });
  }

  if (!out.length && defaultIfEmpty) return getDefaultCreditFormFields();
  return out.slice(0, maxFields);
}

function normalizeUploadedFileRef(raw: unknown): CreditFormUploadedFileRef | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const url = typeof rec.url === "string" ? rec.url.trim() : "";
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;

  const fileName = typeof rec.fileName === "string" ? rec.fileName.trim().slice(0, 400) : "";
  const mimeType = typeof rec.mimeType === "string" ? rec.mimeType.trim().slice(0, 120) : "";
  const fileSizeRaw = rec.fileSize;
  const fileSize = typeof fileSizeRaw === "number" && Number.isFinite(fileSizeRaw) && fileSizeRaw >= 0 ? Math.floor(fileSizeRaw) : undefined;

  return {
    url: url.slice(0, 2000),
    ...(fileName ? { fileName } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(typeof fileSize === "number" ? { fileSize } : {}),
  };
}

function normalizeUploadedFilesValue(raw: unknown): CreditFormUploadedFileRef[] {
  const unwrapped = unwrapSubmissionEnvelope(raw);
  const list = Array.isArray(unwrapped) ? unwrapped : unwrapped ? [unwrapped] : [];
  const out: CreditFormUploadedFileRef[] = [];
  for (const entry of list) {
    const normalized = normalizeUploadedFileRef(entry);
    if (normalized) out.push(normalized);
  }
  return out.slice(0, 50);
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
export function normalizeCreditFormContent(raw: unknown): CreditFormContent {
  const rec = asRecord(raw);
  if (!rec) return {};
  const displayTitle = typeof rec.displayTitle === "string" ? rec.displayTitle.trim().slice(0, 160) : "";
  const description = typeof rec.description === "string" ? rec.description.trim().slice(0, 4000) : "";
  const out: CreditFormContent = {};
  if (displayTitle) out.displayTitle = displayTitle;
  if (description) out.description = description;
  return out;
}
export function parseCreditFormContent(schemaJson: unknown): CreditFormContent {
  const schema = asRecord(schemaJson);
  return normalizeCreditFormContent(schema?.content);
}

export function normalizeCreditFormSchema(schemaJson: unknown): Record<string, unknown> {
  const fields = parseCreditFormFields(schemaJson, { defaultIfEmpty: false, maxFields: 50 });
  const style = parseCreditFormStyle(schemaJson);
  const success = parseCreditFormSuccessContent(schemaJson);
  const content = parseCreditFormContent(schemaJson);
  const out: Record<string, unknown> = { fields };
  if (Object.keys(style).length) out.style = style;
  if (Object.keys(success).length) out.success = success;
  if (Object.keys(content).length) out.content = content;
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

  if (fieldType === "file_upload") {
    return normalizeUploadedFilesValue(unwrappedValue);
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

export function validateCreditFormSubmissionPayload(dataJson: unknown, schemaJson: unknown): string | null {
  const record = asRecord(dataJson);
  if (!record) return null;
  const fields = parseCreditFormFields(schemaJson, { defaultIfEmpty: false, maxFields: 200 });

  for (const field of fields) {
    if (field.type !== "signature" || field.required !== true) continue;
    const raw = record[field.name];
    const normalized = normalizeSubmissionEntryValue(raw, "signature");
    if (typeof normalized !== "string" || !normalized.trim()) {
      return `Please add your signature for “${field.label}”.`;
    }
  }

  for (const field of fields) {
    if (field.type !== "file_upload") continue;
    const raw = record[field.name];
    const files = normalizeUploadedFilesValue(raw);

    const maxFiles = typeof field.maxFiles === "number" && Number.isFinite(field.maxFiles) ? field.maxFiles : null;
    const maxSizeMb = typeof field.maxSizeMb === "number" && Number.isFinite(field.maxSizeMb) ? field.maxSizeMb : null;
    const allowed = Array.isArray(field.allowedContentTypes) ? field.allowedContentTypes : undefined;

    if (field.required && files.length === 0) {
      return `Please upload a file for “${field.label}”.`;
    }
    if (maxFiles !== null && files.length > maxFiles) {
      return `“${field.label}” allows up to ${maxFiles} file${maxFiles === 1 ? "" : "s"}.`;
    }
    for (const f of files) {
      if (maxSizeMb !== null && typeof f.fileSize === "number" && f.fileSize > maxSizeMb * 1024 * 1024) {
        return `“${field.label}”: ${f.fileName || "File"} exceeds ${maxSizeMb} MB.`;
      }
      if (allowed && allowed.length) {
        const mt = typeof f.mimeType === "string" ? f.mimeType : "";
        if (!isAllowedMimeType(mt, allowed)) {
          return `“${field.label}”: ${f.fileName || "File"} is not an allowed file type.`;
        }
      }
    }
  }

  return null;
}

export function describeCreditFormSubmissionValue(value: unknown, fieldType?: CreditFormFieldType | null): string {
  if (fieldType === "file_upload") {
    const files = normalizeUploadedFilesValue(value);
    if (!files.length) return "";
    return files
      .map((f) => {
        const name = (f.fileName || "").trim();
        return name ? `${name} (${f.url})` : f.url;
      })
      .join("\n");
  }
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
    `Submission: ${shortSubmissionId(opts.submissionId)}`,
    `Created: ${opts.createdAtIso}`,
    "",
    "Responses:",
    responseLines,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCreditFormSubmissionNotificationHtml(opts: {
  formName: string;
  submissionId: string;
  createdAtIso: string;
  schemaJson: unknown;
  dataJson: unknown;
}): string {
  const rows = buildCreditFormSubmissionRows(opts.schemaJson, opts.dataJson);
  const created = escapeHtml(String(opts.createdAtIso || ""));
  const formName = escapeHtml(String(opts.formName || "Form"));
  const subShort = escapeHtml(shortSubmissionId(opts.submissionId));
  const subFull = escapeHtml(String(opts.submissionId || ""));

  const tableRows = rows.length
    ? rows
        .map((row) => {
          const label = escapeHtml(String(row.label || row.key || "Question"));
          const answer = row.hasResponse ? row.displayValue || "Response on file" : "No response";
          const answerHtml = escapeHtml(String(answer || "")).replace(/\n/g, "<br />");
          return `
            <tr>
              <td style="padding:12px 14px;border-bottom:1px solid #e4e4e7;vertical-align:top;width:42%;color:#18181b;font-weight:600;">${label}</td>
              <td style="padding:12px 14px;border-bottom:1px solid #e4e4e7;vertical-align:top;color:#18181b;white-space:pre-wrap;">${answerHtml || "(blank)"}</td>
            </tr>
          `.trim();
        })
        .join("")
    : `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #e4e4e7;vertical-align:top;color:#18181b;" colspan="2">(No responses)</td>
      </tr>
    `.trim();

  return `
  <div style="font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:#f4f4f5; padding:24px;">
    <div style="max-width:720px; margin:0 auto; background:#ffffff; border:1px solid #e4e4e7; border-radius:16px; overflow:hidden;">
      <div style="padding:18px 20px; background:#0b63f6; color:#ffffff;">
        <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.9;">New form submission</div>
        <div style="margin-top:6px; font-size:18px; font-weight:800;">${formName}</div>
      </div>

      <div style="padding:18px 20px;">
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
          <div style="background:#f4f4f5;border:1px solid #e4e4e7;border-radius:999px;padding:6px 10px;font-size:12px;color:#3f3f46;">
            Submission: <span style="font-weight:700;color:#18181b;">#${subShort}</span>
          </div>
          <div style="background:#f4f4f5;border:1px solid #e4e4e7;border-radius:999px;padding:6px 10px;font-size:12px;color:#3f3f46;">
            Created: <span style="font-weight:700;color:#18181b;">${created}</span>
          </div>
        </div>

        <div style="font-size:12px;color:#71717a;margin-bottom:10px;">Full submission id: ${subFull}</div>

        <table style="width:100%; border-collapse:collapse; border:1px solid #e4e4e7; border-radius:12px; overflow:hidden;">
          <thead>
            <tr>
              <th align="left" style="padding:10px 14px; background:#fafafa; border-bottom:1px solid #e4e4e7; font-size:12px; color:#52525b; text-transform:uppercase; letter-spacing:0.06em;">Question</th>
              <th align="left" style="padding:10px 14px; background:#fafafa; border-bottom:1px solid #e4e4e7; font-size:12px; color:#52525b; text-transform:uppercase; letter-spacing:0.06em;">Response</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
    <div style="max-width:720px;margin:12px auto 0; font-size:12px; color:#71717a; text-align:center;">
      Sent by Purely Automation
    </div>
  </div>
  `.trim();
}