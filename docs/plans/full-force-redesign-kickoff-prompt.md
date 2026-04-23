# Full Force Redesign Kickoff Prompt

Use this in a new chat with the `Full Force Redesign` agent.

## Prompt

I need you to redesign the funnel builder's `Recent saved changes` sidebar module as a full information-model and UX problem, not as a local styling patch.

Target the owning surface in `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`.

This is the actual problem:

- The sidebar has been too request-driven instead of change-driven.
- It has been repeating the user's prompt or prompt-derived text instead of primarily showing what actually changed.
- It has been too bulky, too noisy, and too visually insistent.
- The design should be sleeker, more compressed, and more editorial.
- The most important thing is fast comprehension of progress: what changed, whether anything was saved, when it happened, and what someone can do next.

What I do **not** want:

- no full prompt echo in the recent-saved-changes sidebar
- no prompt-derived fallback copy unless there is absolutely no better outcome data
- no bulky cards
- no decorative color blocking
- no generic timeline UI
- no repetitive status + detail + request text all saying the same thing

What I **do** want:

- an outcome-first recent-changes module
- concise entries that tell me what actually happened
- strong hierarchy with less visual weight
- a clear distinction between:
  - saved change
  - no new saved result
  - needs input
  - restored version
- a sidebar that helps a user understand progress quickly without rereading their own request

You must audit the whole surface before editing, including:

- the main recent-saved-changes cards in the Activity rail
- the selected custom-code block's recent-saved-changes section
- helper functions that build labels, headlines, detail text, and fallbacks
- any tooltips, titles, or hidden metadata that may still leak the prompt
- any summary area that still says `Latest request` or otherwise frames the UI around the request instead of the saved result

Use the full-surface redesign approach, not incremental patching.

Specific context from prior work:

- A custom workspace agent exists at `.github/agents/full-force-redesign.agent.md` and is intended for this exact kind of task.
- Prior work already attempted to simplify the cards, but the failure mode was not fully conceptual: prompt-derived content leaked through secondary paths.
- The user explicitly wants the sidebar to summarize the changes and what happened, not reprint the request.
- The user explicitly rejected designs that got bulkier or louder.

Your job now:

1. map the full recent-saved-changes information flow in the owning module
2. identify every place prompt text or request-framing still leaks through
3. redesign the whole module around outcome, saved state, time, and next action
4. implement the redesign coherently across duplicate render paths
5. validate the edited slice

Acceptance criteria:

- the visible recent-saved-changes surfaces do not restate the full user prompt
- hover/tooltips/titles do not leak the full prompt either
- the UI feels slimmer and easier to scan than before
- the cards primarily communicate result, not request
- duplicate render paths feel aligned
- TypeScript and local diagnostics pass

If you find yourself making a small visual tweak without first fixing the information model, stop and widen the redesign.