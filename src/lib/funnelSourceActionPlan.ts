export type SourceActionPlanPriority = "primary" | "secondary" | "optional";
export type SourceActionPlanExecutionMode = "bounded-edit" | "model-led";
export type SourceActionPlanConfidence = "high" | "medium" | "low";

export type SourceActionPlanMove = {
  key: string;
  target: string;
  change: string;
  why: string;
  priority: SourceActionPlanPriority;
  executionMode: SourceActionPlanExecutionMode;
  confidence: SourceActionPlanConfidence;
  selectorHint?: string;
  diff?: string[];
};

export type SourceActionPlan = {
  summary: string;
  moves: SourceActionPlanMove[];
  watchouts: string[];
};

function cleanString(value: unknown, maxLen: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function cleanPriority(value: unknown): SourceActionPlanPriority {
  return value === "secondary" || value === "optional" ? value : "primary";
}

function cleanExecutionMode(value: unknown): SourceActionPlanExecutionMode {
  if (value === "deterministic" || value === "bounded-edit") return "bounded-edit";
  return "model-led";
}

function cleanConfidence(value: unknown): SourceActionPlanConfidence {
  return value === "high" || value === "low" ? value : "medium";
}

export function sanitizeSourceActionPlanMove(raw: unknown): SourceActionPlanMove | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const key = cleanString(record.key, 80);
  const target = cleanString(record.target, 160);
  const change = cleanString(record.change, 280);
  const why = cleanString(record.why, 220);
  if (!key || !target || !change || !why) return null;
  const selectorHint = cleanString(record.selectorHint, 160);
  const diff = Array.isArray(record.diff)
    ? record.diff.map((item) => cleanString(item, 180)).filter(Boolean).slice(0, 4)
    : [];

  return {
    key,
    target,
    change,
    why,
    priority: cleanPriority(record.priority),
    executionMode: cleanExecutionMode(record.executionMode),
    confidence: cleanConfidence(record.confidence),
    ...(selectorHint ? { selectorHint } : {}),
    ...(diff.length ? { diff } : {}),
  };
}

export function sanitizeSourceActionPlan(raw: unknown): SourceActionPlan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const summary = cleanString(record.summary, 220);
  const moves = Array.isArray(record.moves)
    ? record.moves.map((item) => sanitizeSourceActionPlanMove(item)).filter(Boolean) as SourceActionPlanMove[]
    : [];
  const watchouts = Array.isArray(record.watchouts)
    ? record.watchouts.map((item) => cleanString(item, 180)).filter(Boolean).slice(0, 5)
    : [];

  if (!summary || !moves.length) return null;

  return {
    summary,
    moves: moves.slice(0, 5),
    watchouts,
  };
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ? fenced[1].trim() : text;
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function extractSourceActionChatPayload(raw: string): { assistantText: string; sourceActionPlan: SourceActionPlan | null } | null {
  const parsed = extractJsonObject(raw);
  if (!parsed) return null;
  const assistantText = cleanString(parsed.assistantText, 2400);
  if (!assistantText) return null;
  return {
    assistantText,
    sourceActionPlan: sanitizeSourceActionPlan(parsed.sourceActionPlan),
  };
}

export function readLatestSourceActionPlan(chatJson: unknown): SourceActionPlan | null {
  if (!Array.isArray(chatJson)) return null;
  for (let index = chatJson.length - 1; index >= 0; index -= 1) {
    const item = chatJson[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const plan = sanitizeSourceActionPlan((item as Record<string, unknown>).sourceActionPlan);
    if (plan) return plan;
  }
  return null;
}

export function buildSourceActionPlanPromptBlock(plan: SourceActionPlan | null, label = "SOURCE_ACTION_PLAN") {
  if (!plan) return "";
  return [
    `${label}:`,
    "```json",
    JSON.stringify(plan, null, 2),
    "```",
  ].join("\n");
}

export function mergeSourceActionPlans(primary: SourceActionPlan | null, fallback: SourceActionPlan | null): SourceActionPlan | null {
  if (!primary) return fallback;
  if (!fallback) return primary;

  const mergedMoves = [...primary.moves, ...fallback.moves].filter((move, index, items) => {
    return items.findIndex((candidate) => candidate.key === move.key || (candidate.target === move.target && candidate.change === move.change)) === index;
  });

  const watchouts = [...primary.watchouts, ...fallback.watchouts].filter((value, index, items) => items.indexOf(value) === index).slice(0, 5);

  return {
    summary: primary.summary || fallback.summary,
    moves: mergedMoves.slice(0, Math.max(primary.moves.length, fallback.moves.length, 3)),
    watchouts,
  };
}