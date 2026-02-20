type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export function isCreditAiConfigured() {
  return Boolean((process.env.CREDIT_AI_BASE_URL || "").trim() && (process.env.CREDIT_AI_API_KEY || "").trim());
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
  const baseUrl = (process.env.CREDIT_AI_BASE_URL || "").trim();
  const apiKey = (process.env.CREDIT_AI_API_KEY || "").trim();
  const resolvedModel = (model || process.env.CREDIT_AI_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";

  // Dev-friendly fallback so the credit UI works without configuring an AI provider.
  if (!baseUrl || !apiKey) {
    return [
      "[AI not configured for credit. Set CREDIT_AI_BASE_URL and CREDIT_AI_API_KEY in .env.local]",
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

  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Credit AI request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as OpenAIChatResponse;
  return data.choices?.[0]?.message?.content ?? "";
}
