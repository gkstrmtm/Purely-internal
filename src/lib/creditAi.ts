import { generateText } from "@/lib/ai";

export function isCreditAiConfigured() {
  return Boolean((process.env.AI_BASE_URL || "").trim() && (process.env.AI_API_KEY || "").trim());
}

export async function generateCreditText({
  system,
  user,
  model,
}: {
  system?: string;
  user: string;
  model?: string;
}): Promise<string> {
  if (!isCreditAiConfigured()) {
    return [
      "(AI not configured. Set AI_API_KEY in .env.local)",
      "",
      "Date: {{today}}",
      "",
      "To Whom It May Concern:",
      "",
      "I am writing to dispute inaccurate information appearing on my credit report.",
      "",
      "Items to dispute:",
      "- {{disputes}}",
      "",
      "Please investigate these items and remove or correct any inaccurate information in accordance with the Fair Credit Reporting Act.",
      "",
      "Sincerely,",
      "{{contact_name}}",
    ].join("\n");
  }

  return generateText({
    system,
    user,
    model: (model || process.env.AI_MODEL || "gpt-5.4").trim() || "gpt-5.4",
  });
}
