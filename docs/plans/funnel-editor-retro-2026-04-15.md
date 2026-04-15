# Funnel Editor Retro - 2026-04-15

Related code commit: `ab58c11f` (`Refactor funnel editor draft and preview flows`)

## What happened

The funnel editor started from a broken state where the page could get stuck loading, builder mode and whole-page mode behaved like different products, and AI/page export flows were mutating the wrong HTML state.

From there, the work expanded into a larger cleanup of the editing model:

- restored the missing active funnel editor types so the editor would load again
- introduced `draftHtml` so AI and whole-page edits can stay staged instead of overwriting published `customHtml`
- added a publish route so staged whole-page HTML can be promoted intentionally
- made builder and whole-page preview operate against the same served-page source when HTML exists
- added editor-safe preview placeholders for live embeds so form and calendar iframes do not break the in-editor surface
- fixed undo/redo coverage so draft HTML changes are included in page history
- improved AI routing so vague visual prompts, local readability fixes, and redesign requests are handled differently
- made builder quick-add semantics honest: page sections insert in page flow, while smaller blocks insert relative to the current selection
- rewrote the builder rail copy and page map so it explains selection, page-flow anchors, and add destinations more clearly

## Why this mattered

The real problem was not just visual polish. The editor was lying about what surface the user was editing.

The main corrections in this pass were:

- one page, not separate fake builder vs whole-page realities
- staged draft state for AI/page HTML instead of immediately treating generated HTML as published
- explicit insertion rules in the builder so "add" behavior matches what the UI says

## Known follow-ups

- the migration for `draftHtml` exists but still needs to be applied in the target database
- the saved repro task in `tmp/` is stale, so automated local runtime verification could not be completed from the existing task setup
- there are still non-functional Tailwind shorthand suggestions in the editor file, but no remaining functional diagnostics from this pass
- unrelated worktree changes were intentionally left out of the code commit

## Commit scope

The code commit covered funnel-editor-specific files only:

- Prisma schema + migration for `draftHtml`
- funnel page PATCH/export/generate/publish routes
- funnel builder create defaults
- funnel editor client behavior, rail semantics, preview flow, and history handling
- block renderer preview placeholder support