type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export async function generateText({
  system,
  user,
  model,
}: {
  system?: string;
  user: string;
  model?: string;
}): Promise<string> {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const resolvedModel = model ?? process.env.AI_MODEL ?? "gpt-4o-mini";

  // Dev-friendly fallback so the UI works without configuring an AI provider.
  if (!baseUrl || !apiKey) {
    return [
      "(AI not configured — set AI_API_KEY in .env.local)",
      "",
      "Quick opener:",
      "Hey {{business_name}}, this is {{your_name}} — quick question.",
      "",
      "Value hook:",
      "We help {{niche}} businesses book more qualified appointments without adding admin work.",
      "",
      "Discovery:",
      "1) How are you currently getting leads?",
      "2) What’s your close rate on inbound vs outbound?",
      "3) If you could add 10 appointments next month, could you handle it?",
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
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as OpenAIChatResponse;
  return data.choices?.[0]?.message?.content ?? "";
}
