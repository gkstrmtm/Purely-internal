import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DEBUG_LOG_PATH = path.join(process.cwd(), "tmp", "ai-outbound-manual-call-webhooks.jsonl");

function safeValue(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

export async function appendAiOutboundManualCallWebhookLog(entry: {
  route: string;
  token?: string | null;
  manualCallId?: string | null;
  callSid?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    await mkdir(path.dirname(DEBUG_LOG_PATH), { recursive: true });
    const details = Object.fromEntries(
      Object.entries(entry.details || {}).map(([key, value]) => [key, safeValue(value)]),
    );
    const line = JSON.stringify({
      at: new Date().toISOString(),
      route: safeValue(entry.route),
      token: safeValue(entry.token),
      manualCallId: safeValue(entry.manualCallId),
      callSid: safeValue(entry.callSid),
      details,
    });
    await appendFile(DEBUG_LOG_PATH, `${line}\n`, "utf8");
  } catch {
    // ignore logging failures
  }
}
