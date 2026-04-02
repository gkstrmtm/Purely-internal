export type CreditScope = "PERSONAL" | "BUSINESS" | "BOTH";
export type CreditReportAuditTag = "PENDING" | "NEGATIVE" | "POSITIVE";

export type CreditBureauScore = {
  bureau: string;
  score: number;
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
  const bureauScoresSource = readObject(raw.bureauScores) || readObject(profile.bureauScores) || {};

  const bureauScores = Object.entries(bureauScoresSource)
    .map(([bureau, score]) => ({ bureau: bureauLabel(bureau), score: findNumber(score) }))
    .filter((entry): entry is CreditBureauScore => Boolean(entry.bureau) && entry.score !== null)
    .map((entry) => ({ bureau: entry.bureau, score: clamp(entry.score, 300, 850) }))
    .sort((a, b) => a.bureau.localeCompare(b.bureau));

  const scoreCandidates = [
    findNumber(raw.currentScore),
    findNumber(profile.currentScore),
    findNumber(raw.score),
    findNumber(profile.score),
  ].filter((value): value is number => value !== null);

  const bureauAverage = bureauScores.length
    ? Math.round(bureauScores.reduce((sum, entry) => sum + entry.score, 0) / bureauScores.length)
    : null;

  const currentScore = scoreCandidates[0] ?? bureauAverage ?? (items.length ? estimateCreditScoreFromItems(items) : null);
  const targetScore = clamp(
    findNumber(raw.targetScore) ?? findNumber(profile.targetScore) ?? ((currentScore ?? 640) + 55),
    580,
    850,
  );
  const utilizationPercent = clamp(
    findNumber(raw.utilizationPercent) ?? findNumber(profile.utilizationPercent) ?? findNumber(profile.utilization) ?? 0,
    0,
    100,
  );
  const goals = [
    ...readStringArray(raw.goals),
    ...readStringArray(profile.goals),
  ].filter((goal, index, all) => all.indexOf(goal) === index).slice(0, 5);

  const openDisputes =
    findNumber(raw.openDisputes) ??
    findNumber(profile.openDisputes) ??
    items.filter((item) => {
      const disputeStatus = normalizeText(item.disputeStatus).toLowerCase();
      return disputeStatus.includes("open") || disputeStatus.includes("follow") || disputeStatus.includes("pending");
    }).length;

  const nextMilestone =
    normalizeText(raw.nextMilestone) ||
    normalizeText(profile.nextMilestone) ||
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