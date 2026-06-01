export type CreditScope = "PERSONAL" | "BUSINESS" | "BOTH";
export type CreditReportAuditTag = "PENDING" | "NEGATIVE" | "POSITIVE";

export type CreditBureauScore = {
  bureau: string;
  score: number;
};

export type CreditReportOverviewField = {
  label: string;
  value: string;
};

export type CreditReportOverviewSection = {
  key: string;
  title: string;
  fields: CreditReportOverviewField[];
};

export type CreditReportSnapshot = {
  currentScore: number | null;
  targetScore: number | null;
  scoreDelta: number | null;
  bureauScores: CreditBureauScore[];
  goals: string[];
  utilizationPercent: number | null;
  openDisputes: number | null;
  nextMilestone: string | null;
};

type CreditItemLike = {
  label?: string | null;
  kind?: string | null;
  bureau?: string | null;
  disputeStatus?: string | null;
  detailsJson?: unknown;
  auditTag?: CreditReportAuditTag | null;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function findNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map((entry) => readObject(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry));
  }
  const object = readObject(value);
  return object ? [object] : [];
}

function firstObject(values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const object = readObject(value);
    if (object) return object;
  }
  return null;
}

function readDescriptor(value: unknown): string {
  const object = readObject(value);
  if (object) {
    const described = [object.desc, object.value, object.label, object.name]
      .map((entry) => normalizeText(entry))
      .find(Boolean);
    if (described) return described;
  }
  return normalizeText(value);
}

function joinText(parts: Array<unknown>, separator = " • ") {
  return parts.map((part) => readDescriptor(part)).filter(Boolean).join(separator);
}

function formatCurrencyLike(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "";
  const numeric = findNumber(text);
  if (numeric === null) return text;
  if (!/^[-\d.,]+$/.test(text)) return text;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
  }).format(numeric);
}

function uniqText(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function readExperianRoot(rawJson: unknown) {
  return readObject(rawJson) || {};
}

function readExperianCreditProfile(rawJson: unknown): Record<string, unknown> | null {
  const raw = readExperianRoot(rawJson);
  const reports = readObject(raw.reports);
  const direct = readObject(raw.CreditProfile);
  const nested = readObject(reports?.CreditProfile);
  const candidate = direct || nested;
  const report = candidate ? readObject(candidate.report) : null;
  if (report) return report;
  if (candidate && (candidate.Header || candidate.TradeLine || candidate.ProfileSummary || candidate.RiskModel)) return candidate;
  const rawReport = readObject(raw.report);
  if (rawReport && (rawReport.TradeLine || rawReport.ProfileSummary || rawReport.RiskModel)) return rawReport;
  return null;
}

function readExperianBackgroundData(rawJson: unknown): Record<string, unknown> | null {
  const raw = readExperianRoot(rawJson);
  const reports = readObject(raw.reports);
  return firstObject([raw.BackgroundData, reports?.BackgroundData]);
}

function mapGenericExtractedItems(rawJson: unknown): CreditItemLike[] {
  const raw = readObject(rawJson);
  if (!raw) return [];

  const candidates: unknown[] = [
    raw.items,
    raw.accounts,
    raw.tradelines,
    raw.inquiries,
    raw.collections,
    raw.publicRecords,
    raw.negativeItems,
    readObject(raw.report)?.items,
    readObject(raw.report)?.accounts,
    readObject(raw.report)?.tradelines,
  ];

  const firstArray = candidates.find((candidate) => Array.isArray(candidate));
  if (!Array.isArray(firstArray)) return [];

  return firstArray.map((item) => {
    const entry = readObject(item) || {};
    const label = uniqText([
      normalizeText(entry.label),
      normalizeText(entry.name),
      normalizeText(entry.creditor),
      normalizeText(entry.furnisher),
      normalizeText(entry.company),
      normalizeText(entry.accountName),
      normalizeText(entry.accountNumber),
    ])[0] || "Item";
    return {
      bureau: normalizeText(entry.bureau) || null,
      kind: normalizeText(entry.kind) || null,
      label,
      disputeStatus: normalizeText(entry.disputeStatus) || null,
      detailsJson: item,
    };
  });
}

export function extractCreditReportItems(rawJson: unknown): CreditItemLike[] {
  const report = readExperianCreditProfile(rawJson);
  if (!report) return mapGenericExtractedItems(rawJson);

  const items: CreditItemLike[] = [];
  const tradelines = readArray(report.TradeLine);
  const inquiries = readArray(report.Inquiry);
  const publicRecords = readArray(report.PublicRecord);
  const employment = readArray(report.EmploymentInformation);
  const addresses = readArray(report.AddressInformation);
  const statements = readArray(report.Statement);
  const infoMessages = readArray(report.InformationalMessage);

  for (const tradeline of tradelines) {
    const label = uniqText([
      normalizeText(tradeline.SubscriberDisplayName),
      normalizeText(Array.isArray(tradeline.OriginalCreditorName) ? tradeline.OriginalCreditorName[0] : tradeline.OriginalCreditorName),
      readDescriptor(tradeline.AccountType),
      readDescriptor(tradeline.Status),
      "Tradeline",
    ])[0] || "Tradeline";
    const kind = uniqText([
      readDescriptor(tradeline.AccountType),
      readDescriptor(tradeline.RevolvingOrInstallment),
      "Tradeline",
    ])[0] || "Tradeline";
    const disputeStatus = uniqText([
      normalizeText(tradeline.DisputeFlag),
      normalizeText(tradeline.ConsumerComment),
    ])[0] || null;
    items.push({
      bureau: "Experian",
      kind,
      label,
      disputeStatus,
      detailsJson: tradeline,
    });
  }

  for (const inquiry of inquiries) {
    const label = uniqText([
      normalizeText(inquiry.SubscriberDisplayName),
      readDescriptor(inquiry.Type),
      "Inquiry",
    ]).join(" ") || "Inquiry";
    items.push({
      bureau: "Experian",
      kind: "Inquiry",
      label,
      disputeStatus: null,
      detailsJson: inquiry,
    });
  }

  for (const record of publicRecords) {
    const label = uniqText([
      readDescriptor(record.Status),
      readDescriptor(record.Court),
      normalizeText(record.PlaintiffName),
      "Public record",
    ])[0] || "Public record";
    items.push({
      bureau: "Experian",
      kind: "Public record",
      label,
      disputeStatus: normalizeText(record.DisputeFlag) || null,
      detailsJson: record,
    });
  }

  for (const employer of employment) {
    const label = uniqText([
      normalizeText(employer.Name),
      "Employment history",
    ])[0] || "Employment history";
    items.push({
      bureau: "Experian",
      kind: "Employment",
      label,
      disputeStatus: null,
      detailsJson: employer,
    });
  }

  for (const address of addresses) {
    const line = joinText([
      address.StreetName,
      address.City,
      address.State,
      address.Zip,
    ], ", ");
    items.push({
      bureau: "Experian",
      kind: "Address",
      label: line ? `Address on file: ${line}` : "Address on file",
      disputeStatus: null,
      detailsJson: address,
    });
  }

  for (const statement of statements) {
    const label = uniqText([
      normalizeText(statement.StatementText),
      readDescriptor(statement.Type),
      "Consumer statement",
    ])[0] || "Consumer statement";
    items.push({
      bureau: "Experian",
      kind: "Statement",
      label,
      disputeStatus: null,
      detailsJson: statement,
    });
  }

  for (const message of infoMessages) {
    const label = uniqText([
      normalizeText(message.MessageText),
      normalizeText(message.MessageNumber) ? `Message ${normalizeText(message.MessageNumber)}` : "",
      "Informational message",
    ])[0] || "Informational message";
    items.push({
      bureau: "Experian",
      kind: "Info",
      label,
      disputeStatus: null,
      detailsJson: message,
    });
  }

  return items.length ? items : mapGenericExtractedItems(rawJson);
}

export function extractCreditInquiryDate(details: unknown): string | null {
  const object = readObject(details);
  if (!object) return null;

  const directKeys = ["inquiryDate", "dateOfInquiry", "date_of_inquiry", "inquiry_date", "inquiredOn", "date"];
  for (const key of directKeys) {
    const value = normalizeText(object[key]);
    if (value) return value;
  }

  for (const value of Object.values(object)) {
    const nested = readObject(value);
    if (!nested) continue;
    for (const key of directKeys) {
      const nestedValue = normalizeText(nested[key]);
      if (nestedValue) return nestedValue;
    }
  }

  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
    .slice(0, 8);
}

function bureauLabel(raw: string) {
  const value = raw.trim().toLowerCase();
  if (value === "tu" || value === "transunion") return "TransUnion";
  if (value === "eq" || value === "equifax") return "Equifax";
  if (value === "ex" || value === "experian") return "Experian";
  return raw.trim();
}

export function normalizeCreditScope(raw: unknown): CreditScope {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (value === "BUSINESS" || value === "BOTH") return value;
  return "PERSONAL";
}

export function creditScopeLabel(scope: CreditScope) {
  if (scope === "BUSINESS") return "Business credit";
  if (scope === "BOTH") return "Personal + business credit";
  return "Personal credit";
}

export function deriveCreditReportItemAudit(item: CreditItemLike): { auditTag: CreditReportAuditTag; reason: string } {
  const label = normalizeText(item.label).toLowerCase();
  const kind = normalizeText(item.kind).toLowerCase();
  const disputeStatus = normalizeText(item.disputeStatus).toLowerCase();
  const details = JSON.stringify(item.detailsJson || {}).toLowerCase();
  const haystack = [label, kind, disputeStatus, details].filter(Boolean).join(" ");

  const resolvedSignals = ["removed", "deleted", "resolved", "paid as agreed", "verified positive", "closed in good standing"];
  if (resolvedSignals.some((signal) => haystack.includes(signal))) {
    return { auditTag: "POSITIVE", reason: "Resolved or verified clean on the file." };
  }

  const negativeSignals = [
    "collection",
    "charge-off",
    "charge off",
    "late payment",
    "past due",
    "repossession",
    "bankruptcy",
    "foreclosure",
    "tax lien",
    "judgment",
    "derogatory",
    "settlement",
    "medical collection",
    "utilization",
    "high balance",
  ];
  if (negativeSignals.some((signal) => haystack.includes(signal))) {
    return { auditTag: "NEGATIVE", reason: "Negative account history or balance issue needs action." };
  }

  const reviewSignals = [
    "inquiry",
    "hard pull",
    "personal info",
    "address",
    "name variation",
    "employment",
    "identity",
    "mixed file",
    "verify",
    "follow_up",
    "follow-up",
    "open",
    "pending",
  ];
  if (reviewSignals.some((signal) => haystack.includes(signal))) {
    return { auditTag: "PENDING", reason: "Needs review before deciding whether it should move into dispute." };
  }

  if (item.auditTag) {
    if (item.auditTag === "NEGATIVE") return { auditTag: "NEGATIVE", reason: "Imported as a negative item from the report source." };
    if (item.auditTag === "POSITIVE") return { auditTag: "POSITIVE", reason: "Imported as a clean item from the report source." };
  }

  return { auditTag: "PENDING", reason: "Awaiting review because the source data is not specific enough yet." };
}

export function estimateCreditScoreFromItems(items: Array<CreditItemLike>) {
  const negative = items.filter((item) => deriveCreditReportItemAudit(item).auditTag === "NEGATIVE").length;
  const pending = items.filter((item) => deriveCreditReportItemAudit(item).auditTag === "PENDING").length;
  return clamp(716 - negative * 28 - pending * 11, 540, 760);
}

export function extractCreditReportSnapshot(rawJson: unknown, items: Array<CreditItemLike> = []): CreditReportSnapshot {
  const raw = readObject(rawJson) || {};
  const profile = readObject(raw.profile) || readObject(raw.summary) || {};
  const experianProfile = readExperianCreditProfile(rawJson) || {};
  const experianSummary = firstObject([
    Array.isArray(experianProfile.ProfileSummary) ? experianProfile.ProfileSummary[0] : experianProfile.ProfileSummary,
    raw.profileSummary,
  ]) || {};
  const experianRiskModel = firstObject([
    Array.isArray(experianProfile.RiskModel) ? experianProfile.RiskModel[0] : experianProfile.RiskModel,
  ]) || {};
  const bureauScoresSource = readObject(raw.bureauScores) || readObject(profile.bureauScores) || {};

  let bureauScores = Object.entries(bureauScoresSource)
    .map(([bureau, score]) => ({ bureau: bureauLabel(bureau), score: findNumber(score) }))
    .filter((entry): entry is CreditBureauScore => Boolean(entry.bureau) && entry.score !== null)
    .map((entry) => ({ bureau: entry.bureau, score: clamp(entry.score, 300, 850) }))
    .sort((a, b) => a.bureau.localeCompare(b.bureau));

  const scoreCandidates = [
    findNumber(raw.currentScore),
    findNumber(profile.currentScore),
    findNumber(raw.score),
    findNumber(profile.score),
    findNumber(experianRiskModel.Score),
  ].filter((value): value is number => value !== null);

  const bureauAverage = bureauScores.length
    ? Math.round(bureauScores.reduce((sum, entry) => sum + entry.score, 0) / bureauScores.length)
    : null;

  const currentScore = scoreCandidates[0] ?? bureauAverage ?? (items.length ? estimateCreditScoreFromItems(items) : null);
  if (!bureauScores.length && currentScore !== null && Object.keys(experianProfile).length) {
    bureauScores = [{ bureau: "Experian", score: clamp(currentScore, 300, 850) }];
  }
  const targetScore = clamp(
    findNumber(raw.targetScore) ?? findNumber(profile.targetScore) ?? ((currentScore ?? 640) + 55),
    580,
    850,
  );
  const experianAvailablePercent = findNumber(experianSummary.RevolvingAvailablePercent);
  const experianUtilization = experianAvailablePercent !== null ? clamp(100 - experianAvailablePercent, 0, 100) : null;
  const utilizationPercent = clamp(
    findNumber(raw.utilizationPercent) ?? findNumber(profile.utilizationPercent) ?? findNumber(profile.utilization) ?? experianUtilization ?? 0,
    0,
    100,
  );
  const generatedGoals = uniqText([
    utilizationPercent > 10 ? "Bring utilization below 10%" : null,
    (findNumber(experianSummary.DelinquenciesOver30Days) ?? 0) > 0 ? "Resolve delinquent accounts first" : null,
    (findNumber(experianSummary.PublicRecordsCount) ?? 0) > 0 ? "Address remaining public records" : null,
    (findNumber(experianSummary.InquiriesDuringLast6Months) ?? 0) > 2 ? "Pause new applications while inquiries age" : null,
    (findNumber(experianSummary.DisputedAccountsExcluded) ?? 0) > 0 ? "Track active disputes until they refresh" : null,
    currentScore !== null && currentScore < 680 ? "Build into the next score tier before a wider funding push" : null,
  ]);
  const goals = [
    ...readStringArray(raw.goals),
    ...readStringArray(profile.goals),
    ...generatedGoals,
  ].filter((goal, index, all) => all.indexOf(goal) === index).slice(0, 5);

  const openDisputes =
    findNumber(raw.openDisputes) ??
    findNumber(profile.openDisputes) ??
    findNumber(experianSummary.DisputedAccountsExcluded) ??
    items.filter((item) => {
      const disputeStatus = normalizeText(item.disputeStatus).toLowerCase();
      return disputeStatus.includes("open") || disputeStatus.includes("follow") || disputeStatus.includes("pending");
    }).length;

  const firstInfoMessage = readArray(experianProfile.InformationalMessage)
    .map((entry) => normalizeText(entry.MessageText))
    .find(Boolean);

  const nextMilestone =
    normalizeText(raw.nextMilestone) ||
    normalizeText(profile.nextMilestone) ||
    firstInfoMessage ||
    (utilizationPercent > 10
      ? "Bring revolving utilization under 10% before applying again."
      : items.some((item) => deriveCreditReportItemAudit(item).auditTag === "NEGATIVE")
        ? "Finish disputes on the remaining negative accounts."
        : currentScore && currentScore < 700
          ? "Keep clean history reporting until the score clears 700+."
          : "File is clean enough to stay selective and protect the score gains.");

  return {
    currentScore,
    targetScore,
    scoreDelta: currentScore !== null && targetScore !== null ? Math.max(targetScore - currentScore, 0) : null,
    bureauScores,
    goals,
    utilizationPercent: Number.isFinite(utilizationPercent) ? utilizationPercent : null,
    openDisputes,
    nextMilestone: nextMilestone || null,
  };
}

export function extractCreditReportOverview(rawJson: unknown): CreditReportOverviewSection[] {
  const raw = readExperianRoot(rawJson);
  const report = readExperianCreditProfile(rawJson);
  if (!report) return [];

  const summary = firstObject([
    Array.isArray(report.ProfileSummary) ? report.ProfileSummary[0] : report.ProfileSummary,
  ]) || {};
  const riskModel = firstObject([
    Array.isArray(report.RiskModel) ? report.RiskModel[0] : report.RiskModel,
  ]) || {};
  const identity = firstObject(readArray(report.ConsumerIdentity)) || {};
  const background = readExperianBackgroundData(rawJson);

  const sections: CreditReportOverviewSection[] = [];

  const requestFields = [
    { label: "Transaction", value: normalizeText(raw.transactionId) || normalizeText(raw.referenceID) },
    { label: "Report date", value: normalizeText(readObject(report.Header)?.ReportDate) },
    { label: "Report time", value: normalizeText(readObject(report.Header)?.ReportTime) },
    { label: "Provider", value: normalizeText(raw.provider) || "Experian" },
  ].filter((field) => field.value);
  if (requestFields.length) {
    sections.push({ key: "request", title: "Report request", fields: requestFields });
  }

  const identityFields = [
    { label: "Name", value: joinText([
      readObject(identity.Name)?.First,
      readObject(identity.Name)?.Middle,
      readObject(identity.Name)?.Surname,
    ], " ") },
    { label: "DOB", value: normalizeText(identity.DOB) },
    { label: "Addresses", value: String(readArray(report.AddressInformation).length || 0) },
    { label: "Employers", value: String(readArray(report.EmploymentInformation).length || 0) },
  ].filter((field) => field.value && field.value !== "0");
  if (identityFields.length) {
    sections.push({ key: "identity", title: "Identity", fields: identityFields });
  }

  const profileFields = [
    { label: "Total trades", value: normalizeText(summary.TotalTradeItems) },
    { label: "Total inquiries", value: normalizeText(summary.TotalInquiries) },
    { label: "Recent inquiries", value: normalizeText(summary.InquiriesDuringLast6Months) },
    { label: "Public records", value: normalizeText(summary.PublicRecordsCount) },
    { label: "Past due", value: formatCurrencyLike(summary.PastDueAmount) },
    { label: "Revolving balance", value: formatCurrencyLike(summary.RevolvingBalance) },
    { label: "Available %", value: normalizeText(summary.RevolvingAvailablePercent) ? `${normalizeText(summary.RevolvingAvailablePercent)}%` : "" },
  ].filter((field) => field.value);
  if (profileFields.length) {
    sections.push({ key: "profile", title: "Profile summary", fields: profileFields });
  }

  const scoreFields = [
    { label: "Score", value: normalizeText(riskModel.Score) },
    { label: "Model", value: readDescriptor(riskModel.ModelIndicator) },
    { label: "Evaluation", value: readDescriptor(riskModel.Evaluation) },
    { label: "Factor 1", value: normalizeText(riskModel.ScoreFactorCodeOne) },
    { label: "Factor 2", value: normalizeText(riskModel.ScoreFactorCodeTwo) },
    { label: "Factor 3", value: normalizeText(riskModel.ScoreFactorCodeThree) },
    { label: "Factor 4", value: normalizeText(riskModel.ScoreFactorCodeFour) },
  ].filter((field) => field.value);
  if (scoreFields.length) {
    sections.push({ key: "score", title: "Risk model", fields: scoreFields });
  }

  if (background) {
    const backgroundFields = [
      { label: "Status", value: normalizeText(background.status) || normalizeText(background.success) },
      { label: "Criminal records", value: String(readArray(readObject(background.criminalReport)?.records).length || 0) },
      { label: "Eviction records", value: String(readArray(readObject(background.evictionReport)?.records).length || 0) },
      { label: "Message", value: normalizeText(readObject(background.error)?.Message) || normalizeText(readObject(background.error)?.message) },
    ].filter((field) => field.value && field.value !== "0");
    if (backgroundFields.length) {
      sections.push({ key: "background", title: "Background data", fields: backgroundFields });
    }
  }

  return sections;
}