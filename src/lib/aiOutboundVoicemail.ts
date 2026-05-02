import { formatPhoneForDisplay } from "@/lib/phone";

function escapeXml(text: string): string {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeVoicemailGoal(goal: unknown): string {
  const value = typeof goal === "string"
    ? goal
        .trim()
        .replace(/\b(?:real\s+quick|really\s+quick)\b/gi, "")
        .replace(/\band\s+see\s+what\s+happened\b/gi, "")
        .replace(/\s+/g, " ")
        .replace(/[.]+$/g, "")
        .trim()
    : "";
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").slice(0, 80);
  if (!compact) return "";
  if (/^follow(?:ing)?\s+up\b/i.test(compact)) return ` ${compact.charAt(0).toUpperCase()}${compact.slice(1)}.`;
  if (/^(book|rebook|check|confirm|schedule|help|review|discuss)\b/i.test(compact)) return ` Calling to ${compact}.`;
  return ` Calling about ${compact}.`;
}

export function fallbackTwiml(message?: string) {
  const safe = String(message || "").trim().slice(0, 300);
  const say = safe ? `  <Say voice="Polly.Joanna">${escapeXml(safe)}</Say>\n` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${say}  <Hangup/>\n</Response>`;
}

export function buildAiOutboundVoicemailTwiml(identity?: {
  businessName?: string | null;
  ownerName?: string | null;
  goal?: string | null;
  callbackNumber?: string | null;
}) {
  const businessName = String(identity?.businessName || "").trim() || "Purely Automation";
  const ownerName = String(identity?.ownerName || "").trim();
  const callbackNumber = String(identity?.callbackNumber || "").trim();
  const callbackDisplay = callbackNumber ? formatPhoneForDisplay(callbackNumber) : "";
  const caller = ownerName ? `${ownerName} from ${businessName}` : `the team at ${businessName}`;
  const goalLead = normalizeVoicemailGoal(identity?.goal);
  return fallbackTwiml(
    callbackDisplay
      ? `Hi, this is ${caller}.${goalLead} Please call or text me back at ${callbackDisplay}. Thanks.`
      : `Hi, this is ${caller}.${goalLead} Please call or text us back when you can. Thanks.`,
  );
}

export function indicatesMachineAnswered(raw: unknown): boolean {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return value.startsWith("machine") || value === "fax";
}
