# Pura AI-only guardrail

Read this before making any change that affects Pura replies, Pura chat flows, or user-facing Pura assistant text.

## Non-negotiable rule
- Pura is an AI assistant.
- Do not add deterministic assistant bubble copy, deterministic action summaries, or hard-coded user-facing verbiage for Pura.
- Do not add “fallback” reply branches that bypass AI-generated wording unless the user explicitly asks for that behavior.

## What this means in code
- Do not add or reintroduce action-specific deterministic text renderers for Pura responses.
- Do not hard-code reply strings in Pura chat orchestration when an AI-generated reply should be used instead.
- If an action succeeds, pass the real action result to the AI summarizer rather than formatting your own canned success copy.
- If an action fails, pass the failure context to the AI summarizer rather than formatting your own canned failure copy.

## Allowed exceptions
- Internal identifiers, scheduling envelopes, structured machine-readable payloads, and non-user-facing execution metadata can stay deterministic when needed for system behavior.
- Safety, auth, validation, and machine-only routing logic may still be deterministic.

## Before you finish a Pura change
- Check that no new user-facing Pura reply text is hard-coded.
- Check that no deterministic assistant-text helper is being called for Pura chat output.
- Prefer live regression validation over assuming wording paths behave as expected.