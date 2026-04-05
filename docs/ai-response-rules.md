# AI Response Rules (Prompt-Driven)

This doc is a standing contract for this codebase.

## Non-negotiables

- This system is a **literal ChatGPT wrapper**.
  - The server sends conversation context to the model.
  - The model decides what to say.
  - The model decides when to request tool calls.
- **Do not hard-code assistant responses.**
  - No deterministic templates like "Action / Status / Result" cards.
  - No scripted fallback messages to break loops.
  - No "if X then say Y" logic intended to shape the assistant’s wording.
- If the assistant’s *behavior* or *writing style* is wrong, fix it via **prompting**.
  - Adjust system/developer prompt instructions.
  - Adjust tool descriptions / cheat-sheets given to the model.
  - Adjust what tool results are passed back to the model.

## Tool calling & summaries

- Tool execution is driven by the model’s decision output (e.g., a JSON tool-call envelope).
- After tools run, the model is asked to write a **normal chat reply**.
  - Prefer short paragraphs.
  - Avoid headings, tables, and report-style bullet dumps unless the user explicitly asks.
  - Do not echo raw tool payloads.

## Clarifying questions & confirmations

- If required args are missing, the model should ask **one** focused clarifying question.
- For sensitive actions, the system should require explicit user confirmation.
  - The *gating* can be enforced by the server.
  - The *wording* of the assistant should remain model-authored.

## What is allowed to be deterministic

Deterministic logic is allowed only for:

- Persistence (threads/messages), redaction, and safety filtering.
- Tool execution plumbing (run tool X with args Y).
- Confirmation gating (block execution until the user confirms).
- UI affordances (redo/edit semantics, button availability).

But deterministic logic must **not** be used to manufacture assistant prose.

## Where prompts live

- API wrapper prompts: `src/app/api/portal/ai-chat/threads/[threadId]/messages/route.ts`
- Scheduled summaries: `src/lib/portalAiChatScheduled.ts`

If you’re about to add "just a small hard-coded message" to make something look nicer, stop and change the prompt instead.
