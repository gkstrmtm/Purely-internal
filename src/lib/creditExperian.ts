import type { CreditScope } from "@/lib/creditReports";

type PortalContactIdentity = {
  name: string | null;
  email: string | null;
  phone: string | null;
  customVariables?: unknown;
};

type ExperianIdentity = {
  firstName: string;
  middleName?: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  phoneType?: string;
  ssn?: string;
  dob?: string;
  currentAddress: string;
  currentCity: string;
  currentState: string;
  currentZip: string;
  previousAddress?: string;
  previousCity?: string;
  previousState?: string;
  previousZip?: string;
};

type ExperianConfig = {
  baseUrl: string;
  authToken: string;
  productId: string;
  purposeType: string;
  riskModel?: string;
  tspToken?: string;
  includeImage?: string;
  includeRace?: string;
  propertyZip?: string;
};

type ExperianPullResult = {
  provider: string;
  rawJson: Record<string, unknown>;
  warnings: string[];
  summary: Record<string, unknown>;
};

type HttpError = Error & { status?: number };

function createHttpError(message: string, status: number): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProvider(value: string) {
  const normalized = value.trim().toUpperCase();
  return normalized || "STUB";
}

function splitContactName(name: string | null) {
  const cleaned = normalizeText(name);
  if (!cleaned) return { firstName: "", lastName: "" };
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function flattenCustomVariables(customVariables: unknown) {
  const source = readObject(customVariables) || {};
  const flat = new Map<string, string>();

  const visit = (value: Record<string, unknown>) => {
    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (!normalizedKey) continue;
      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        const text = String(entry).trim();
        if (text) flat.set(normalizedKey, text);
        continue;
      }
      const nested = readObject(entry);
      if (nested) visit(nested);
    }
  };

  visit(source);
  return flat;
}

function readCustomValue(flat: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const value = flat.get(normalized);
    if (value) return value;
  }
  return "";
}

function digitsOnly(value: string) {
  return value.replace(/\D+/g, "");
}

function normalizePhone(value: string) {
  const digits = digitsOnly(value);
  return digits || value;
}

function normalizeDob(value: string) {
  const digits = digitsOnly(value);
  if (digits.length === 8) {
    const looksIso = /^\d{4}\d{2}\d{2}$/.test(digits);
    if (looksIso) {
      return `${digits.slice(4, 6)}${digits.slice(6, 8)}${digits.slice(0, 4)}`;
    }
    return digits;
  }
  const iso = normalizeText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}${iso[3]}${iso[1]}`;
  return digits;
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/connectapi";
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

function resolveExperianConfig(): ExperianConfig {
  const authToken = normalizeText(process.env.EXPERIAN_CONNECT_AUTH_TOKEN);
  const baseUrl = normalizeBaseUrl(normalizeText(process.env.EXPERIAN_CONNECT_BASE_URL));
  const productId = normalizeText(process.env.EXPERIAN_CONNECT_PRODUCT_ID) || "38";
  const purposeType = normalizeText(process.env.EXPERIAN_CONNECT_PURPOSE_TYPE) || "7";

  const missing = [
    !baseUrl ? "EXPERIAN_CONNECT_BASE_URL" : "",
    !authToken ? "EXPERIAN_CONNECT_AUTH_TOKEN" : "",
  ].filter(Boolean);

  if (missing.length) {
    throw createHttpError(`Experian is not configured. Set ${missing.join(", ")}.`, 400);
  }

  return {
    baseUrl,
    authToken,
    productId,
    purposeType,
    riskModel: normalizeText(process.env.EXPERIAN_CONNECT_RISK_MODEL) || undefined,
    tspToken: normalizeText(process.env.EXPERIAN_CONNECT_TSP_TOKEN) || undefined,
    includeImage: normalizeText(process.env.EXPERIAN_CONNECT_INCLUDE_IMAGE) || undefined,
    includeRace: normalizeText(process.env.EXPERIAN_CONNECT_INCLUDE_RACE) || undefined,
    propertyZip: normalizeText(process.env.EXPERIAN_CONNECT_PROPERTY_ZIP) || undefined,
  };
}

function buildExperianIdentity(contact: PortalContactIdentity): { identity: ExperianIdentity; warnings: string[] } {
  const flat = flattenCustomVariables(contact.customVariables);
  const fallbackName = splitContactName(contact.name);

  const firstName = readCustomValue(flat, ["experianFirstName", "firstName", "givenName", "firstname"]) || fallbackName.firstName;
  const middleName = readCustomValue(flat, ["experianMiddleName", "middleName", "middlename"]);
  const lastName = readCustomValue(flat, ["experianLastName", "lastName", "surname", "lastname"]) || fallbackName.lastName;
  const email = readCustomValue(flat, ["experianEmail", "email"]) || normalizeText(contact.email);
  const phoneNumber = normalizePhone(readCustomValue(flat, ["experianPhone", "phoneNumber", "phone", "mobilePhone"]) || normalizeText(contact.phone));
  const currentAddress = readCustomValue(flat, ["experianCurrentAddress", "currentAddress", "address", "streetAddress", "address1"]);
  const currentCity = readCustomValue(flat, ["experianCurrentCity", "currentCity", "city"]);
  const currentState = readCustomValue(flat, ["experianCurrentState", "currentState", "state"]);
  const currentZip = digitsOnly(readCustomValue(flat, ["experianCurrentZip", "currentZip", "zip", "zipCode", "postalCode"]));
  const ssn = digitsOnly(readCustomValue(flat, ["experianSsn", "ssn", "socialSecurityNumber", "socialsecuritynumber"]));
  const dob = normalizeDob(readCustomValue(flat, ["experianDob", "dob", "dateOfBirth", "birthDate", "birthdate"]));

  const missing = [
    !firstName ? "first name" : "",
    !lastName ? "last name" : "",
    !currentAddress ? "current address" : "",
    !currentCity ? "current city" : "",
    !currentState ? "current state" : "",
    !currentZip ? "current zip" : "",
  ].filter(Boolean);

  if (missing.length) {
    throw createHttpError(
      `This contact is missing Experian identity fields: ${missing.join(", ")}. Save them in contact custom variables before pulling a report.`,
      400,
    );
  }

  const warnings = [
    !ssn ? "No SSN found in contact custom variables. Experian may return a thinner file." : "",
    !dob ? "No DOB found in contact custom variables. Experian may return a thinner file." : "",
  ].filter(Boolean);

  return {
    identity: {
      firstName,
      ...(middleName ? { middleName } : {}),
      lastName,
      ...(email ? { email } : {}),
      ...(phoneNumber ? { phoneNumber, phoneType: "C" } : {}),
      ...(ssn ? { ssn } : {}),
      ...(dob ? { dob } : {}),
      currentAddress,
      currentCity,
      currentState,
      currentZip,
      ...(readCustomValue(flat, ["experianPreviousAddress", "previousAddress"]) ? { previousAddress: readCustomValue(flat, ["experianPreviousAddress", "previousAddress"]) } : {}),
      ...(readCustomValue(flat, ["experianPreviousCity", "previousCity"]) ? { previousCity: readCustomValue(flat, ["experianPreviousCity", "previousCity"]) } : {}),
      ...(readCustomValue(flat, ["experianPreviousState", "previousState"]) ? { previousState: readCustomValue(flat, ["experianPreviousState", "previousState"]) } : {}),
      ...(readCustomValue(flat, ["experianPreviousZip", "previousZip"]) ? { previousZip: digitsOnly(readCustomValue(flat, ["experianPreviousZip", "previousZip"])) } : {}),
    },
    warnings,
  };
}

function buildRequestBody(params: Record<string, unknown>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    const text = normalizeText(value);
    if (!text) continue;
    body.set(key, text);
  }
  return body;
}

async function callExperianEndpoint(config: ExperianConfig, path: string, params: Record<string, unknown>) {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: buildRequestBody({ ...params, ...(config.tspToken ? { tspToken: config.tspToken } : {}) }),
    cache: "no-store",
  });

  const payload = await res.json().catch(() => null);
  const payloadObject = readObject(payload);
  const errorObject = readObject(payloadObject?.error);
  if (!res.ok) {
    const message = normalizeText(errorObject?.Message) || normalizeText(errorObject?.message) || `Experian request failed (${res.status}).`;
    throw createHttpError(message, res.status);
  }

  const success = payloadObject?.success;
  const error = payloadObject?.error;
  if (success === false || error) {
    const normalizedError = readObject(error);
    const code = normalizeText(normalizedError?.Code || normalizedError?.code);
    const message = normalizeText(normalizedError?.Message || normalizedError?.message) || "Experian returned an error.";
    throw createHttpError(code ? `${message} (${code})` : message, 400);
  }

  return payload as Record<string, unknown>;
}

export function getConfiguredCreditPullProvider() {
  const provider = normalizeProvider(process.env.CREDIT_PULL_PROVIDER || "EXPERIAN");
  return provider;
}

export function configuredCreditPullProviderLabel() {
  return getConfiguredCreditPullProvider() === "EXPERIAN" ? "Experian" : getConfiguredCreditPullProvider();
}

export async function executeExperianCreditPull(params: {
  contact: PortalContactIdentity;
  creditScope: CreditScope;
  ipAddress?: string | null;
}): Promise<ExperianPullResult> {
  const config = resolveExperianConfig();
  const { identity, warnings } = buildExperianIdentity(params.contact);

  const manualTokenPayload = await callExperianEndpoint(config, "/v3/auth/manual/createConsumerToken", identity);
  const consumerToken = normalizeText(manualTokenPayload.UserToken || manualTokenPayload.userToken);
  if (!consumerToken) {
    throw createHttpError("Experian did not return a consumer token.", 502);
  }

  const reportPayload = await callExperianEndpoint(config, "/v3/report", {
    productId: config.productId,
    consumerToken,
    purposeType: config.purposeType,
    ...(params.ipAddress ? { ipAddress: params.ipAddress } : {}),
    ...(config.propertyZip ? { propertyZip: config.propertyZip } : {}),
    ...(config.includeImage ? { includeImage: config.includeImage } : {}),
    ...(config.includeRace ? { includeRace: config.includeRace } : {}),
    ...(config.riskModel ? { riskModel: config.riskModel } : {}),
  });

  const rawResponse = readObject(reportPayload) || {};
  const normalizedResponse: Record<string, unknown> = {
    provider: "Experian",
    creditScope: params.creditScope,
    requestedAt: new Date().toISOString(),
    success: rawResponse.success ?? true,
    transactionId: rawResponse.transactionId ?? rawResponse.referenceID ?? null,
    CreditProfile: rawResponse.CreditProfile ?? null,
    BackgroundData: rawResponse.BackgroundData ?? null,
    rawResponse,
    identitySummary: {
      firstName: identity.firstName,
      lastName: identity.lastName,
      email: identity.email || null,
      currentCity: identity.currentCity,
      currentState: identity.currentState,
      currentZip: identity.currentZip,
    },
    pullConfig: {
      productId: config.productId,
      purposeType: config.purposeType,
      riskModel: config.riskModel || "VP",
    },
    warnings,
  };

  return {
    provider: "Experian",
    rawJson: normalizedResponse,
    warnings,
    summary: {
      transactionId: normalizedResponse.transactionId,
      success: normalizedResponse.success,
      warnings,
    },
  };
}